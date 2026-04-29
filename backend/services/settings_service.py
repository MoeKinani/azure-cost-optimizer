"""
In-memory settings store. Values are loaded from .env on startup and can
be updated at runtime from the GUI. Azure SDK credential cache is reset
automatically whenever Azure credentials change.
"""
from __future__ import annotations

import os
import stat
import time
from pathlib import Path
from typing import Any, Dict

# Load from SETTINGS_DIR volume first (Docker), then fall back to backend/.env (local)
def _load_env_file() -> None:
    settings_dir = os.getenv("SETTINGS_DIR", "")
    candidates = []
    if settings_dir:
        candidates.append(Path(settings_dir) / ".env")
    candidates.append(Path(__file__).parent.parent / ".env")
    for path in candidates:
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            break

_load_env_file()

_settings: Dict[str, Any] = {
    # Azure
    "AZURE_CLIENT_ID":        os.getenv("AZURE_CLIENT_ID",        ""),
    "AZURE_CLIENT_SECRET":    os.getenv("AZURE_CLIENT_SECRET",    ""),
    "AZURE_TENANT_ID":        os.getenv("AZURE_TENANT_ID",        ""),
    "AZURE_SUBSCRIPTION_ID":  os.getenv("AZURE_SUBSCRIPTION_ID",  ""),
    # Multi-subscription: comma-separated list; if set, overrides AZURE_SUBSCRIPTION_ID list
    "AZURE_SUBSCRIPTION_IDS": os.getenv("AZURE_SUBSCRIPTION_IDS", ""),
    # Scan scope — optional, limits scans to a specific subscription/RG for testing
    "SCAN_SCOPE_SUBSCRIPTION_ID": os.getenv("SCAN_SCOPE_SUBSCRIPTION_ID", ""),
    "SCAN_SCOPE_RESOURCE_GROUP":  os.getenv("SCAN_SCOPE_RESOURCE_GROUP",  ""),
    # Selected management group scope (display metadata only — resolved sub IDs live in AZURE_SUBSCRIPTION_IDS)
    "SELECTED_SCOPE_ID":   os.getenv("SELECTED_SCOPE_ID",   ""),
    "SELECTED_SCOPE_NAME": os.getenv("SELECTED_SCOPE_NAME", ""),
    # AI — provider selection
    "ai_provider":             os.getenv("AI_PROVIDER", "none"),  # "claude" | "azure_openai" | "none"
    # Claude (Anthropic)
    "ANTHROPIC_API_KEY":       os.getenv("ANTHROPIC_API_KEY", ""),
    # Azure OpenAI
    "AZURE_OPENAI_ENDPOINT":   os.getenv("AZURE_OPENAI_ENDPOINT",   ""),
    "AZURE_OPENAI_KEY":        os.getenv("AZURE_OPENAI_KEY",        ""),
    "AZURE_OPENAI_DEPLOYMENT": os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini"),
    # Scoring thresholds
    "idle_threshold_pct":      float(os.getenv("IDLE_THRESHOLD_PCT",    "3.0")),
    "no_metrics_age_days":     int(os.getenv("NO_METRICS_AGE_DAYS",     "7")),
    "cost_floor_usd":          float(os.getenv("COST_FLOOR_USD",        "0.0")),
    "ai_cost_threshold_usd":   float(os.getenv("AI_COST_THRESHOLD_USD", "20.0")),
    "cache_ttl_seconds":       int(os.getenv("CACHE_TTL_SECONDS",       "1800")),
    # Security
    "credential_timeout_hours": int(os.getenv("CREDENTIAL_TIMEOUT_HOURS", "0")),
    # Feature flags
    "demo_mode": False,
}

# Tracks the last time credentials were successfully used for a scan.
# Used by the credential timeout / auto-wipe feature.
_cred_last_used: float = time.time()

# Keys that hold secrets — candidates for auto-wipe
_SECRET_KEYS = {"AZURE_CLIENT_SECRET", "ANTHROPIC_API_KEY", "AZURE_OPENAI_KEY"}

_AZURE_KEYS = {"AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION_IDS", "SELECTED_SCOPE_ID", "SELECTED_SCOPE_NAME"}


def get() -> Dict[str, Any]:
    return _settings.copy()


def get_subscription_ids() -> list[str]:
    """
    Return the list of subscription IDs to scan.
    Uses AZURE_SUBSCRIPTION_IDS (comma-separated) if set,
    otherwise falls back to AZURE_SUBSCRIPTION_ID.
    """
    multi = _settings.get("AZURE_SUBSCRIPTION_IDS", "").strip()
    if multi:
        return [s.strip() for s in multi.split(",") if s.strip()]
    primary = _settings.get("AZURE_SUBSCRIPTION_ID", "").strip()
    return [primary] if primary else []


def get_value(key: str, default=None):
    return _settings.get(key, default)


def update(updates: Dict[str, Any], persist: bool = False) -> None:
    global _settings
    _settings.update(updates)

    # Sync to os.environ so the Azure SDK picks up new creds immediately
    for key in list(_AZURE_KEYS) + ["ANTHROPIC_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT"]:
        if key in updates and updates[key]:
            os.environ[key] = str(updates[key])

    if any(k in updates for k in _AZURE_KEYS):
        from .azure_auth import reset_credential
        reset_credential()

    if persist:
        _write_env_file()


def safe_export() -> Dict[str, Any]:
    """Return settings with secrets masked for the frontend."""
    s = _settings.copy()
    for field in ("AZURE_CLIENT_SECRET", "ANTHROPIC_API_KEY", "AZURE_OPENAI_KEY"):
        v = s.get(field, "")
        s[field] = ("••••" + v[-4:]) if len(v) > 4 else ("••••" if v else "")
    # Convenience flags consumed by the frontend
    s["has_azure_secret"]    = bool(_settings.get("AZURE_CLIENT_SECRET", ""))
    s["has_azure_openai_key"] = bool(_settings.get("AZURE_OPENAI_KEY", ""))
    return s


def touch_credential_use() -> None:
    """Record that credentials were successfully used right now."""
    global _cred_last_used
    _cred_last_used = time.time()


def wipe_secrets() -> None:
    """
    Zero out stored secrets in memory, os.environ, and .env.
    Only wipes service principal / API keys — leaves subscription ID and
    tenant ID intact so the user knows which account to re-authenticate.
    """
    global _settings
    for key in _SECRET_KEYS:
        _settings[key] = ""
        os.environ.pop(key, None)
    from .azure_auth import reset_credential
    reset_credential()
    _write_env_file()


def check_and_wipe_if_expired() -> bool:
    """
    If a credential timeout is configured and credentials have not been used
    within the timeout window, wipe all secrets and return True.
    Only triggers when service principal credentials are stored (AZURE_CLIENT_SECRET set).
    Returns False when credentials are still valid or no timeout is configured.
    """
    timeout_hours = float(_settings.get("credential_timeout_hours", 0))
    if timeout_hours <= 0:
        return False
    # Only auto-wipe when a service principal secret is stored
    if not _settings.get("AZURE_CLIENT_SECRET", ""):
        return False
    elapsed_hours = (time.time() - _cred_last_used) / 3600
    if elapsed_hours >= timeout_hours:
        wipe_secrets()
        return True
    return False


def _get_env_path() -> Path:
    """
    Resolve the .env file path.
    SETTINGS_DIR env var allows Docker deployments to persist settings
    to a mounted volume (e.g. SETTINGS_DIR=/app/config).
    Defaults to the backend directory (existing local behaviour).
    """
    settings_dir = os.getenv("SETTINGS_DIR", "")
    if settings_dir:
        p = Path(settings_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p / ".env"
    return Path(__file__).parent.parent / ".env"


def _write_env_file() -> None:
    env_path = _get_env_path()
    existing: Dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()

    persist_keys = list(_AZURE_KEYS) + ["ANTHROPIC_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT", "ai_provider", "AZURE_SUBSCRIPTION_IDS", "SCAN_SCOPE_SUBSCRIPTION_ID", "SCAN_SCOPE_RESOURCE_GROUP", "SELECTED_SCOPE_ID", "SELECTED_SCOPE_NAME", "credential_timeout_hours"]
    for key in persist_keys:
        val = _settings.get(key, "")
        if val:
            existing[key] = val
        else:
            existing.pop(key, None)  # remove cleared keys from .env

    env_path.write_text(
        "\n".join(f"{k}={v}" for k, v in existing.items()) + "\n",
        encoding="utf-8",
    )
    # Restrict file to owner-only read/write (no effect on Windows, harmless)
    try:
        os.chmod(env_path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
