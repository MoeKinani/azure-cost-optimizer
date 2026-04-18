"""
Queries the Azure Activity Log (management plane) for the last 30 days.
Supports multiple subscriptions — results are grouped by resource ID.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from azure.mgmt.monitor import MonitorManagementClient

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)


class ActivityResult:
    __slots__ = ("last_active_date", "days_since_active", "event_count", "recently_deployed")

    def __init__(
        self,
        last_active_date: str | None = None,
        days_since_active: int | None = None,
        event_count: int = 0,
        recently_deployed: bool = False,
    ):
        self.last_active_date  = last_active_date
        self.days_since_active = days_since_active
        self.event_count       = event_count
        self.recently_deployed = recently_deployed  # write/deploy event in last 30 days


def get_subscription_activity(
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, ActivityResult]:
    """
    Returns {resource_id_lower: ActivityResult} aggregated across all subscriptions.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    end   = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=30)
    filter_str = (
        f"eventTimestamp ge '{start.strftime('%Y-%m-%dT%H:%M:%SZ')}' and "
        f"eventTimestamp le '{end.strftime('%Y-%m-%dT%H:%M:%SZ')}'"
    )

    # Operation name patterns that indicate active deployment or configuration
    # ARM/Bicep/Terraform write operations, not just reads or auto-generated events
    _DEPLOY_KEYWORDS = (
        "/write", "/action", "deployments/", "microsoft.resources/deployments",
        "/create", "/update", "/regeneratekey", "/rotate",
    )

    raw: Dict[str, dict] = {}

    for sub_id in sub_ids:
        try:
            client     = MonitorManagementClient(credential, sub_id)
            sub_prefix = f"/subscriptions/{sub_id.lower()}"
            events     = client.activity_logs.list(
                filter=filter_str,
                select="eventTimestamp,resourceId,operationName,status",
            )

            for event in events:
                try:
                    rid = (event.resource_id or "").lower().strip()
                    if not rid or rid == sub_prefix:
                        continue
                    ts = event.event_timestamp
                    if rid not in raw:
                        raw[rid] = {"last_date": ts, "count": 0, "deployed": False}
                    else:
                        if ts and (raw[rid]["last_date"] is None or ts > raw[rid]["last_date"]):
                            raw[rid]["last_date"] = ts
                    raw[rid]["count"] += 1

                    # Flag as recently deployed if a write/deploy operation succeeded
                    op   = (getattr(event.operation_name, "value", "") or "").lower()
                    stat = (getattr(event.status, "value", "") or "").lower()
                    if stat == "succeeded" and any(kw in op for kw in _DEPLOY_KEYWORDS):
                        raw[rid]["deployed"] = True

                except Exception:
                    continue

        except Exception as exc:
            logger.warning("[%s] Activity log query failed: %s", sub_id, exc)

    now    = datetime.now(tz=timezone.utc)
    result: Dict[str, ActivityResult] = {}
    for rid, data in raw.items():
        last_date = data["last_date"]
        days      = (now - last_date).days if last_date and hasattr(last_date, "replace") else None
        result[rid] = ActivityResult(
            last_active_date  = last_date.date().isoformat() if last_date and hasattr(last_date, "date") else None,
            days_since_active = days,
            event_count       = data["count"],
            recently_deployed = data.get("deployed", False),
        )

    logger.info(
        "Activity log: %d resources with events in last 30 days across %d subscription(s)",
        len(result), len(sub_ids),
    )
    return result
