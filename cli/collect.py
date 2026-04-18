"""
Azure data collector — lightweight, no web server required.
Auth: az login (default) or AZURE_* env vars / CLI args for service principal.
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Callable, List, Optional

from dotenv import load_dotenv

load_dotenv()


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class Resource:
    id: str
    name: str
    type: str
    rg: str
    location: str
    cost_curr: float = 0.0
    cost_prev: float = 0.0
    is_orphan: bool = False
    orphan_reason: str = ""


@dataclass
class AdvisorRec:
    resource_name: str
    resource_type: str
    rg: str
    category: str
    impact: str
    description: str
    savings: float = 0.0


@dataclass
class ReportData:
    sub_id: str
    sub_name: str
    scanned_at: datetime
    resources: List[Resource]
    advisor_recs: List[AdvisorRec]
    errors: List[str] = field(default_factory=list)

    @property
    def total_curr(self) -> float:
        return sum(r.cost_curr for r in self.resources)

    @property
    def total_prev(self) -> float:
        return sum(r.cost_prev for r in self.resources)

    @property
    def mom_pct(self) -> float:
        return ((self.total_curr - self.total_prev) / self.total_prev * 100) if self.total_prev else 0.0

    @property
    def orphans(self) -> List[Resource]:
        return [r for r in self.resources if r.is_orphan]

    @property
    def orphan_cost(self) -> float:
        return sum(r.cost_curr for r in self.orphans)

    @property
    def advisor_savings(self) -> float:
        return sum(r.savings for r in self.advisor_recs)

    @property
    def total_potential_savings(self) -> float:
        return self.orphan_cost + self.advisor_savings

    @property
    def cost_by_type(self) -> list:
        d: dict = {}
        for r in self.resources:
            t = r.type
            if t not in d:
                d[t] = {"count": 0, "curr": 0.0, "prev": 0.0}
            d[t]["count"] += 1
            d[t]["curr"] += r.cost_curr
            d[t]["prev"] += r.cost_prev
        return sorted(d.items(), key=lambda x: x[1]["curr"], reverse=True)


# ── Auth ───────────────────────────────────────────────────────────────────────

def get_credential(tenant_id: str = "", client_id: str = "", client_secret: str = ""):
    tid = tenant_id or os.getenv("AZURE_TENANT_ID", "")
    cid = client_id or os.getenv("AZURE_CLIENT_ID", "")
    sec = client_secret or os.getenv("AZURE_CLIENT_SECRET", "")
    if tid and cid and sec:
        from azure.identity import ClientSecretCredential
        return ClientSecretCredential(tenant_id=tid, client_id=cid, client_secret=sec)
    from azure.identity import AzureCliCredential
    return AzureCliCredential()


def list_subscriptions(credential) -> List[dict]:
    from azure.mgmt.subscription import SubscriptionClient
    client = SubscriptionClient(credential)
    return [
        {"id": s.subscription_id, "name": s.display_name}
        for s in client.subscriptions.list()
        if str(s.state).lower() == "enabled"
    ]


# ── Cost data via REST (avoids azure-mgmt-costmanagement dep) ─────────────────

def _query_costs(credential, sub_id: str, start: date, end: date) -> dict:
    """Returns {resource_id_lower: cost}. Silently returns {} on any failure."""
    try:
        token = credential.get_token("https://management.azure.com/.default").token
        url = (
            f"https://management.azure.com/subscriptions/{sub_id}"
            f"/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
        )
        body = json.dumps({
            "type": "ActualCost",
            "timeframe": "Custom",
            "timePeriod": {
                "from": start.strftime("%Y-%m-%dT00:00:00Z"),
                "to":   end.strftime("%Y-%m-%dT23:59:59Z"),
            },
            "dataset": {
                "granularity": "None",
                "grouping": [{"type": "Dimension", "name": "ResourceId"}],
                "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
            },
        }).encode()
        req = urllib.request.Request(url, data=body, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        props = data.get("properties", {})
        cols  = [c["name"].lower() for c in props.get("columns", [])]
        if "resourceid" not in cols or "cost" not in cols:
            return {}
        ri = cols.index("resourceid")
        ci = cols.index("cost")
        return {
            row[ri].lower(): float(row[ci])
            for row in props.get("rows", [])
            if row[ci]
        }
    except Exception:
        return {}


# ── Azure Advisor ──────────────────────────────────────────────────────────────

def _get_advisor_recs(credential, sub_id: str) -> List[AdvisorRec]:
    try:
        from azure.mgmt.advisor import AdvisorManagementClient
        client = AdvisorManagementClient(credential, sub_id)
        recs: List[AdvisorRec] = []
        for r in client.recommendations.list():
            src = (r.resource_metadata.source or "") if r.resource_metadata else ""
            rg  = src.split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in src else ""
            savings = 0.0
            if r.extended_properties:
                try:
                    savings = float(r.extended_properties.get("savingsAmount") or 0)
                except Exception:
                    pass
            recs.append(AdvisorRec(
                resource_name = src.split("/")[-1] if src else "Unknown",
                resource_type = r.impacted_value or "",
                rg            = rg,
                category      = str(r.category or "General"),
                impact        = str(r.impact or "Low"),
                description   = (r.short_description.problem or "") if r.short_description else "",
                savings       = savings,
            ))
        return sorted(recs, key=lambda x: x.savings, reverse=True)
    except Exception:
        return []


# ── Orphan detection ───────────────────────────────────────────────────────────

def _detect_orphans(credential, sub_id: str, res_map: dict) -> None:
    """Mutates Resource objects in res_map in place."""
    # Unattached managed disks
    try:
        from azure.mgmt.compute import ComputeManagementClient
        for disk in ComputeManagementClient(credential, sub_id).disks.list():
            if str(disk.disk_state or "").lower() == "unattached" and disk.id:
                r = res_map.get(disk.id.lower())
                if r:
                    r.is_orphan     = True
                    r.orphan_reason = "Unattached managed disk"
    except Exception:
        pass

    # Unused public IPs and NICs
    try:
        from azure.mgmt.network import NetworkManagementClient
        net = NetworkManagementClient(credential, sub_id)
        for ip in net.public_ip_addresses.list_all():
            if not ip.ip_configuration and ip.id:
                r = res_map.get(ip.id.lower())
                if r:
                    r.is_orphan     = True
                    r.orphan_reason = "Public IP not associated with any resource"
        for nic in net.network_interfaces.list_all():
            if not nic.virtual_machine and nic.id:
                r = res_map.get(nic.id.lower())
                if r:
                    r.is_orphan     = True
                    r.orphan_reason = "Network interface not attached to a VM"
    except Exception:
        pass


# ── Main entry point ───────────────────────────────────────────────────────────

def collect(
    credential,
    sub_id: str,
    sub_name: str = "",
    progress: Callable[[str], None] = lambda _: None,
) -> ReportData:
    errors: List[str] = []
    today  = date.today()

    # Date ranges
    curr_start = date(today.year, today.month, 1)
    prev_end   = curr_start - timedelta(days=1)
    prev_start = date(prev_end.year, prev_end.month, 1)

    # 1. Resources
    progress("Listing resources…")
    from azure.mgmt.resource import ResourceManagementClient
    rm = ResourceManagementClient(credential, sub_id)
    resources: List[Resource] = []
    res_map: dict = {}
    for r in rm.resources.list():
        res = Resource(
            id       = r.id or "",
            name     = r.name or "",
            type     = r.type or "",
            rg       = r.id.split("/resourceGroups/")[1].split("/")[0] if r.id and "/resourceGroups/" in r.id else "",
            location = r.location or "",
        )
        resources.append(res)
        if r.id:
            res_map[r.id.lower()] = res
    progress(f"  Found {len(resources)} resources")

    # 2. Cost data
    progress("Fetching cost data (current month)…")
    curr_costs = _query_costs(credential, sub_id, curr_start, today)
    if not curr_costs:
        errors.append("Cost data unavailable — ensure Cost Management Reader role is assigned.")
    progress("Fetching cost data (previous month)…")
    prev_costs = _query_costs(credential, sub_id, prev_start, prev_end)

    for res in resources:
        res.cost_curr = curr_costs.get(res.id.lower(), 0.0)
        res.cost_prev = prev_costs.get(res.id.lower(), 0.0)

    # 3. Azure Advisor
    progress("Fetching Advisor recommendations…")
    advisor_recs = _get_advisor_recs(credential, sub_id)
    progress(f"  Found {len(advisor_recs)} recommendations")

    # 4. Orphan detection
    progress("Detecting orphaned resources…")
    _detect_orphans(credential, sub_id, res_map)
    orphan_count = sum(1 for r in resources if r.is_orphan)
    progress(f"  Found {orphan_count} orphaned resources")

    return ReportData(
        sub_id      = sub_id,
        sub_name    = sub_name,
        scanned_at  = datetime.utcnow(),
        resources   = resources,
        advisor_recs= advisor_recs,
        errors      = errors,
    )
