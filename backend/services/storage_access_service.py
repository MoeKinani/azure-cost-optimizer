"""
Storage account access signals for improved scoring accuracy.

Pulls two signals that are unavailable from Azure Monitor alone:
  1. Last access time tracking — if enabled and transactions = 0 for 60+ days,
     the account is confirmed unused (not just suspected).
  2. Lifecycle management policy — if a policy exists, someone actively manages
     this account. Treat as a positive scoring signal (floor at 50).

Both signals require only the Reader role — no data plane access needed.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from azure.mgmt.storage import StorageManagementClient

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)


class StorageAccessSignal:
    __slots__ = ("last_access_tracking_enabled", "has_lifecycle_policy")

    def __init__(self, last_access_tracking_enabled: bool = False, has_lifecycle_policy: bool = False):
        self.last_access_tracking_enabled = last_access_tracking_enabled
        self.has_lifecycle_policy         = has_lifecycle_policy


def get_storage_access_signals(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, StorageAccessSignal]:
    """
    Returns {storage_account_resource_id_lower: StorageAccessSignal}.

    last_access_tracking_enabled = True means Azure is tracking when each blob
    was last read. Combined with zero transaction metrics, this is confirmed unused.

    has_lifecycle_policy = True means someone has configured tiering/expiry rules —
    the account is actively managed regardless of current transaction volume.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    storage_resources = [
        r for r in resources
        if r["type"] == "microsoft.storage/storageaccounts"
    ]
    if not storage_resources:
        return {}

    results: Dict[str, StorageAccessSignal] = {}

    for sub_id in sub_ids:
        try:
            client = StorageManagementClient(credential, sub_id)
            sub_accounts = [r for r in storage_resources if r.get("subscription_id") == sub_id]

            for r in sub_accounts:
                rid_lower = r["id"].lower()
                rg        = r["resource_group"]
                name      = r["name"]
                signal    = StorageAccessSignal()

                # ── 1. Last access time tracking ──────────────────────────────
                try:
                    props = client.blob_services.get_service_properties(rg, name)
                    if props and props.last_access_time_tracking_policy:
                        signal.last_access_tracking_enabled = (
                            props.last_access_time_tracking_policy.enable is True
                        )
                except Exception as exc:
                    logger.debug("Last access tracking check failed for %s: %s", name, exc)

                # ── 2. Lifecycle management policy ────────────────────────────
                try:
                    policy = client.management_policies.get(rg, name)
                    if policy and policy.policy and policy.policy.rules:
                        signal.has_lifecycle_policy = len(policy.policy.rules) > 0
                except Exception as exc:
                    # 404 = no policy configured — expected for most accounts
                    if "404" not in str(exc) and "not found" not in str(exc).lower():
                        logger.debug("Lifecycle policy check failed for %s: %s", name, exc)

                results[rid_lower] = signal

        except Exception as exc:
            logger.warning("[%s] Storage access signal fetch failed: %s", sub_id, exc)

    logger.info(
        "Storage access signals: %d accounts checked, %d with last-access tracking, %d with lifecycle policy",
        len(results),
        sum(1 for s in results.values() if s.last_access_tracking_enabled),
        sum(1 for s in results.values() if s.has_lifecycle_policy),
    )
    return results
