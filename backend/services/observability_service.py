"""
Checks what monitoring data is actually available for each resource.

Why this matters
────────────────
The scoring engine can only be as accurate as the data it receives.
If Azure Monitor has no metrics for a resource (agent not installed,
resource type doesn't emit metrics, diagnostic settings not configured)
then a "Not Used" label is a guess — not a finding.

This service attaches a `data_confidence` level to each resource:

  high    — Azure Monitor has metric data for this resource
            Scoring is reliable.

  medium  — Resource type supports metrics but none were returned.
            Could be a new resource, agent missing, or genuinely idle.
            Scoring is directionally correct but not confirmed.

  low     — Resource type does not natively emit utilisation metrics
            (e.g. VNets, NSGs, DNS zones). Only cost + activity signals.
            Scoring reflects cost pattern only.

  none    — No metrics, no activity, resource type unknown.
            Score should not be acted on without manual investigation.

Telemetry sources
─────────────────
  monitor         — Azure Monitor metrics (CPU, DTU, requests, etc.)
  activity_only   — Activity logs only, no utilisation metrics
  cost_only       — Only billing data, no operational signals
  none            — No signals at all
"""
from __future__ import annotations

# ── Resource types with native Azure Monitor metrics ───────────────────────────
# These types emit metrics automatically — no agent or diagnostic settings needed.
NATIVE_METRICS_TYPES: frozenset[str] = frozenset({
    # Compute
    "microsoft.compute/virtualmachines",
    "microsoft.compute/virtualmachinescalesets",
    "microsoft.web/sites",
    "microsoft.web/serverfarms",
    "microsoft.containerservice/managedclusters",
    "microsoft.containerinstance/containergroups",
    "microsoft.batch/batchaccounts",
    # Storage
    "microsoft.storage/storageaccounts",
    "microsoft.storage/storageaccounts/blobservices",
    "microsoft.storage/storageaccounts/fileservices",
    "microsoft.storage/storageaccounts/queueservices",
    "microsoft.storage/storageaccounts/tableservices",
    # Data / Databases
    "microsoft.sql/servers/databases",
    "microsoft.sql/servers/elasticpools",
    "microsoft.dbformysql/flexibleservers",
    "microsoft.dbforpostgresql/flexibleservers",
    "microsoft.documentdb/databaseaccounts",
    "microsoft.cache/redis",
    "microsoft.synapse/workspaces",
    "microsoft.databricks/workspaces",
    # AI / ML
    "microsoft.cognitiveservices/accounts",
    "microsoft.machinelearningservices/workspaces",
    "microsoft.search/searchservices",
    # Integration / Messaging
    "microsoft.servicebus/namespaces",
    "microsoft.eventhub/namespaces",
    "microsoft.eventgrid/topics",
    "microsoft.eventgrid/eventsubscriptions",
    "microsoft.logic/workflows",
    "microsoft.apimanagement/service",
    # Networking (limited metrics — bandwidth, packet counts, not utilisation)
    "microsoft.network/loadbalancers",
    "microsoft.network/applicationgateways",
    "microsoft.network/publicipaddresses",
    "microsoft.network/expressroutecircuits",
    "microsoft.network/frontdoors",
    "microsoft.cdn/profiles",
    # Containers
    "microsoft.containerregistry/registries",
    "microsoft.app/containerapps",
    # Key Vault
    "microsoft.keyvault/vaults",
})

# These types have NO meaningful utilisation metrics — infrastructure support roles.
INFRASTRUCTURE_TYPES: frozenset[str] = frozenset({
    "microsoft.network/virtualnetworks",
    "microsoft.network/networksecuritygroups",
    "microsoft.network/privateendpoints",
    "microsoft.network/privatednszones",
    "microsoft.network/dnszones",
    "microsoft.network/routetables",
    "microsoft.network/networkwatchers",
    "microsoft.network/natgateways",
    "microsoft.network/ddosprotectionplans",
    "microsoft.network/ipgroups",
    "microsoft.network/firewallpolicies",
    "microsoft.resources/resourcegroups",
    "microsoft.authorization/roleassignments",
    "microsoft.authorization/roledefinitions",
    "microsoft.insights/actiongroups",
    "microsoft.insights/activitylogalerts",
    "microsoft.insights/metricalerts",
    "microsoft.compute/disks",              # disks have metrics only when attached
    "microsoft.compute/snapshots",
    "microsoft.compute/images",
    "microsoft.keyvault/managedhsms",
})


def get_data_confidence(
    resource_type: str,
    primary_utilization_pct: float | None,
    has_any_activity: bool,
    cost_current: float,
) -> tuple[str, str]:
    """
    Returns (data_confidence, telemetry_source).

    data_confidence: "high" | "medium" | "low" | "none"
    telemetry_source: "monitor" | "activity_only" | "cost_only" | "none"
    """
    rt = resource_type.lower().split("/")
    # Normalise to top-level provider/type (ignore sub-resources)
    rt_key = "/".join(rt[:2]) if len(rt) >= 2 else resource_type.lower()

    is_infra = any(resource_type.lower().startswith(t) for t in INFRASTRUCTURE_TYPES)
    has_native = any(resource_type.lower().startswith(t) for t in NATIVE_METRICS_TYPES)

    if is_infra:
        # Infrastructure — cost and activity are the only valid signals
        if has_any_activity or cost_current > 0:
            return "low", "cost_only"
        return "none", "none"

    if primary_utilization_pct is not None:
        # We got real metric data
        return "high", "monitor"

    if has_native:
        # Type supports metrics but none returned — agent missing or new resource
        if has_any_activity:
            return "medium", "activity_only"
        return "medium", "cost_only"

    # Unknown type — only cost signal
    if cost_current > 0:
        return "low", "cost_only"

    return "none", "none"


def should_suppress_idle_penalty(data_confidence: str) -> bool:
    """
    When monitoring data is absent, we should not penalise a resource
    for appearing idle — the absence of data ≠ absence of usage.
    """
    return data_confidence in ("low", "none")


def get_confidence_label(data_confidence: str) -> str:
    return {
        "high":   "Metrics confirmed",
        "medium": "Metrics expected but missing",
        "low":    "No utilisation metrics — cost signal only",
        "none":   "No monitoring data",
    }.get(data_confidence, "Unknown")
