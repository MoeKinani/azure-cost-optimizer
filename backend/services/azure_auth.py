"""
Authentication for Azure SDK.

Auth priority:
  1. Device Code (interactive Microsoft sign-in) — when active and no SP configured
  2. Service principal env vars  — enterprise / CI use (AZURE_CLIENT_ID etc.)
  3. Azure CLI  (`az login`)     — community / developer use, zero setup
  4. Managed Identity            — when deployed to Azure Container Apps / AKS

Community users only need `az login` — no service principal, no secrets.
"""
from __future__ import annotations

import os
import threading
from typing import Dict, List, Optional

from azure.identity import DefaultAzureCredential, CredentialUnavailableError
from dotenv import load_dotenv

load_dotenv()

_credential: DefaultAzureCredential | None = None

# ── Device Code Flow state ─────────────────────────────────────────────────────
# Status lifecycle: idle → starting → pending → authenticated | error
_dc_state: Dict = {
    "status":           "idle",
    "user_code":        None,
    "verification_uri": None,
    "message":          None,
    "error":            None,
}
_dc_credential = None   # DeviceCodeCredential instance when authenticated
_dc_lock = threading.Lock()


def _dc_prompt_callback(verification_uri: str, user_code: str, expires_on) -> None:
    """Called by DeviceCodeCredential with the code/URL once the flow starts."""
    with _dc_lock:
        _dc_state.update({
            "status":           "pending",
            "user_code":        user_code,
            "verification_uri": verification_uri,
            "message":          f"Visit {verification_uri} and enter code {user_code}",
        })


def start_device_code_flow() -> None:
    """
    Kick off device code authentication in a background thread.
    Returns immediately — poll get_device_code_status() for progress.
    """
    global _dc_credential, _dc_state

    from azure.identity import DeviceCodeCredential
    from .settings_service import get_value

    tenant_id = get_value("AZURE_TENANT_ID", "").strip() or "organizations"

    with _dc_lock:
        _dc_state.update({
            "status": "starting", "user_code": None,
            "verification_uri": None, "message": None, "error": None,
        })

    cred = DeviceCodeCredential(
        tenant_id=tenant_id,
        prompt_callback=_dc_prompt_callback,
    )

    def _run() -> None:
        global _dc_credential
        try:
            cred.get_token("https://management.azure.com/.default")
            _dc_credential = cred
            with _dc_lock:
                _dc_state["status"] = "authenticated"
            reset_credential()   # flush cached DefaultAzureCredential
        except Exception as exc:
            import logging as _log
            _log.getLogger(__name__).warning("Device code flow failed: %s", exc)
            with _dc_lock:
                _dc_state.update({"status": "error", "error": "Authentication failed. Please try again or use a Service Principal."})

    threading.Thread(target=_run, daemon=True).start()


def get_device_code_status() -> Dict:
    with _dc_lock:
        return _dc_state.copy()


def sign_out_device_code() -> None:
    global _dc_credential
    _dc_credential = None
    with _dc_lock:
        _dc_state.update({
            "status": "idle", "user_code": None,
            "verification_uri": None, "message": None, "error": None,
        })
    reset_credential()


def _active_device_code_credential():
    """Return the authenticated DeviceCodeCredential, or None."""
    with _dc_lock:
        if _dc_state.get("status") == "authenticated":
            return _dc_credential
    return None


def get_credential():
    global _credential
    # Device code takes priority when active and no SP credentials are configured
    dc = _active_device_code_credential()
    if dc is not None:
        sp_configured = all(os.getenv(k) for k in ("AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"))
        if not sp_configured:
            return dc
    if _credential is None:
        _credential = DefaultAzureCredential(
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
        import logging as _log
        _log.getLogger(__name__).warning("Could not list subscriptions: %s", exc)
        raise EnvironmentError("Could not determine available subscriptions. Check your credentials and permissions.") from exc


def get_auth_method() -> str:
    """Return a human-readable description of the active auth method."""
    if _active_device_code_credential() is not None:
        return "device_code"
    if all(os.getenv(k) for k in ("AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID")):
        return "service_principal"
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
