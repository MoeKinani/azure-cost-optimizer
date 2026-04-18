"""
Authentication for Azure SDK.

Auth priority (DefaultAzureCredential tries these in order):
  1. Service principal env vars  — enterprise / CI use (AZURE_CLIENT_ID etc.)
  2. Azure CLI  (`az login`)     — community / developer use, zero setup
  3. Managed Identity            — when deployed to Azure Container Apps / AKS
  4. Interactive browser         — fallback for local dev

Community users only need `az login` — no service principal, no secrets.
"""
from __future__ import annotations

from typing import List
from azure.identity import DefaultAzureCredential, CredentialUnavailableError
from dotenv import load_dotenv

load_dotenv()

_credential: DefaultAzureCredential | None = None


def get_credential() -> DefaultAzureCredential:
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential(
            # Silence the noise from auth methods that aren't configured
            exclude_workload_identity_credential=True,
            exclude_managed_identity_credential=False,
            exclude_shared_token_cache_credential=True,
            exclude_visual_studio_code_credential=True,
            exclude_interactive_browser_credential=True,
        )
    return _credential


def get_subscription_id() -> str:
    """Return the primary subscription ID (backward compat)."""
    from .settings_service import get_subscription_ids
    ids = get_subscription_ids()
    if not ids:
        raise EnvironmentError(
            "No subscription ID configured. "
            "Add one in Settings, or set AZURE_SUBSCRIPTION_ID in your environment."
        )
    return ids[0]


def get_subscription_ids() -> List[str]:
    """Return all subscription IDs to scan."""
    from .settings_service import get_subscription_ids as _get_ids
    ids = _get_ids()
    if not ids:
        raise EnvironmentError(
            "No subscription IDs configured. "
            "Add one in Settings → Azure, or run `az login` and set AZURE_SUBSCRIPTION_ID."
        )
    return ids


def discover_subscriptions(auth_method: str | None = None) -> List[dict]:
    """
    Auto-discover subscriptions the current credential can access.
    Works with both service principal and `az login`.
    Returns list of {subscription_id, display_name, state}.

    When auth_method='az_login', uses AzureCliCredential directly so that
    stale env vars (AZURE_CLIENT_ID etc.) do not interfere.
    """
    from azure.mgmt.subscription import SubscriptionClient
    try:
        if auth_method == "az_login":
            from azure.identity import AzureCliCredential
            cred = AzureCliCredential()
        else:
            cred = get_credential()
        client = SubscriptionClient(cred)
        return [
            {
                "subscription_id": s.subscription_id,
                "display_name":    s.display_name,
                "state":           str(s.state),
            }
            for s in client.subscriptions.list()
            if str(s.state).lower() == "enabled"
        ]
    except Exception as exc:
        raise EnvironmentError(f"Could not list subscriptions: {exc}") from exc


def get_auth_method() -> str:
    """Return a human-readable description of the active auth method."""
    import os
    if all(os.getenv(k) for k in ("AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID")):
        return "service_principal"
    # Check if az login is active
    try:
        from azure.identity import AzureCliCredential
        AzureCliCredential().get_token("https://management.azure.com/.default")
        return "az_login"
    except Exception:
        pass
    return "unknown"


def reset_credential() -> None:
    """Reset cached credential — called automatically when settings change."""
    global _credential
    _credential = None
