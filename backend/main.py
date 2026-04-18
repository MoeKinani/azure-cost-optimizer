"""
Azure Cost Optimization Tool — FastAPI Backend v3
Features: Cost Management · Monitor · Advisor · AI · Activity Log ·
          Carbon · Right-Sizing · Tag Compliance · SSE Streaming ·
          Settings API · Demo Mode · Multi-Subscription · Resource Group Filter
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import partial
from typing import Any, AsyncGenerator, Dict, List, Optional

import anthropic
from dotenv import load_dotenv
import pathlib

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.base import BaseHTTPMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from models.schemas import (
    AdvisorRecommendation, AppSettings, CostAnomaly, DashboardData,
    KPIData, OrphanResource, ResourceMetrics, ResourceTypeSummary,
    RightSizeOpportunity, SavingsRecommendation, ScoreDistribution,
    ScoreLabel, SubscriptionSummary, TrendDirection,
)
from services.cost_service     import get_two_month_costs, get_daily_costs, get_monthly_cost_history, get_total_daily_costs, get_reservation_covered_resource_ids
from services.metrics_service  import get_resource_metrics
from services.resource_service import list_all_resources, find_orphans, get_app_service_plan_links, get_vm_power_states, get_resource_locks, get_app_insights_links, get_vm_attachments, get_rbac_signals, get_reservation_coverage, get_reservation_recommendations, get_private_endpoint_targets, get_sql_replica_ids, get_app_service_details, get_backup_protected_ids, get_openai_deployments
from services.storage_access_service  import get_storage_access_signals
from services.keyvault_access_service import get_keyvault_signals
from services.advisor_service  import get_advisor_recommendations
from services.ai_service       import get_ai_verdicts, get_active_provider, get_ai_narrative
from services.scoring_service       import score_resource, estimate_savings, is_infrastructure_resource, get_safe_action_steps
from services.observability_service import get_data_confidence, should_suppress_idle_penalty
from services.activity_service import get_subscription_activity
from services.carbon_service   import estimate_carbon, carbon_equivalents
from services.rightsize_service import get_rightsize_recommendations, RightSizeRec
import services.settings_service as settings_svc

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Azure Cost Optimization API", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000", "http://localhost:80"],
    allow_credentials=True, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Authorization"],
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

app.add_middleware(SecurityHeadersMiddleware)

_cache: dict = {}
REQUIRED_TAGS = ["owner", "environment", "project", "cost-center"]

SCORE_COLORS = {
    ScoreLabel.NOT_USED:      "#ef4444",
    ScoreLabel.RARELY_USED:   "#f97316",
    ScoreLabel.ACTIVELY_USED: "#eab308",
    ScoreLabel.FULLY_USED:    "#22c55e",
    ScoreLabel.UNKNOWN:       "#6b7280",
}

RESOURCE_TYPE_DISPLAY: dict[str, str] = {
    "microsoft.compute/virtualmachines":              "Virtual Machines",
    "microsoft.compute/virtualmachinescalesets":      "VM Scale Sets",
    "microsoft.compute/disks":                        "Managed Disks",
    "microsoft.storage/storageaccounts":              "Storage Accounts",
    "microsoft.sql/servers/databases":                "SQL Databases",
    "microsoft.sql/servers/elasticpools":             "SQL Elastic Pools",
    "microsoft.dbformysql/flexibleservers":           "MySQL Flexible",
    "microsoft.dbformysql/servers":                   "MySQL",
    "microsoft.dbforpostgresql/flexibleservers":      "PostgreSQL Flexible",
    "microsoft.dbforpostgresql/servers":              "PostgreSQL",
    "microsoft.web/sites":                            "App Services / Functions",
    "microsoft.web/serverfarms":                      "App Service Plans",
    "microsoft.logic/workflows":                      "Logic Apps",
    "microsoft.cache/redis":                          "Redis Cache",
    "microsoft.documentdb/databaseaccounts":          "Cosmos DB",
    "microsoft.eventhub/namespaces":                  "Event Hubs",
    "microsoft.servicebus/namespaces":                "Service Bus",
    "microsoft.network/applicationgateways":          "App Gateways",
    "microsoft.network/loadbalancers":                "Load Balancers",
    "microsoft.network/publicipaddresses":            "Public IPs",
    "microsoft.network/virtualnetworkgateways":       "VPN Gateways",
    "microsoft.network/expressroutecircuits":         "ExpressRoute",
    "microsoft.network/frontdoors":                   "Front Door",
    "microsoft.cdn/profiles":                         "CDN",
    "microsoft.keyvault/vaults":                      "Key Vaults",
    "microsoft.containerservice/managedclusters":     "AKS Clusters",
    "microsoft.containerinstance/containergroups":    "Container Instances",
    "microsoft.containerregistry/registries":         "Container Registry",
    "microsoft.apimanagement/service":                "API Management",
    "microsoft.datafactory/factories":                "Data Factory",
    "microsoft.cognitiveservices/accounts":           "Cognitive Services",
    "microsoft.search/searchservices":                "AI Search",
    "microsoft.machinelearningservices/workspaces":   "ML Workspaces",
    "microsoft.synapse/workspaces":                   "Synapse Analytics",
    "microsoft.hdinsight/clusters":                   "HDInsight",
    "microsoft.databricks/workspaces":                "Databricks",
    "microsoft.devices/iothubs":                      "IoT Hubs",
    "microsoft.network/networksecuritygroups":        "NSGs",
    "microsoft.network/networkinterfaces":            "Network Interfaces",
    "microsoft.operationalinsights/workspaces":       "Log Analytics",
    "microsoft.signalrservice/signalr":               "SignalR",
}


RESOURCE_CATEGORIES: dict[str, str] = {
    # Compute
    "microsoft.compute/virtualmachines":           "compute",
    "microsoft.compute/virtualmachinescalesets":   "compute",
    "microsoft.compute/disks":                     "compute",
    "microsoft.web/sites":                         "compute",
    "microsoft.web/serverfarms":                   "compute",
    "microsoft.containerservice/managedclusters":  "compute",
    "microsoft.containerinstance/containergroups": "compute",
    # Storage
    "microsoft.storage/storageaccounts":           "storage",
    "microsoft.compute/snapshots":                 "storage",
    "microsoft.containerregistry/registries":      "storage",
    # Data / Databases
    "microsoft.sql/servers/databases":             "data",
    "microsoft.sql/servers/elasticpools":          "data",
    "microsoft.dbformysql/flexibleservers":        "data",
    "microsoft.dbforpostgresql/flexibleservers":   "data",
    "microsoft.documentdb/databaseaccounts":       "data",
    "microsoft.cache/redis":                       "data",
    "microsoft.synapse/workspaces":                "data",
    "microsoft.databricks/workspaces":             "data",
    # AI / ML
    "microsoft.cognitiveservices/accounts":        "ai",
    "microsoft.machinelearningservices/workspaces":"ai",
    "microsoft.search/searchservices":             "ai",
    "microsoft.openai":                            "ai",
    # Networking infrastructure
    "microsoft.network/virtualnetworks":           "infrastructure",
    "microsoft.network/networksecuritygroups":     "infrastructure",
    "microsoft.network/privateendpoints":          "infrastructure",
    "microsoft.network/privatednszones":           "infrastructure",
    "microsoft.network/dnszones":                  "infrastructure",
    "microsoft.network/routetables":               "infrastructure",
    "microsoft.network/networkwatchers":           "infrastructure",
    "microsoft.network/natgateways":               "infrastructure",
}


def _resource_category(resource_type: str) -> str:
    t = resource_type.lower()
    for prefix, cat in RESOURCE_CATEGORIES.items():
        if t.startswith(prefix):
            return cat
    return "other"


def _check_tag_compliance(tags: dict) -> list[str]:
    tag_keys = {k.lower() for k in tags}
    missing = []
    for req in REQUIRED_TAGS:
        if not any(req.replace("-", "") in tk.replace("-", "") for tk in tag_keys):
            missing.append(req)
    return missing


def _portal_url(resource_id: str) -> str:
    tenant = os.getenv("AZURE_TENANT_ID", "")
    return f"https://portal.azure.com/#@{tenant}/resource{resource_id}"


def _month_daily_arrays(
    daily_data: list[tuple[str, float]],
) -> tuple[list[float], list[float]]:
    """
    Returns (curr_month_daily, prev_month_daily) where:
      curr_month_daily — one cost per day from day 1 to today (current month)
      prev_month_daily — one cost per day for the full previous calendar month
    Both arrays are indexed from 0 = day 1 of that month.
    """
    now   = datetime.now(tz=timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    by_date = {d: c for d, c in daily_data}

    # Current month: day 1 … today
    curr = [
        round(by_date.get(f"{now.year}-{now.month:02d}-{day:02d}", 0.0), 4)
        for day in range(1, today.day + 1)
    ]

    # Previous month: full month
    first_of_this = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    last_of_prev  = first_of_this - timedelta(days=1)
    prev_year, prev_month, days_in_prev = last_of_prev.year, last_of_prev.month, last_of_prev.day
    prev = [
        round(by_date.get(f"{prev_year}-{prev_month:02d}-{day:02d}", 0.0), 4)
        for day in range(1, days_in_prev + 1)
    ]

    return curr, prev


def _sparkline_array(daily_data: list[tuple[str, float]], days: int = 30) -> list[float]:
    if not daily_data:
        return [0.0] * days
    by_date = {d: c for d, c in daily_data}
    # Anchor to today's UTC midnight so subtracting whole-day deltas never
    # lands on the wrong calendar date near end-of-day.
    now = datetime.now(tz=timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    return [
        round(by_date.get((today - timedelta(days=i)).strftime("%Y-%m-%d"), 0.0), 4)
        for i in range(days - 1, -1, -1)
    ]


def _7d_trend(daily_vals: list[float]) -> Optional[float]:
    if len(daily_vals) < 14:
        return None
    recent = sum(daily_vals[-7:]) / 7
    prior  = sum(daily_vals[-14:-7]) / 7
    if prior <= 0:
        return None
    return round((recent - prior) / prior * 100, 1)


# ── Cost Score KPI ────────────────────────────────────────────────────────────

def _compute_cost_score(
    orphan_cost:   float,
    not_used_cost: float,
    total_curr:    float,
    health_pct:    float,
    resources:     list,
) -> tuple:
    """Composite 0–100 cost-efficiency score across 5 weighted dimensions:
    orphan waste (25%), confirmed waste (25%), Azure Advisor (20%),
    reservation coverage (20%), resource health (10%).
    """
    base = max(total_curr, 0.01)

    # 1. Orphan efficiency (25%) — orphaned spend as % of total bill
    orphan_score  = max(0.0, 100.0 - (orphan_cost  / base) * 500.0)

    # 2. Waste efficiency (25%) — confirmed-waste spend as % of total bill
    waste_score   = max(0.0, 100.0 - (not_used_cost / base) * 400.0)

    # 3. Advisor compliance (20%) — weighted severity density per resource
    adv_h = sum(sum(1 for a in r.advisor_recommendations if a.impact == "High")   for r in resources)
    adv_m = sum(sum(1 for a in r.advisor_recommendations if a.impact == "Medium") for r in resources)
    adv_l = sum(sum(1 for a in r.advisor_recommendations if a.impact == "Low")    for r in resources)
    density       = (adv_h * 3 + adv_m * 2 + adv_l) / max(1, len(resources))
    advisor_score = max(0.0, 100.0 - density * 40.0)

    # 4. Reservation coverage (20%) — cost covered by RIs / total RI-eligible cost
    eligible_res = [r for r in resources if r.ri_eligible]
    if eligible_res:
        elig_cost = sum(r.cost_current_month for r in eligible_res)
        cov_cost  = sum(r.cost_current_month for r in eligible_res if r.ri_covered)
        ri_score  = (cov_cost / max(elig_cost, 0.01)) * 100.0
    else:
        ri_score  = 75.0   # neutral — nothing is RI-eligible

    # 5. Resource health (10%) — % actively/fully used
    health_score = health_pct

    composite = (
        orphan_score  * 0.25 +
        waste_score   * 0.25 +
        advisor_score * 0.20 +
        ri_score      * 0.20 +
        health_score  * 0.10
    )
    composite = round(min(max(composite, 0.0), 100.0), 1)

    if   composite >= 85: grade, label = "A", "Excellent"
    elif composite >= 70: grade, label = "B", "Good"
    elif composite >= 55: grade, label = "C", "Fair"
    elif composite >= 40: grade, label = "D", "Poor"
    else:                 grade, label = "F", "Critical"

    return composite, grade, label, {
        "orphans":      round(orphan_score,  1),
        "waste":        round(waste_score,   1),
        "advisor":      round(advisor_score, 1),
        "reservations": round(ri_score,      1),
        "health":       round(health_score,  1),
    }


# ── Core build function ────────────────────────────────────────────────────────

async def _build_dashboard(
    refresh: bool,
    progress_cb=None,
    resource_group_filter: Optional[str] = None,
) -> DashboardData:

    async def report(step: str, msg: str, pct: int):
        if progress_cb:
            await progress_cb({"type": "progress", "step": step, "message": msg, "pct": pct})

    loop     = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=10)
    cfg      = settings_svc.get()
    sub_ids  = settings_svc.get_subscription_ids()

    def _fetch_subscription_names(ids: list[str]) -> dict[str, str]:
        try:
            from azure.mgmt.subscription import SubscriptionClient
            from services.azure_auth import get_credential
            client = SubscriptionClient(get_credential())
            return {s.subscription_id: s.display_name for s in client.subscriptions.list()
                    if s.subscription_id in ids}
        except Exception:
            return {}

    # Apply scan scope defaults (for testing/validation) when no explicit filter passed.
    # None  = caller did not specify a filter → apply scope defaults if configured.
    # ""    = caller explicitly selected "All" → clear any scope override.
    scope_sub = settings_svc.get_value("SCAN_SCOPE_SUBSCRIPTION_ID", "").strip()
    scope_rg  = settings_svc.get_value("SCAN_SCOPE_RESOURCE_GROUP",  "").strip()
    if scope_sub and resource_group_filter is None:
        sub_ids = [scope_sub] if scope_sub in sub_ids or not sub_ids else [scope_sub]
    if scope_rg and resource_group_filter is None:
        resource_group_filter = scope_rg

    scope_active = bool(scope_sub or scope_rg)

    # Auto-wipe credentials if timeout has elapsed (SEC1)
    if settings_svc.check_and_wipe_if_expired():
        raise EnvironmentError(
            "Credentials have been automatically cleared after the configured timeout. "
            "Please re-enter your service principal credentials in Settings."
        )

    await report("resources", f"Listing resources across {len(sub_ids)} subscription(s)…", 5)

    resources_task      = loop.run_in_executor(executor, partial(list_all_resources, sub_ids))
    costs_task          = loop.run_in_executor(executor, partial(get_two_month_costs, sub_ids))
    advisor_task        = loop.run_in_executor(executor, partial(get_advisor_recommendations, sub_ids))
    daily_task          = loop.run_in_executor(executor, partial(get_daily_costs, 60, sub_ids))
    monthly_hist_task   = loop.run_in_executor(executor, partial(get_monthly_cost_history, 6, sub_ids))
    total_daily_task    = loop.run_in_executor(executor, partial(get_total_daily_costs, sub_ids))
    sub_names_task      = loop.run_in_executor(executor, partial(_fetch_subscription_names, sub_ids))

    await report("costs", f"Fetching 2 months of cost data across {len(sub_ids)} subscription(s)…", 15)

    resources, (curr_costs, prev_costs, cost_fetch_error), advisor_map, daily_costs_raw, monthly_hist_raw, (total_daily_cm, total_daily_pm), sub_names = await asyncio.gather(
        resources_task, costs_task, advisor_task, daily_task, monthly_hist_task, total_daily_task, sub_names_task
    )

    # Credentials successfully used — reset the inactivity timer (SEC1)
    settings_svc.touch_credential_use()

    # Apply resource group filter if set
    if resource_group_filter:
        resources = [r for r in resources if r["resource_group"].lower() == resource_group_filter.lower()]

    await report("activity", "Querying activity logs…", 28)
    activity_map, asp_links, ai_links, app_detail_map = await asyncio.gather(
        loop.run_in_executor(executor, partial(get_subscription_activity,   sub_ids)),
        loop.run_in_executor(executor, partial(get_app_service_plan_links,  sub_ids)),
        loop.run_in_executor(executor, partial(get_app_insights_links,      resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_app_service_details,     resources, sub_ids)),
    )

    # Stamp server_farm_id onto each web app resource so the frontend can group apps under plans
    for r in resources:
        if r["type"] == "microsoft.web/sites":
            r["server_farm_id"] = asp_links.get(r["id"].lower())
            # Stamp A1–A8 app service detail fields
            detail = app_detail_map.get(r["id"].lower(), {})
            for key in ("app_kind", "runtime_stack", "last_modified", "custom_domain_count",
                        "health_check_enabled", "health_check_path", "ssl_expiry_date",
                        "slot_count", "has_linked_storage", "app_state"):
                r[key] = detail.get(key)

    await report("orphans", f"Checking {len(resources)} resources for orphans…", 35)
    orphan_results, (vm_power_map, vm_size_map), lock_set, vm_attachments, backup_ids = await asyncio.gather(
        loop.run_in_executor(executor, partial(find_orphans, resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_vm_power_states, resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_resource_locks, sub_ids)),
        loop.run_in_executor(executor, partial(get_vm_attachments, resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_backup_protected_ids, resources, sub_ids)),
    )
    orphan_map: dict[str, str] = dict(orphan_results)
    (storage_signals, kv_signals, rbac_map,
     ri_coverage_result, pe_targets, sql_replicas,
     reservation_recommendations,
     billing_covered_ids) = await asyncio.gather(
        loop.run_in_executor(executor, partial(get_storage_access_signals,              resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_keyvault_signals,                    resources, sub_ids)),
        loop.run_in_executor(executor, partial(get_rbac_signals,                        sub_ids)),
        loop.run_in_executor(executor, partial(get_reservation_coverage,                sub_ids)),
        loop.run_in_executor(executor, partial(get_private_endpoint_targets,            sub_ids)),
        loop.run_in_executor(executor, partial(get_sql_replica_ids,         resources,  sub_ids)),
        loop.run_in_executor(executor, partial(get_reservation_recommendations,         sub_ids)),
        loop.run_in_executor(executor, partial(get_reservation_covered_resource_ids,    sub_ids)),
    )
    ri_covered_set, active_reservations = ri_coverage_result
    # Stamp power_state and VM size onto VM resources for display
    for r in resources:
        if r["type"] == "microsoft.compute/virtualmachines":
            vid = r["id"].lower()
            r["power_state"] = vm_power_map.get(vid, "unknown")
            vm_size = vm_size_map.get(vid)
            if vm_size:
                r["sku"] = vm_size
    # Stamp has_lock onto all resources.
    # has_lock = True ONLY when the resource itself has a direct lock.
    # RG/subscription-level locks are captured as has_inherited_lock which
    # contributes to is_protected (prevents "Not Used") but does NOT floor
    # the score at 60 — that floor is reserved for explicitly locked resources.
    for r in resources:
        rid_lower  = r["id"].lower()
        rg_prefix  = "/".join(rid_lower.split("/")[:5])
        sub_prefix = "/".join(rid_lower.split("/")[:3])
        r["has_lock"]          = rid_lower  in lock_set
        r["has_inherited_lock"] = (rg_prefix in lock_set or sub_prefix in lock_set)

    await report("metrics", f"Pulling 30-day metrics for {len(resources)} resources…", 42)
    BATCH = 20
    all_metrics: dict[str, Any] = {}

    async def fetch_batch(batch):
        tasks = [loop.run_in_executor(executor, partial(
            get_resource_metrics, r["id"], r["type"], r.get("subscription_id", "")
        )) for r in batch]
        for r, res in zip(batch, await asyncio.gather(*tasks, return_exceptions=True)):
            if not isinstance(res, Exception):
                all_metrics[r["id"].lower()] = res

    for i in range(0, len(resources), BATCH):
        await fetch_batch(resources[i: i + BATCH])

    # Sanity-check: if zero resources got any metrics data, the Monitor API is
    # almost certainly blocked by a missing 'Monitoring Reader' role assignment.
    # Surface this as a loud warning rather than silently producing all-Unknown scores.
    from services.observability_service import NATIVE_METRICS_TYPES
    native_rids = {
        r["id"].lower() for r in resources
        if r["type"].lower() in NATIVE_METRICS_TYPES
    }
    native_with_metrics = sum(
        1 for rid in native_rids
        if rid in all_metrics and all_metrics[rid].primary_utilization is not None
    )
    if native_rids and native_with_metrics == 0:
        logger.warning(
            "METRICS UNAVAILABLE: 0 of %d native-metrics resources returned any data. "
            "All resources will score as 'Unknown'. "
            "Most likely cause: the service principal is missing the 'Monitoring Reader' "
            "role on subscription %s. "
            "Assign it in Azure Portal > Subscriptions > Access Control (IAM).",
            len(native_rids),
            sub_ids[0] if sub_ids else "unknown",
        )

    # Merge App Insights metrics into linked web app metrics.
    # If a web app has low/no CPU metrics but its App Insights component shows
    # requests or active users, that is strong evidence the app is in use.
    for app_rid, ai_rid in ai_links.items():
        ai_metrics = all_metrics.get(ai_rid)
        if not ai_metrics:
            continue
        app_metrics = all_metrics.get(app_rid)
        if app_metrics is None:
            # Web app had no metrics at all — use App Insights as the primary source
            all_metrics[app_rid] = ai_metrics
        else:
            # Web app has some metrics — boost activity signal if App Insights shows traffic
            if ai_metrics.has_any_activity:
                app_metrics.has_any_activity = True
            # Use App Insights request count as primary utilization if it's stronger
            if ai_metrics.primary_utilization is not None:
                if app_metrics.primary_utilization is None or ai_metrics.primary_utilization > app_metrics.primary_utilization:
                    app_metrics.primary_utilization = ai_metrics.primary_utilization

    await report("scoring", "Scoring all resources…", 62)

    cost_floor = cfg.get("cost_floor_usd", 1.0)
    resource_dicts: list[dict] = []

    # ── S10: Auto-shutdown schedule detection ────────────────────────────────
    # Azure DevTest Labs auto-shutdown creates a free microsoft.devtestlab/schedules
    # resource named "shutdown-computevm-{vm-name}" in the same resource group.
    # VMs with a schedule are intentionally managed — never flag as Not Used.
    auto_shutdown_vms: set[str] = set()
    for r in resources:
        if r["type"] == "microsoft.devtestlab/schedules":
            sched_name = r["name"].lower()
            if sched_name.startswith("shutdown-computevm-"):
                vm_name = sched_name[len("shutdown-computevm-"):]
                auto_shutdown_vms.add(f"{vm_name}|{r['resource_group'].lower()}")

    # ── Partial month detection (B3) ────────────────────────────────────────
    # When today is the 1st–6th of the month, cost_current_month contains only
    # a fraction of normal monthly spend. Savings estimates derived from that
    # partial spend would be misleadingly small.
    # Use cost_previous_month as the savings baseline in this window.
    now = datetime.now(tz=timezone.utc)
    is_partial_month = now.day <= 6

    # Pre-compute last month's year/month for MTD delta calculation (used inside loop)
    _prev_year  = now.year if now.month > 1 else now.year - 1
    _prev_month = now.month - 1 if now.month > 1 else 12
    # Build the set of date strings covering last month days 1..now.day
    # e.g. today = April 6 → {"2026-03-01","2026-03-02",...,"2026-03-06"}
    _prev_mtd_dates = {
        f"{_prev_year}-{_prev_month:02d}-{day:02d}"
        for day in range(1, now.day + 1)
    }

    for r in resources:
        rid_lower = r["id"].lower()
        cost_curr = curr_costs.get(rid_lower, 0.0)
        cost_prev = prev_costs.get(rid_lower, 0.0)
        if cost_curr < cost_floor and cost_prev < cost_floor:
            continue

        # ── MTD-to-MTD delta (the only fair comparison during a live month) ───
        # Comparing April 1-6 ($33) to full March ($195) always shows a fake
        # ~83% drop. Instead compare April 1-6 to March 1-6 — same elapsed days.
        # cost_prev (full month) is kept for savings estimates and B3 logic.
        daily_data   = daily_costs_raw.get(rid_lower, [])
        cost_prev_mtd = sum(cost for date_str, cost in daily_data if date_str in _prev_mtd_dates)

        # Use MTD comparison when we have daily data for last month; fall back to
        # full-month delta if no daily data exists for last month's early days.
        if cost_prev_mtd > 0:
            cost_delta_pct = ((cost_curr - cost_prev_mtd) / cost_prev_mtd * 100)
            delta_is_mtd   = True
        else:
            cost_delta_pct = ((cost_curr - cost_prev) / cost_prev * 100) if cost_prev > 0 else 0.0
            delta_is_mtd   = False
        metrics        = all_metrics.get(rid_lower)
        util_pct       = metrics.primary_utilization if metrics else None
        has_activity   = metrics.has_any_activity    if metrics else False

        is_orphan     = rid_lower in orphan_map
        orphan_reason = orphan_map.get(rid_lower)

        activity          = activity_map.get(rid_lower)
        days_since        = activity.days_since_active if activity else None
        log_count         = activity.event_count       if activity else 0
        last_active       = activity.last_active_date  if activity else None
        recently_deployed = activity.recently_deployed if activity else False

        adv_recs    = advisor_map.get(rid_lower, [])
        adv_delta   = sum(rec.score_impact for rec in adv_recs if rec.category == "cost")
        adv_savings = sum(rec.potential_savings for rec in adv_recs if rec.potential_savings > 0)

        sparkline   = _sparkline_array(daily_data, 30)
        trend_7d    = _7d_trend(sparkline)
        daily_cm, daily_pm = _month_daily_arrays(daily_data)

        # Anomaly: last 7-day avg > 2× prior 23-day avg
        is_anomaly = False
        if len(sparkline) >= 14:
            recent_avg = sum(sparkline[-7:]) / 7
            older_avg  = sum(sparkline[-30:-7]) / max(len(sparkline[-30:-7]), 1)
            is_anomaly = older_avg > 0 and recent_avg > older_avg * 2.0

        resource_cat  = _resource_category(r["type"])
        is_infra      = is_infrastructure_resource(r["type"])

        data_conf, telem_src = get_data_confidence(
            r["type"], util_pct, has_activity, cost_curr,
        )

        # A deallocated VM has 0% CPU by design — do not treat it as idle/unused.
        # Its zero utilization is expected and intentional, not a signal of waste.
        vm_is_deallocated = r.get("power_state") in ("deallocated", "stopped")

        # idle_confirmed requires HIGH-confidence monitoring data.
        # Absence of metrics ≠ proof of idleness — only confirm idle when
        # Monitor data was actually fetched and shows no activity.
        idle_confirmed = (
            not has_activity
            and log_count == 0
            and not is_orphan
            and not vm_is_deallocated
            and data_conf == "high"
        )

        # ── S8: Recent deployment history ────────────────────────────────────
        # A resource deployed or updated via ARM/Bicep/Terraform in the last 30
        # days is actively maintained. Override idle signals — never flag as Not Used.
        if recently_deployed:
            has_activity   = True
            idle_confirmed = False

        # ── S10: Auto-shutdown schedule ───────────────────────────────────────
        # A VM with a DevTest Labs auto-shutdown schedule is intentionally managed
        # (dev/test VMs stopped nightly). Treat as actively used — never flag as waste.
        vm_has_auto_shutdown = (
            r["type"] == "microsoft.compute/virtualmachines"
            and f"{r['name'].lower()}|{r['resource_group'].lower()}" in auto_shutdown_vms
        )
        if vm_has_auto_shutdown:
            has_activity   = True
            idle_confirmed = False

        # S17: Intent/protection signals — track separately from usage signals.
        # These block deletion recommendations but must NOT set has_activity=True,
        # which would artificially inflate the utilization score. A VM with RBAC
        # but CPU=0% for 30 days should score low — it is protected, not active.
        is_protected      = False
        protection_reasons: list[str] = []

        # Direct lock on the resource itself → is_protected + score floor at 60 (handled in scorer)
        # Inherited RG/subscription lock → is_protected only (floor at 26, not 60)
        if r.get("has_lock", False):
            is_protected = True
            protection_reasons.append("resource lock")
        if r.get("has_inherited_lock", False):
            is_protected = True
            protection_reasons.append("resource group lock")

        # ── S7: Direct RBAC assignments ───────────────────────────────────────
        # RBAC = intent signal: someone explicitly granted access.
        # Prevents idle_confirmed penalty but does NOT boost utilization score.
        rbac_count = rbac_map.get(rid_lower, 0)
        if rbac_count > 0:
            idle_confirmed = False
            is_protected   = True
            protection_reasons.append(f"{rbac_count} RBAC assignment{'s' if rbac_count > 1 else ''}")

        # ── S16: Private endpoint target ──────────────────────────────────────
        # Private endpoint = intent signal: another resource consciously targets this one.
        # Prevents idle_confirmed penalty but does NOT boost utilization score.
        has_private_endpoint = rid_lower in pe_targets
        if has_private_endpoint:
            idle_confirmed = False
            is_protected   = True
            protection_reasons.append("private endpoint")

        # ── S15: Azure Backup coverage ────────────────────────────────────────
        # Backup policy = intent signal: someone set up protection for this resource.
        has_backup = rid_lower in backup_ids
        if has_backup:
            is_protected = True
            protection_reasons.append("backup policy")

        # ── S11: SQL geo-replica ───────────────────────────────────────────────
        # Replica = structural usage signal: it IS actively serving the primary.
        # This is real usage (replication traffic), not just intent — keep has_activity.
        is_sql_replica = rid_lower in sql_replicas
        if is_sql_replica:
            has_activity   = True
            idle_confirmed = False
            is_orphan      = False
            orphan_reason  = None

        # ── S3: Reservation / Savings Plan coverage ───────────────────────────
        # RI coverage = intent signal: customer has committed spend to this resource.
        # Prevents idle_confirmed penalty but does NOT boost utilization score.
        ri_coverage_key = f"{r['type']}|{(r.get('location') or '').lower().replace(' ', '')}"
        ri_covered = (
            ri_coverage_key in ri_covered_set
            or f"{r['type']}|*" in ri_covered_set
            or r["id"].lower() in billing_covered_ids
        )
        if ri_covered:
            idle_confirmed = False
            is_protected   = True
            protection_reasons.append("Reserved Instance")

        # ── Storage: last access time confirmation ────────────────────────────
        # If last access time tracking is enabled AND no transactions → confirmed unused.
        # If a lifecycle policy exists → actively managed, protect from Not Used.
        storage_signal = storage_signals.get(rid_lower)
        if storage_signal:
            if storage_signal.last_access_tracking_enabled and not has_activity:
                idle_confirmed = True
            if storage_signal.has_lifecycle_policy:
                # Lifecycle policy = someone actively manages this account
                has_activity = True

        # ── Key Vault: protection signals ─────────────────────────────────────
        # Purge-protected or infra-linked vaults are intentionally maintained.
        # Treat them like tagged production resources — floor at Actively Used.
        kv_signal = kv_signals.get(rid_lower)
        kv_is_protected = kv_signal.is_protected if kv_signal else False

        # Calculate actual resource age from creation date if available
        resource_age_days = 30  # fallback
        created_at_str = r.get("created_at", "")
        if created_at_str:
            try:
                created_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                resource_age_days = max(0, (datetime.now(tz=timezone.utc) - created_dt).days)
            except Exception:
                pass

        has_lock = r.get("has_lock", False)

        # Merge Key Vault protection into tags so the existing tag-guard in
        # score_resource() floors the score at Rarely Used (40) at minimum.
        effective_tags = dict(r.get("tags", {}))
        if kv_is_protected:
            effective_tags.setdefault("criticality", "high")

        peak_util_pct = metrics.peak_utilization if metrics else None

        # Use MTD-to-MTD cost comparison for trend detection — prevents IDLE/FALLING
        # misclassification from comparing partial current month to full prior month.
        _cost_prev_for_trend = cost_prev_mtd if cost_prev_mtd > 0 else cost_prev

        base, final, trend_mod, trend, label = score_resource(
            util_pct=util_pct, cost_current=cost_curr, cost_previous=_cost_prev_for_trend,
            is_orphan=is_orphan, advisor_score_delta=adv_delta,
            has_any_activity=has_activity, resource_age_days=resource_age_days,
            days_since_active=days_since, activity_log_count=log_count,
            idle_confirmed=idle_confirmed,
            is_infrastructure=is_infra,
            data_confidence=data_conf,
            tags=effective_tags,
            vm_is_deallocated=vm_is_deallocated,
            has_lock=has_lock,
            has_inherited_lock=r.get("has_inherited_lock", False),
            is_protected=is_protected,
            peak_util_pct=peak_util_pct,
        )
        # Partial month: use previous month as savings baseline so estimates
        # reflect a realistic full-month figure rather than 2–6 days of spend.
        if is_partial_month and cost_prev > 0:
            savings_basis = cost_prev
        elif is_partial_month and cost_curr > 0 and now.day > 0:
            savings_basis = round(cost_curr * (30.0 / now.day), 4)
        else:
            savings_basis = cost_curr

        savings, recommendation = estimate_savings(
            savings_basis, final, is_orphan, adv_savings,
            has_metrics=(util_pct is not None),
        )

        missing_tags = _check_tag_compliance(r.get("tags", {}))
        carbon       = estimate_carbon(r["type"], r.get("location", ""), r.get("sku"))

        # ── D2: Waste Age ─────────────────────────────────────────────────────
        # How long has this resource been idle and how much has it cost?
        # "Idle 47 days · $382 wasted since Jan 15" creates urgency that a score never does.
        idle_since_date      = None
        days_idle            = None
        cumulative_waste_usd = None

        is_waste_candidate = label in (ScoreLabel.NOT_USED, ScoreLabel.RARELY_USED) and not is_infra
        if is_waste_candidate:
            ref_date_str = last_active or created_at_str
            if ref_date_str:
                try:
                    ref_dt   = datetime.fromisoformat(ref_date_str.replace("Z", "+00:00"))
                    days_idle = max(0, (now - ref_dt).days)
                    idle_since_date = ref_dt.date().isoformat()
                    if days_idle > 0 and cost_curr > 0:
                        daily_rate = cost_curr / 30.0
                        cumulative_waste_usd = round(daily_rate * days_idle, 2)
                except Exception:
                    pass

        # ── S19: Workload pattern classification ──────────────────────────────
        # Classifies the resource usage pattern for display and AI context.
        workload_pattern: Optional[str] = None
        if is_orphan:
            workload_pattern = "inactive"
        elif peak_util_pct is not None and util_pct is not None and util_pct > 0 and peak_util_pct > max(3 * util_pct, 40.0):
            workload_pattern = "bursty"      # big spikes vs average → scheduled job / event-driven
        elif trend == TrendDirection.FALLING and util_pct is not None and util_pct < 20:
            workload_pattern = "declining"   # usage trending down → optimization candidate
        elif (util_pct is None or util_pct < 3) and not has_activity:
            workload_pattern = "inactive"    # nothing running
        elif util_pct is not None and util_pct < 20:
            workload_pattern = "steady_low"  # consistently low but something running
        elif util_pct is not None:
            workload_pattern = "normal"

        # ── S22: "Why NOT waste" explanation ─────────────────────────────────
        # Surfaces the highest-confidence reason a resource was kept, so users
        # trust clean scans as much as flagged ones.
        protection_reason: Optional[str] = None
        if label not in (ScoreLabel.NOT_USED,) or is_protected:
            if has_lock:
                protection_reason = "Protected — has resource lock"
            elif ri_covered:
                protection_reason = "Covered — Reserved Instance active"
            elif peak_util_pct is not None and peak_util_pct > 60:
                protection_reason = f"Active — peak utilization {peak_util_pct:.0f}% in last 30 days"
            elif recently_deployed:
                protection_reason = "Active — deployed or updated in last 30 days"
            elif metrics and metrics.raw_absolute:
                calls = (metrics.raw_absolute.get("TotalCalls") or
                         metrics.raw_absolute.get("Requests") or
                         metrics.raw_absolute.get("requests/count"))
                if calls and calls > 0:
                    protection_reason = f"Active — {int(calls):,} requests in last 30 days"
            if protection_reason is None and has_private_endpoint:
                protection_reason = "Protected — has private endpoint"
            if protection_reason is None and rbac_count > 0:
                protection_reason = f"Protected — {rbac_count} role assignment{'s' if rbac_count > 1 else ''} on this resource"
            if protection_reason is None and has_backup:
                protection_reason = "Protected — has backup policy"

        # RI / Savings Plan opportunity — rates by resource type (1yr, 3yr discount vs on-demand)
        # NOTE: azure ml *workspaces* are NOT reservable — only the compute instances/clusters
        # inside them are. Workspaces are excluded; users are directed to portal to reserve compute.
        _RI_RATES = {
            # Confirmed available in Azure Portal → Purchase Reservations
            "microsoft.compute/virtualmachines":             (0.37, 0.57),
            "microsoft.sql/servers/databases":               (0.33, 0.44),
            "microsoft.sql/managedinstances":                (0.33, 0.55),
            "microsoft.sql/servers/elasticpools":            (0.33, 0.44),
            "microsoft.web/serverfarms":                     (0.35, 0.55),
            "microsoft.cache/redis":                         (0.37, 0.55),
            "microsoft.cache/redisenterprise":               (0.37, 0.55),
            "microsoft.documentdb/databaseaccounts":         (0.24, 0.48),
            "microsoft.dbforpostgresql/flexibleservers":     (0.33, 0.50),
            "microsoft.dbformysql/flexibleservers":          (0.33, 0.50),
            "microsoft.databricks/workspaces":               (0.40, 0.60),
            "microsoft.synapse/workspaces":                  (0.40, 0.60),
            "microsoft.compute/disks":                       (0.20, 0.38),
            "microsoft.kusto/clusters":                      (0.22, 0.42),
            "microsoft.compute/dedicatedhosts":              (0.30, 0.45),
            "microsoft.avs/privateclouds":                   (0.28, 0.46),
            "microsoft.netapp/netappaccounts/capacitypools": (0.17, 0.31),
        }
        # Eligibility: any resource of an RI-eligible type that costs money and isn't
        # already covered. Score is NOT used as a gate — a resource incurring $200/mo
        # is a valid RI candidate regardless of utilisation data availability.
        # Orphans are excluded (structurally confirmed dead resources).
        # Score and label are still passed to the UI to drive the term recommendation
        # (3yr / 1yr / Verify) so the user can make an informed commitment decision.
        _ri_eligible = cost_curr > 50 and not ri_covered and not is_orphan
        _ri_rates    = _RI_RATES.get(r["type"]) if _ri_eligible else None
        ri_1yr = round(cost_curr * _ri_rates[0], 2) if _ri_rates else 0.0
        ri_3yr = round(cost_curr * _ri_rates[1], 2) if _ri_rates else 0.0

        portal_url = _portal_url(r["id"])
        cli_delete = f'az resource delete --ids "{r["id"]}" --verbose'
        cli_resize = ""

        resource_dicts.append({
            "resource_id": r["id"], "resource_name": r["name"],
            "resource_type": r["type"], "resource_group": r["resource_group"],
            "location": r.get("location",""), "sku": r.get("sku"),
            "cost_current_month": round(cost_curr, 4), "cost_previous_month": round(cost_prev, 4),
            "cost_previous_month_mtd": round(cost_prev_mtd, 4),
            "cost_delta_is_mtd": delta_is_mtd,
            "cost_delta_pct": round(cost_delta_pct, 2),
            "avg_cpu_pct":    round(metrics.cpu,    2) if metrics and metrics.cpu    is not None else None,
            "avg_memory_pct": round(metrics.memory, 2) if metrics and metrics.memory is not None else None,
            "avg_disk_pct":   round(metrics.disk,   2) if metrics and metrics.disk   is not None else None,
            "avg_network_pct":round(metrics.network,2) if metrics and metrics.network is not None else None,
            "primary_utilization_pct": round(util_pct, 2) if util_pct is not None else None,
            "has_any_activity": has_activity,
            "has_lock": has_lock,
            "has_inherited_lock": r.get("has_inherited_lock", False),
            "base_score": round(base, 2), "advisor_score_delta": adv_delta,
            "trend_modifier": trend_mod, "ai_score_adjustment": 0,
            "final_score": round(final, 2), "score_label": label, "trend": trend,
            "advisor_recommendations": [
                {"category":rec.category,"impact":rec.impact,
                 "short_description":rec.short_description,
                 "score_impact":rec.score_impact,"potential_savings":rec.potential_savings}
                for rec in adv_recs
            ],
            "ai_confidence": None, "ai_action": None, "ai_explanation": None,
            "last_active_date": last_active, "days_since_active": days_since,
            "activity_log_count": log_count, "idle_confirmed": idle_confirmed,
            "rightsize_sku": None, "rightsize_savings_pct": 0.0,
            "ri_1yr_monthly_savings": ri_1yr,
            "ri_3yr_monthly_savings": ri_3yr,
            "ri_eligible": bool(_ri_eligible and _ri_rates),
            "missing_tags": missing_tags,
            "carbon_kg_per_month": carbon,
            "portal_url": portal_url, "cli_delete_cmd": cli_delete, "cli_resize_cmd": cli_resize,
            "is_anomaly": is_anomaly,
            "daily_costs": sparkline, "cost_7d_trend_pct": trend_7d,
            "daily_costs_cm": daily_cm, "daily_costs_pm": daily_pm,
            "monthly_cost_history": monthly_hist_raw.get(rid_lower, []),
            "estimated_monthly_savings": savings, "recommendation": recommendation,
            "savings_basis": savings_basis,   # may differ from cost_current_month in partial-month window
            "is_orphan": is_orphan, "orphan_reason": orphan_reason,
            "subscription_id": r.get("subscription_id", sub_ids[0] if sub_ids else ""),
            "resource_category": resource_cat,
            "is_infrastructure": is_infra,
            "data_confidence":  data_conf,
            "telemetry_source": telem_src,
            "tags": r.get("tags", {}),
            "instance_count": r.get("instance_count"),
            "server_farm_id": r.get("server_farm_id"),
            "power_state": r.get("power_state"),  # VMs only: running/deallocated/stopped/unknown
            # A1–A8: App Service detail fields (web apps only)
            "app_kind":             r.get("app_kind"),
            "runtime_stack":        r.get("runtime_stack"),
            "last_modified":        r.get("last_modified"),
            "custom_domain_count":  r.get("custom_domain_count", 0),
            "health_check_enabled": r.get("health_check_enabled", False),
            "health_check_path":    r.get("health_check_path"),
            "ssl_expiry_date":      r.get("ssl_expiry_date"),
            "slot_count":           r.get("slot_count", 0),
            "has_linked_storage":   r.get("has_linked_storage", False),
            "app_state":            r.get("app_state"),
            "storage_last_access_tracking": storage_signal.last_access_tracking_enabled if storage_signal else False,
            "storage_has_lifecycle_policy":  storage_signal.has_lifecycle_policy          if storage_signal else False,
            # AI1–AI7: Cognitive Services / OpenAI token + billing signals
            # AI Foundry uses InputTokens/OutputTokens/TotalTokens/ModelRequests;
            # classic Azure OpenAI uses ProcessedPromptTokens/ProcessedCompletionTokens/TotalCalls.
            "prompt_tokens":     (metrics.raw_absolute.get("InputTokens") or
                                  metrics.raw_absolute.get("ProcessedPromptTokens"))     if metrics else None,
            "completion_tokens": (metrics.raw_absolute.get("OutputTokens") or
                                  metrics.raw_absolute.get("ProcessedCompletionTokens")) if metrics else None,
            "total_tokens":      (metrics.raw_absolute.get("TotalTokens") or (
                (metrics.raw_absolute.get("InputTokens", 0) or 0) +
                (metrics.raw_absolute.get("OutputTokens", 0) or 0)) or (
                (metrics.raw_absolute.get("ProcessedPromptTokens", 0) or 0) +
                (metrics.raw_absolute.get("ProcessedCompletionTokens", 0) or 0))
            ) or None if metrics else None,
            "total_calls":    (metrics.raw_absolute.get("ModelRequests") or
                               metrics.raw_absolute.get("TotalCalls"))                   if metrics else None,
            "blocked_calls":  metrics.raw_absolute.get("BlockedCalls")  if metrics else None,
            "billing_type":   (
                "ptu" if "provisioned" in (r.get("sku") or "").lower() else "consumption"
            ) if r["type"].lower().startswith("microsoft.cognitiveservices") else None,
            "auto_shutdown": vm_has_auto_shutdown,
            "rbac_assignment_count": rbac_count,
            "ri_covered": ri_covered,
            "has_private_endpoint": has_private_endpoint,
            "is_sql_replica": is_sql_replica,
            "has_backup": has_backup,
            # S17: Intent vs Usage separation
            "is_protected": is_protected,
            "protection_reasons": protection_reasons,
            # S18: Peak utilization
            "peak_utilization_pct": round(peak_util_pct, 2) if peak_util_pct is not None else None,
            # D2: Waste Age
            "idle_since_date": idle_since_date,
            "days_idle": days_idle,
            "cumulative_waste_usd": cumulative_waste_usd,
            # S19: Workload pattern
            "workload_pattern": workload_pattern,
            # S22: Protection reason
            "protection_reason": protection_reason,
            "safe_action_steps": [],  # populated after AI scoring
        })

    # ── AI scoring ─────────────────────────────────────────────────────────
    active_ai   = get_active_provider()
    ai_enabled  = active_ai != "none"
    ai_reviewed = 0

    if ai_enabled:
        provider_label = {"claude": "Claude", "azure_openai": "Azure OpenAI"}.get(active_ai, "AI")
        await report("ai", f"Running {provider_label} analysis…", 72)
        verdicts = await loop.run_in_executor(executor, partial(get_ai_verdicts, resource_dicts))
        ai_map   = {v.resource_id: v for v in verdicts if not v.error}
        ai_reviewed = len(ai_map)

        for rd in resource_dicts:
            v = ai_map.get(rd["resource_id"].lower())
            if not v:
                continue
            rd["ai_score_adjustment"] = v.score_adjustment
            rd["ai_confidence"]       = v.confidence
            rd["ai_action"]           = v.action
            rd["ai_explanation"]      = v.explanation

            # Use the same MTD-adjusted cost baseline as the first pass so that
            # trend direction is consistent between the two scoring rounds.
            _ai_cost_prev = rd.get("cost_previous_month_mtd") or rd["cost_previous_month"]
            base, final, trend_mod, trend, label = score_resource(
                util_pct=rd["primary_utilization_pct"],
                cost_current=rd["cost_current_month"],
                cost_previous=_ai_cost_prev,
                is_orphan=rd["is_orphan"],
                advisor_score_delta=rd["advisor_score_delta"],
                ai_score_adjustment=v.score_adjustment,
                has_any_activity=rd["has_any_activity"],
                days_since_active=rd["days_since_active"],
                activity_log_count=rd["activity_log_count"],
                idle_confirmed=rd["idle_confirmed"],
                data_confidence=rd.get("data_confidence", "high"),
                vm_is_deallocated=rd.get("power_state") in ("deallocated", "stopped"),
                has_lock=rd.get("has_lock", False),
                has_inherited_lock=rd.get("has_inherited_lock", False),
                is_protected=rd.get("is_protected", False),
                peak_util_pct=rd.get("peak_utilization_pct"),
            )
            sav, rec = estimate_savings(
                rd.get("savings_basis", rd["cost_current_month"]), final, rd["is_orphan"],
                sum(a["potential_savings"] for a in rd["advisor_recommendations"])
            )
            rd.update({"final_score": round(final,2), "score_label": label, "trend": trend,
                        "estimated_monthly_savings": sav,
                        "recommendation": v.explanation or rec,
                        "safe_action_steps": v.action_steps or []})

    # ── Right-sizing ────────────────────────────────────────────────────────
    await report("rightsize", "Computing right-sizing recommendations…", 82)
    rs_recs: List[RightSizeRec] = await loop.run_in_executor(
        executor, partial(get_rightsize_recommendations, resource_dicts)
    )
    rs_map = {r.resource_id.lower(): r for r in rs_recs}
    for rd in resource_dicts:
        rs = rs_map.get(rd["resource_id"].lower())
        if rs:
            rd["rightsize_sku"]          = rs.suggested_sku
            rd["rightsize_savings_pct"]  = rs.savings_pct
            rd["cli_resize_cmd"]         = (
                f'az vm resize --resource-group "{rd["resource_group"]}" '
                f'--name "{rd["resource_name"]}" --size {rs.suggested_sku}'
                if "virtualmachines" in rd["resource_type"].lower() else
                f'az sql db update --resource-group "{rd["resource_group"]}" '
                f'--name "{rd["resource_name"]}" --service-objective {rs.suggested_sku}'
            )

    # ── S9: Dependency score propagation ────────────────────────────────────
    # Attached NICs, disks, and public IPs should not score worse than the VM
    # they serve. If a resource is attached to an active VM, floor its score
    # at the VM's level and clear any orphan/waste flags.
    if vm_attachments:
        vm_score_map = {
            rd["resource_id"].lower(): rd
            for rd in resource_dicts
            if rd["resource_type"] == "microsoft.compute/virtualmachines"
        }
        for rd in resource_dicts:
            rid_lower = rd["resource_id"].lower()
            vm_id = vm_attachments.get(rid_lower)
            if not vm_id:
                continue
            vm_rd = vm_score_map.get(vm_id)
            if not vm_rd:
                continue
            vm_score = vm_rd["final_score"]
            if vm_score <= rd["final_score"]:
                continue  # already scoring at least as well as the parent VM
            # Propagate VM score — the attached resource is needed while the VM runs
            rd["final_score"]              = vm_rd["final_score"]
            rd["score_label"]              = vm_rd["score_label"]
            rd["has_any_activity"]         = True
            rd["is_orphan"]                = False
            rd["orphan_reason"]            = None
            rd["estimated_monthly_savings"] = 0.0
            rd["recommendation"] = (
                f"Attached to VM '{vm_rd['resource_name']}' ({vm_rd['score_label']}). "
                f"This resource is in use and should not be removed independently."
            )
            rd["ai_action"] = "keep"
            rd["safe_action_steps"] = []  # will be regenerated below

    # ── Safe action steps ───────────────────────────────────────────────────
    # If AI provided specific steps, keep them. Otherwise fall back to
    # rule-based generic steps that at least know the resource type.
    for rd in resource_dicts:
        if not rd.get("safe_action_steps"):
            rd["safe_action_steps"] = get_safe_action_steps(
                resource_type=rd["resource_type"],
                score_label=rd.get("score_label", ""),
                is_orphan=rd.get("is_orphan", False),
                orphan_reason=rd.get("orphan_reason", "") or "",
                ai_action=rd.get("ai_action", "") or "",
            )
            rd["steps_source"] = "rules"
        else:
            rd["steps_source"] = "ai"

        # ── Substitute real resource values into CLI template placeholders ──
        # Steps use {name}, {rg}, {id}, {nsg} as placeholders — fill them in
        # so the Copy button gives the user a command that actually works.
        name = rd.get("resource_name", "")
        rg   = rd.get("resource_group", "")
        rid  = rd.get("resource_id", "")
        for step in rd["safe_action_steps"]:
            if step.get("az_cli"):
                step["az_cli"] = (
                    step["az_cli"]
                    .replace("{name}", name)
                    .replace("{rg}",   rg)
                    .replace("{id}",   rid)
                    .replace("{nsg}",  name)   # NSG name matches resource name
                )

    await report("assembling", "Assembling dashboard…", 92)

    # ── Build ResourceMetrics list ──────────────────────────────────────────
    _INTERNAL_KEYS = {"advisor_recommendations", "savings_basis"}
    resource_metrics_list: List[ResourceMetrics] = [
        ResourceMetrics(
            **{k: v for k, v in rd.items() if k not in _INTERNAL_KEYS},
            advisor_recommendations=[AdvisorRecommendation(**a) for a in rd["advisor_recommendations"]],
        )
        for rd in resource_dicts
    ]

    # ── KPI ─────────────────────────────────────────────────────────────────
    total_curr  = sum(r.cost_current_month  for r in resource_metrics_list)
    total_prev  = sum(r.cost_previous_month for r in resource_metrics_list)
    orphan_list = [r for r in resource_metrics_list if r.is_orphan]
    orphan_cost = sum(r.cost_current_month for r in orphan_list)
    scores      = [r.final_score for r in resource_metrics_list]
    avg_score   = sum(scores) / len(scores) if scores else 0.0
    total_save  = sum(r.estimated_monthly_savings for r in resource_metrics_list)
    total_adv   = sum(len(r.advisor_recommendations) for r in resource_metrics_list)
    total_carbon = sum(r.carbon_kg_per_month for r in resource_metrics_list)
    untagged     = sum(1 for r in resource_metrics_list if r.missing_tags)
    tag_pct      = round((len(resource_metrics_list) - untagged) / len(resource_metrics_list) * 100, 1) if resource_metrics_list else 100.0
    mom_delta    = total_curr - total_prev
    mom_pct      = (mom_delta / total_prev * 100) if total_prev > 0 else 0.0

    # Health metrics — exclude infrastructure from utilisation-based scoring
    scorable       = [r for r in resource_metrics_list if not r.is_infrastructure and not r.is_orphan]
    not_used_list  = [r for r in scorable if r.score_label == ScoreLabel.NOT_USED]
    healthy_list   = [r for r in scorable if r.score_label in (ScoreLabel.ACTIVELY_USED, ScoreLabel.FULLY_USED)]
    health_pct     = round(len(healthy_list) / len(scorable) * 100, 1) if scorable else 100.0
    infra_list     = [r for r in resource_metrics_list if r.is_infrastructure]

    _not_used_cost = round(sum(r.cost_current_month for r in not_used_list), 2)
    _cs, _cg, _cl, _cc = _compute_cost_score(
        orphan_cost   = orphan_cost,
        not_used_cost = _not_used_cost,
        total_curr    = total_curr,
        health_pct    = health_pct,
        resources     = resource_metrics_list,
    )

    kpi = KPIData(
        total_cost_current_month=round(total_curr, 2),
        total_cost_previous_month=round(total_prev, 2),
        mom_cost_delta=round(mom_delta, 2),
        mom_cost_delta_pct=round(mom_pct, 2),
        total_resources=len(resource_metrics_list),
        avg_optimization_score=round(avg_score, 1),
        total_potential_savings=round(total_save, 2),
        orphan_count=len(orphan_list),
        orphan_cost=round(orphan_cost, 2),
        advisor_total_recs=total_adv,
        ai_reviewed_count=ai_reviewed,
        not_used_count=len(not_used_list),
        not_used_cost=_not_used_cost,
        infrastructure_count=len(infra_list),
        health_score_pct=health_pct,
        subscription_count=len(sub_ids),
        billing_basis="previous_month" if is_partial_month else "current_month",
        billing_days_current=now.day,
        cost_score=_cs,
        cost_grade=_cg,
        cost_score_label=_cl,
        cost_score_components=_cc,
    )

    # ── Score distribution ──────────────────────────────────────────────────
    dist = {l: {"count": 0, "total_cost": 0.0} for l in ScoreLabel}
    for r in resource_metrics_list:
        dist[r.score_label]["count"]      += 1
        dist[r.score_label]["total_cost"] += r.cost_current_month
    score_distribution = [
        ScoreDistribution(label=l.value, count=d["count"], total_cost=round(d["total_cost"],2), color=SCORE_COLORS[l])
        for l, d in dist.items() if d["count"] > 0
    ]

    # ── Type summary ────────────────────────────────────────────────────────
    tmap: Dict[str, dict] = {}
    for r in resource_metrics_list:
        t = r.resource_type
        if t not in tmap:
            tmap[t] = {"count":0,"cost_curr":0.0,"cost_prev":0.0,"scores":[],"adv":0}
        tmap[t]["count"] += 1; tmap[t]["cost_curr"] += r.cost_current_month
        tmap[t]["cost_prev"] += r.cost_previous_month
        tmap[t]["scores"].append(r.final_score); tmap[t]["adv"] += len(r.advisor_recommendations)
    resource_type_summary = [
        ResourceTypeSummary(
            resource_type=t, display_name=RESOURCE_TYPE_DISPLAY.get(t, t.split("/")[-1].title()),
            count=d["count"], cost_current_month=round(d["cost_curr"],2),
            cost_previous_month=round(d["cost_prev"],2),
            avg_score=round(sum(d["scores"])/len(d["scores"]),1), advisor_rec_count=d["adv"],
        )
        for t, d in sorted(tmap.items(), key=lambda x: -x[1]["cost_curr"])
    ]

    # ── Orphan panel ────────────────────────────────────────────────────────
    orphans_panel = [
        OrphanResource(resource_id=r.resource_id, resource_name=r.resource_name,
                        resource_type=r.resource_type, resource_group=r.resource_group,
                        orphan_reason=r.orphan_reason or "Orphaned", monthly_cost=r.cost_current_month,
                        estimated_savings=r.estimated_monthly_savings)
        for r in orphan_list
    ]

    # ── Savings recs ────────────────────────────────────────────────────────
    savings_recs = sorted(
        [SavingsRecommendation(
            resource_id=r.resource_id, resource_name=r.resource_name,
            resource_type=r.resource_type, resource_group=r.resource_group,
            current_monthly_cost=r.cost_current_month,
            estimated_monthly_savings=r.estimated_monthly_savings,
            savings_pct=round(r.estimated_monthly_savings/r.cost_current_month*100 if r.cost_current_month>0 else 0, 1),
            recommendation=r.recommendation or "",
            ai_explanation=r.ai_explanation, ai_action=r.ai_action,
            priority="High" if r.final_score<=25 else "Medium" if r.final_score<=50 else "Low",
            score=r.final_score, advisor_count=len(r.advisor_recommendations),
        ) for r in resource_metrics_list if r.estimated_monthly_savings > 0],
        key=lambda x: -x.estimated_monthly_savings,
    )[:50]

    # ── Anomalies ──────────────────────────────────────────────────────────
    cost_anomalies = [
        CostAnomaly(
            resource_id=r.resource_id, resource_name=r.resource_name,
            resource_type=r.resource_type, resource_group=r.resource_group,
            avg_daily_cost_30d=round(r.cost_current_month/30, 4),
            latest_daily_cost=round(r.daily_costs[-1] if r.daily_costs else 0, 4),
            anomaly_factor=round((r.daily_costs[-1]/(r.cost_current_month/30)) if r.daily_costs and r.cost_current_month>0 else 1, 2),
        )
        for r in resource_metrics_list if r.is_anomaly
    ]

    # ── Right-size opportunities ────────────────────────────────────────────
    rightsize_opps = [
        RightSizeOpportunity(
            resource_id=r.resource_id, resource_name=r.resource_name,
            resource_type=r.resource_type, resource_group=r.resource_group,
            current_sku=r.sku or "", suggested_sku=r.rightsize_sku or "",
            current_cost=r.cost_current_month,
            estimated_savings=round(r.cost_current_month * r.rightsize_savings_pct / 100, 2),
            savings_pct=r.rightsize_savings_pct,
            reason=r.recommendation or "", cpu_pct=r.avg_cpu_pct,
        )
        for r in resource_metrics_list if r.rightsize_sku
    ]

    active_provider = get_active_provider()

    # ── Per-subscription summary ────────────────────────────────────────────
    sub_summaries: dict[str, dict] = {}
    for r in resource_metrics_list:
        sid = r.subscription_id
        if sid not in sub_summaries:
            sub_summaries[sid] = {"resource_count":0,"cost_current":0.0,"cost_previous":0.0,"orphan_count":0,"advisor_rec_count":0}
        sub_summaries[sid]["resource_count"] += 1
        sub_summaries[sid]["cost_current"]   += r.cost_current_month
        sub_summaries[sid]["cost_previous"]  += r.cost_previous_month
        if r.is_orphan:
            sub_summaries[sid]["orphan_count"] += 1
        sub_summaries[sid]["advisor_rec_count"] += len(r.advisor_recommendations)

    subscription_list = [
        SubscriptionSummary(
            subscription_id=sid,
            subscription_name=sub_names.get(sid, ""),
            resource_count=d["resource_count"],
            cost_current=round(d["cost_current"], 2),
            cost_previous=round(d["cost_previous"], 2),
            orphan_count=d["orphan_count"],
            advisor_rec_count=d["advisor_rec_count"],
        )
        for sid, d in sub_summaries.items()
    ]

    # ── Distinct resource groups for filter ────────────────────────────────
    rg_list = sorted({r.resource_group for r in resource_metrics_list})

    # ── AI Narrative summary ────────────────────────────────────────────────
    ai_narrative: Optional[str] = None
    if ai_enabled:
        await report("narrative", "Generating AI subscription summary…", 96)
        ai_narrative = await loop.run_in_executor(
            executor,
            partial(get_ai_narrative, resource_metrics_list, kpi),
        )

    # Detect when cost data returned nothing — surface a visible warning
    cost_data_warning: Optional[str] = None
    if not curr_costs and not prev_costs and resource_metrics_list:
        if cost_fetch_error:
            cost_data_warning = (
                f"Azure Cost Management error: {cost_fetch_error}. "
                "Cost, savings, and trend figures will show $0. "
                "Check the backend logs for details."
            )
        else:
            cost_data_warning = (
                "Azure Cost Management returned no billing data. "
                "Cost, savings, and trend figures will show $0. "
                "Ensure the service principal has the Cost Management Reader role "
                "at the subscription scope, then refresh."
            )

    # ── Reservation over-commitment (F10) ──────────────────────────────────────
    # Augment each reservation dict with covered_cost, over_commitment_usd,
    # and days_to_expiry so the frontend can render F10 and Expiring Soon.
    covered_cost_by_key: dict[str, float] = {}
    for r in resource_metrics_list:
        if r.ri_covered:
            key = f"{r.resource_type}|{(r.location or '').lower().replace(' ', '')}"
            covered_cost_by_key[key] = covered_cost_by_key.get(key, 0.0) + r.cost_current_month

    # ── Synthetic reservations from billing when Reservations API is unavailable ──
    # If the Reservations API returned nothing (e.g. 403) but billing data shows
    # reservation-covered resources, build one synthetic entry per individual resource
    # so the "Already Reserved" section shows each resource as its own row.
    if not active_reservations and billing_covered_ids:
        synthetic: list[dict] = []
        for r in resource_metrics_list:
            if r.resource_id.lower() in billing_covered_ids:
                t = r.resource_type
                synthetic.append({
                    "reservation_id":     f"billing-{r.resource_id}",
                    "name":               r.resource_name or r.resource_id,
                    "display_name":       r.resource_name or r.resource_id,
                    "resource_type":      t,
                    "type_label":         RESOURCE_TYPE_DISPLAY.get(t, t.split("/")[-1]),
                    "sku":                r.sku or "",
                    "location":           r.location or "",
                    "term":               "",
                    "quantity":           1,
                    "expiry_date":        "",
                    "effective_date":     "",
                    "utilization_pct":    None,
                    "provisioning_state": "covered",
                    "covered_cost":       round(r.cost_current_month, 2),
                    "over_commitment_usd": 0.0,
                    "days_to_expiry":     None,
                    "from_billing":       True,
                    "resources":          [r.resource_name or r.resource_id],
                })
        active_reservations = synthetic
        logger.info("Generated %d synthetic reservation entries from billing coverage", len(active_reservations))

    ri_over_commitment_total = 0.0
    for res in active_reservations:
        # Days to expiry (skip for billing-synthetic entries which have no expiry date)
        if not res.get("from_billing"):
            try:
                from dateutil.parser import parse as _parse_dt
                exp_dt = _parse_dt(res["expiry_date"])
                res["days_to_expiry"] = max(0, (exp_dt.replace(tzinfo=None) - datetime.now()).days)
            except Exception:
                res["days_to_expiry"] = None

        # Over-commitment estimate (skip for billing-synthetic entries — covered_cost already set)
        if not res.get("from_billing"):
            key = f"{res.get('resource_type', '')}|{res.get('location', '')}"
            covered = covered_cost_by_key.get(key, 0.0)
            res["covered_cost"] = round(covered, 2)
            util = res.get("utilization_pct")
            if util is not None and 0 < util < 100 and covered > 0:
                wasted = covered * (100.0 - util) / util
                res["over_commitment_usd"] = round(wasted, 2)
                ri_over_commitment_total += wasted
            else:
                res["over_commitment_usd"] = 0.0

    ri_over_commitment_total = round(ri_over_commitment_total, 2)

    return DashboardData(
        kpi=kpi, score_distribution=score_distribution,
        resource_type_summary=resource_type_summary,
        resources=resource_metrics_list, orphans=orphans_panel,
        savings_recommendations=savings_recs,
        last_refreshed=datetime.now(tz=timezone.utc).isoformat(),
        ai_enabled=ai_enabled, ai_provider=active_provider,
        ai_narrative=ai_narrative,
        demo_mode=False,
        total_carbon_kg=round(total_carbon, 1),
        tag_compliance_pct=tag_pct, total_untagged=untagged,
        cost_anomalies=cost_anomalies, rightsize_opportunities=rightsize_opps,
        subscriptions=subscription_list,
        resource_groups=rg_list,
        active_resource_group=resource_group_filter or "",
        active_subscription_id=sub_ids[0] if scope_sub and len(sub_ids) == 1 else "",
        scan_scope_active=scope_active,
        active_reservations=active_reservations,
        reservation_over_commitment_usd=ri_over_commitment_total,
        reservation_recommendations=reservation_recommendations,
        cost_data_warning=cost_data_warning,
        total_daily_cm=total_daily_cm,
        total_daily_pm=total_daily_pm,
    )


# ── SSE streaming endpoint ─────────────────────────────────────────────────────

@app.get("/api/dashboard/stream")
async def stream_dashboard(
    refresh: bool = False,
    resource_group: Optional[str] = None,
):
    """SSE endpoint — streams progress then final data."""

    if settings_svc.get_value("demo_mode", False):
        async def demo_gen():
            from demo_data import build_demo_dashboard
            for step in [
                ("resources","Loading demo resources…",10),
                ("costs","Applying demo cost data…",30),
                ("metrics","Generating demo metrics…",55),
                ("scoring","Scoring demo resources…",75),
                ("ai","Applying demo AI insights…",90),
            ]:
                yield f"data: {json.dumps({'type':'progress','step':step[0],'message':step[1],'pct':step[2]})}\n\n"
                await asyncio.sleep(0.3)
            data = build_demo_dashboard()
            yield f"data: {json.dumps({'type':'done','pct':100,'data':data})}\n\n"
        return StreamingResponse(demo_gen(), media_type="text/event-stream",
                                  headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

    # resource_group=None  → no filter specified (scope defaults may apply)
    # resource_group=""    → user explicitly selected "All" (clear scope override)
    # resource_group="rg"  → filter to specific group
    cache_key = f"data:{resource_group if resource_group is not None else '*'}"
    now = datetime.now(tz=timezone.utc).timestamp()
    if not refresh and cache_key in _cache and now - _cache.get(f"{cache_key}:ts", 0) < settings_svc.get_value("cache_ttl_seconds", 1800):
        async def cached_gen():
            yield f"data: {json.dumps({'type':'progress','step':'cache','message':'Returning cached data…','pct':90})}\n\n"
            await asyncio.sleep(0.1)
            yield f"data: {json.dumps({'type':'done','pct':100,'data':_cache[cache_key].model_dump()})}\n\n"
        return StreamingResponse(cached_gen(), media_type="text/event-stream",
                                  headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

    progress_q: asyncio.Queue = asyncio.Queue()

    async def progress_cb(event: dict):
        await progress_q.put(event)

    async def build_task():
        try:
            data = await _build_dashboard(refresh, progress_cb, resource_group_filter=resource_group)
            _cache[cache_key] = data
            _cache[f"{cache_key}:ts"] = datetime.now(tz=timezone.utc).timestamp()
            await progress_q.put({"type": "done", "pct": 100, "data": data.model_dump()})
        except Exception as exc:
            logger.exception("Dashboard build failed")
            await progress_q.put({"type": "error", "message": str(exc)})

    asyncio.create_task(build_task())

    async def event_gen():
        while True:
            try:
                event = await asyncio.wait_for(progress_q.get(), timeout=120)
                yield f"data: {json.dumps(event, default=str)}\n\n"
                if event.get("type") in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type':'progress','step':'waiting','message':'Still working…','pct':50})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Legacy non-streaming endpoint (kept for compatibility) ─────────────────────

@app.get("/api/dashboard", response_model=DashboardData)
async def get_dashboard(refresh: bool = False):
    if settings_svc.get_value("demo_mode", False):
        from demo_data import build_demo_dashboard
        raw = build_demo_dashboard()
        return DashboardData(**{k: v for k, v in raw.items() if k in DashboardData.model_fields})

    now = datetime.now(tz=timezone.utc).timestamp()
    if not refresh and "data" in _cache:
        if now - _cache.get("cached_at", 0) < settings_svc.get_value("cache_ttl_seconds", 1800):
            return _cache["data"]
    try:
        data = await _build_dashboard(refresh)
        _cache.update({"data": data, "cached_at": now})
        return data
    except EnvironmentError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.exception("Dashboard build failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/resources", response_model=List[ResourceMetrics])
async def get_resources(resource_group: str | None = None, resource_type: str | None = None,
                         score_label: str | None = None, orphans_only: bool = False):
    if "data" not in _cache:
        await get_dashboard()
    resources = _cache["data"].resources
    if resource_group: resources = [r for r in resources if r.resource_group.lower() == resource_group.lower()]
    if resource_type:  resources = [r for r in resources if resource_type.lower() in r.resource_type.lower()]
    if score_label:    resources = [r for r in resources if r.score_label.value.lower() == score_label.lower()]
    if orphans_only:   resources = [r for r in resources if r.is_orphan]
    return resources


# ── Settings endpoints ─────────────────────────────────────────────────────────

@app.get("/api/settings", response_model=AppSettings)
async def get_settings_endpoint():
    s = settings_svc.safe_export()
    return AppSettings(
        azure_client_id          = s.get("AZURE_CLIENT_ID",""),
        azure_client_secret      = s.get("AZURE_CLIENT_SECRET",""),
        azure_tenant_id          = s.get("AZURE_TENANT_ID",""),
        azure_subscription_id    = s.get("AZURE_SUBSCRIPTION_ID",""),
        azure_subscription_ids   = s.get("AZURE_SUBSCRIPTION_IDS",""),
        has_azure_secret         = bool(settings_svc.get_value("AZURE_CLIENT_SECRET","")),
        ai_provider              = s.get("ai_provider", "none"),
        has_anthropic_key        = bool(settings_svc.get_value("ANTHROPIC_API_KEY","")),
        anthropic_api_key        = s.get("ANTHROPIC_API_KEY",""),
        azure_openai_endpoint    = s.get("AZURE_OPENAI_ENDPOINT",""),
        azure_openai_key         = s.get("AZURE_OPENAI_KEY",""),
        azure_openai_deployment  = s.get("AZURE_OPENAI_DEPLOYMENT","gpt-4o-mini"),
        has_azure_openai_key     = bool(settings_svc.get_value("AZURE_OPENAI_KEY","")),
        idle_threshold_pct       = s.get("idle_threshold_pct", 3.0),
        no_metrics_age_days      = s.get("no_metrics_age_days", 7),
        cost_floor_usd           = s.get("cost_floor_usd", 1.0),
        ai_cost_threshold_usd    = s.get("ai_cost_threshold_usd", 20.0),
        cache_ttl_seconds        = s.get("cache_ttl_seconds", 1800),
        demo_mode                = s.get("demo_mode", False),
        scan_scope_subscription_id = s.get("SCAN_SCOPE_SUBSCRIPTION_ID", ""),
        scan_scope_resource_group  = s.get("SCAN_SCOPE_RESOURCE_GROUP",  ""),
    )


@app.get("/api/settings/preflight")
async def preflight_check():
    """
    Check prerequisites for az login auth method:
    - Is Azure CLI installed?
    - Is the user already logged in?
    - Which accounts are accessible?
    """
    import shutil, subprocess, json as _json
    result = {"az_installed": False, "az_logged_in": False, "accounts": []}

    if not shutil.which("az"):
        return result

    result["az_installed"] = True
    try:
        proc = subprocess.run(
            ["az", "account", "list", "--output", "json"],
            capture_output=True, text=True, timeout=15,
        )
        if proc.returncode == 0:
            accounts = _json.loads(proc.stdout or "[]")
            enabled  = [a for a in accounts if str(a.get("state", "")).lower() == "enabled"]
            result["az_logged_in"] = len(enabled) > 0
            result["accounts"]     = [
                {"name": a.get("name"), "id": a.get("id")}
                for a in enabled
            ]
    except Exception:
        pass
    return result


@app.get("/api/settings/discover-subscriptions")
async def discover_subscriptions_endpoint(auth_method: str = ""):
    """
    Auto-discover subscriptions accessible to the current credential.
    Works with service principal AND `az login` — no setup required for CLI users.
    Pass auth_method=az_login to use AzureCliCredential directly (avoids stale env vars).
    """
    from services.azure_auth import discover_subscriptions
    try:
        subs = discover_subscriptions(auth_method=auth_method or None)
        return {"subscriptions": subs}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/settings/auth-method")
async def get_auth_method_endpoint():
    """Returns which auth method is currently active."""
    from services.azure_auth import get_auth_method
    return {"method": get_auth_method()}


@app.get("/api/settings/resource-groups")
async def list_resource_groups_endpoint(subscription_id: str = ""):
    """List resource groups for a given subscription (or the configured one)."""
    from services.azure_auth import get_credential
    from azure.mgmt.resource import ResourceManagementClient
    sub_id = subscription_id or settings_svc.get_value("AZURE_SUBSCRIPTION_ID", "")
    if not sub_id:
        return {"resource_groups": []}
    try:
        client = ResourceManagementClient(get_credential(), sub_id)
        rgs = sorted([rg.name for rg in client.resource_groups.list()])
        return {"resource_groups": rgs}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/settings")
async def update_settings_endpoint(body: dict):
    persist = body.pop("persist_to_env", False)
    # If the user is saving real SP credentials, auto-disable demo mode —
    # providing credentials is an explicit signal they want real data.
    has_sp_creds = all([
        body.get("AZURE_TENANT_ID",     "").strip(),
        body.get("AZURE_CLIENT_ID",     "").strip(),
        body.get("AZURE_CLIENT_SECRET", "").strip(),
    ])
    if has_sp_creds:
        body["demo_mode"] = False
    settings_svc.update(body, persist=persist)
    _cache.clear()  # force fresh data with new settings
    return {"ok": True, "message": "Settings updated. Refresh dashboard to apply."}


@app.post("/api/settings/test-azure")
async def test_azure(body: dict):
    import os as _os
    tid = body.get("AZURE_TENANT_ID") or settings_svc.get_value("AZURE_TENANT_ID","")
    cid = body.get("AZURE_CLIENT_ID") or settings_svc.get_value("AZURE_CLIENT_ID","")
    sec = body.get("AZURE_CLIENT_SECRET") or settings_svc.get_value("AZURE_CLIENT_SECRET","")
    sub = body.get("AZURE_SUBSCRIPTION_ID") or settings_svc.get_value("AZURE_SUBSCRIPTION_ID","")
    if not all([tid, cid, sec, sub]):
        raise HTTPException(status_code=400, detail="All four Azure fields are required.")
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.resource import ResourceManagementClient
        cred   = ClientSecretCredential(tenant_id=tid, client_id=cid, client_secret=sec)
        client = ResourceManagementClient(cred, sub)
        list(client.resource_groups.list())
        return {"ok": True, "message": "Connected successfully."}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection failed: {exc}")


@app.post("/api/settings/test-ai")
async def test_ai(body: dict):
    provider = body.get("ai_provider") or settings_svc.get_value("ai_provider", "claude")

    if provider == "claude":
        key = body.get("ANTHROPIC_API_KEY") or settings_svc.get_value("ANTHROPIC_API_KEY", "")
        if not key:
            raise HTTPException(status_code=400, detail="Anthropic API key is required.")
        try:
            client = anthropic.Anthropic(api_key=key)
            client.messages.create(model="claude-haiku-4-5-20251001", max_tokens=10,
                                    messages=[{"role": "user", "content": "Hi"}])
            return {"ok": True, "message": "Claude (Anthropic) API key is valid."}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Claude key validation failed: {exc}")

    elif provider == "azure_openai":
        endpoint   = body.get("AZURE_OPENAI_ENDPOINT")   or settings_svc.get_value("AZURE_OPENAI_ENDPOINT", "")
        api_key    = body.get("AZURE_OPENAI_KEY")        or settings_svc.get_value("AZURE_OPENAI_KEY", "")
        deployment = body.get("AZURE_OPENAI_DEPLOYMENT") or settings_svc.get_value("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
        if not endpoint or not api_key:
            raise HTTPException(status_code=400, detail="Azure OpenAI endpoint and key are required.")
        # Normalise endpoint — strip /openai/... paths, the SDK adds them
        import re as _re
        endpoint = _re.sub(r"/openai/.*$", "", endpoint.rstrip("/")) + "/"
        try:
            from openai import AzureOpenAI, NotFoundError, AuthenticationError
            client = AzureOpenAI(azure_endpoint=endpoint, api_key=api_key, api_version="2024-10-21")
            try:
                client.chat.completions.create(
                    model=deployment, max_completion_tokens=5,
                    messages=[{"role": "user", "content": "Hi"}],
                )
            except Exception as _e:
                if "max_completion_tokens" in str(_e) or "unsupported_parameter" in str(_e):
                    client.chat.completions.create(
                        model=deployment, max_tokens=5, temperature=0.1,
                        messages=[{"role": "user", "content": "Hi"}],
                    )
                else:
                    raise
            return {"ok": True, "message": f"Azure OpenAI connected successfully (deployment: {deployment})."}
        except Exception as exc:
            err = str(exc)
            if "404" in err or "not found" in err.lower():
                raise HTTPException(status_code=400, detail=(
                    f"Deployment '{deployment}' not found. "
                    "Go to Azure Portal → Azure OpenAI → Model deployments and copy the exact deployment name."
                ))
            if "401" in err or "authentication" in err.lower() or "unauthorized" in err.lower():
                raise HTTPException(status_code=400, detail="Invalid API key. Check Azure Portal → Azure OpenAI → Keys and Endpoint.")
            if "name or service not known" in err.lower() or "nodename" in err.lower():
                raise HTTPException(status_code=400, detail=f"Endpoint URL not reachable: {endpoint}. Check the URL in Azure Portal → Azure OpenAI → Keys and Endpoint.")
            raise HTTPException(status_code=400, detail=f"Azure OpenAI error: {err}")

    raise HTTPException(status_code=400, detail="Select a provider (claude or azure_openai) to test.")



@app.get("/health")
async def health():
    active = get_active_provider()
    return {
        "status":      "ok",
        "ai_enabled":  active != "none",
        "ai_provider": active,
        "demo_mode":   settings_svc.get_value("demo_mode", False),
        "timestamp":   datetime.now(tz=timezone.utc).isoformat(),
    }


@app.get("/api/openai-deployments")
async def openai_deployments(subscription_id: str, resource_group: str, account_name: str):
    from services.azure_auth import get_credential
    credential = get_credential()
    return get_openai_deployments(credential, subscription_id, resource_group, account_name)




# ── Serve built React frontend ─────────────────────────────────────────────────
# Only active when frontend/dist exists (i.e. after npm run build).
# In dev mode the Vite dev server runs separately on port 5173.

_FRONTEND = pathlib.Path(__file__).parent.parent / "frontend" / "dist"

if _FRONTEND.exists():
    if (_FRONTEND / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_FRONTEND / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        requested = (_FRONTEND / full_path).resolve()
        # Block path traversal — only serve files inside the dist directory
        if not str(requested).startswith(str(_FRONTEND.resolve())):
            return FileResponse(str(_FRONTEND / "index.html"))
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(_FRONTEND / "index.html"))
