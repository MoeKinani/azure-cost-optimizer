"""
Key Vault access signals for improved scoring accuracy.

Pulls two signals not available from Azure Monitor metrics alone:
  1. Purge protection — if enabled, the vault holds critical secrets someone
     deliberately protected. Never flag as "Not Used".
  2. Soft delete retention — longer retention = higher value vault.

Uses ResourceManagementClient (Reader role) — no Key Vault SDK needed.
The ServiceApiHit metric (already collected in metrics_service.py) is the
primary usage signal. This service adds the protection/management context.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from azure.mgmt.resource import ResourceManagementClient

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)

_KV_API_VERSION = "2023-02-01"


class KeyVaultSignal:
    __slots__ = ("purge_protected", "soft_delete_retention_days", "enabled_for_disk_encryption", "enabled_for_deployment")

    def __init__(
        self,
        purge_protected: bool = False,
        soft_delete_retention_days: int = 0,
        enabled_for_disk_encryption: bool = False,
        enabled_for_deployment: bool = False,
    ):
        self.purge_protected              = purge_protected
        self.soft_delete_retention_days   = soft_delete_retention_days
        self.enabled_for_disk_encryption  = enabled_for_disk_encryption
        self.enabled_for_deployment       = enabled_for_deployment

    @property
    def is_protected(self) -> bool:
        """True if any signal indicates the vault is intentionally maintained."""
        return (
            self.purge_protected
            or self.enabled_for_disk_encryption
            or self.enabled_for_deployment
            or self.soft_delete_retention_days > 30
        )


def get_keyvault_signals(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, KeyVaultSignal]:
    """
    Returns {keyvault_resource_id_lower: KeyVaultSignal}.

    purge_protected = True → vault holds critical secrets, never flag as Not Used.
    enabled_for_disk_encryption / deployment → vault is actively used by Azure infra.
    soft_delete_retention_days > 30 → vault owner increased retention deliberately.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    kv_resources = [
        r for r in resources
        if r["type"] in ("microsoft.keyvault/vaults", "microsoft.keyvault/managedhsms")
    ]
    if not kv_resources:
        return {}

    results: Dict[str, KeyVaultSignal] = {}

    for sub_id in sub_ids:
        try:
            client   = ResourceManagementClient(credential, sub_id)
            sub_kvs  = [r for r in kv_resources if r.get("subscription_id") == sub_id]

            for r in sub_kvs:
                rid_lower = r["id"].lower()
                signal    = KeyVaultSignal()

                try:
                    resource = client.resources.get_by_id(r["id"], api_version=_KV_API_VERSION)
                    props = resource.properties or {}

                    signal.purge_protected             = bool(props.get("enablePurgeProtection", False))
                    signal.soft_delete_retention_days  = int(props.get("softDeleteRetentionInDays", 0))
                    signal.enabled_for_disk_encryption = bool(props.get("enabledForDiskEncryption", False))
                    signal.enabled_for_deployment      = bool(props.get("enabledForDeployment", False))

                except Exception as exc:
                    logger.debug("Key Vault property fetch failed for %s: %s", r["name"], exc)

                results[rid_lower] = signal

        except Exception as exc:
            logger.warning("[%s] Key Vault signal fetch failed: %s", sub_id, exc)

    logger.info(
        "Key Vault signals: %d vaults checked, %d purge-protected, %d used for disk encryption",
        len(results),
        sum(1 for s in results.values() if s.purge_protected),
        sum(1 for s in results.values() if s.enabled_for_disk_encryption),
    )
    return results
