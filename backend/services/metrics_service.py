"""
Pulls Azure Monitor metrics for the past 30 days, mapped to a 0-100 utilisation %.
Covers: VMs, Disks, Storage, SQL, App Service, Function Apps, Logic Apps,
        Redis, Cosmos DB, App Gateway, Load Balancers, Key Vault, AKS,
        Event Hubs, Service Bus, Container Registry, API Management,
        Data Factory, Cognitive Services, Container Instances,
        HDInsight, Synapse, Search, SignalR, IoT Hub.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from azure.mgmt.monitor import MonitorManagementClient

from .azure_auth import get_credential, get_subscription_id

logger = logging.getLogger(__name__)

# Each entry: list of (metric_name, aggregation)
METRIC_MAP: Dict[str, List[Tuple[str, str]]] = {
    # ── Compute ───────────────────────────────────────────────────────────────
    "microsoft.compute/virtualmachines": [
        ("Percentage CPU",       "Average"),
        ("Network In Total",     "Total"),
        ("Network Out Total",    "Total"),
        ("Disk Read Bytes",      "Total"),
        ("Disk Write Bytes",     "Total"),
    ],
    "microsoft.compute/virtualmachinescalesets": [
        ("Percentage CPU",       "Average"),
        ("Network In Total",     "Total"),
        ("Network Out Total",    "Total"),
    ],
    "microsoft.compute/disks": [
        ("Composite Disk Read Operations/sec",  "Average"),
        ("Composite Disk Write Operations/sec", "Average"),
    ],
    "microsoft.containerinstance/containergroups": [
        ("CpuUsage",    "Average"),
        ("MemoryUsage", "Average"),
    ],

    # ── Storage ───────────────────────────────────────────────────────────────
    "microsoft.storage/storageaccounts": [
        ("UsedCapacity",  "Average"),
        ("Transactions",  "Total"),
        ("Ingress",       "Total"),   # bytes written — always emitted when data moves in
        ("Egress",        "Total"),   # bytes read — always emitted when data moves out
    ],
    "microsoft.storage/storageaccounts/blobservices": [
        ("BlobCapacity",  "Average"),
        ("Transactions",  "Total"),
        ("Ingress",       "Total"),
        ("Egress",        "Total"),
    ],

    # ── Databases ─────────────────────────────────────────────────────────────
    "microsoft.sql/servers/databases": [
        ("cpu_percent",              "Average"),
        ("dtu_consumption_percent",  "Average"),
        ("storage_percent",          "Average"),
        ("connection_successful",    "Total"),
    ],
    "microsoft.sql/servers/elasticpools": [
        ("cpu_percent",             "Average"),
        ("dtu_consumption_percent", "Average"),
        ("storage_percent",         "Average"),
    ],
    "microsoft.dbformysql/servers": [
        ("cpu_percent",     "Average"),
        ("memory_percent",  "Average"),
        ("storage_percent", "Average"),
        ("active_connections", "Average"),
    ],
    "microsoft.dbformysql/flexibleservers": [
        ("cpu_percent",        "Average"),
        ("memory_percent",     "Average"),
        ("storage_percent",    "Average"),
        ("active_connections", "Average"),
    ],
    "microsoft.dbforpostgresql/servers": [
        ("cpu_percent",        "Average"),
        ("memory_percent",     "Average"),
        ("storage_percent",    "Average"),
        ("active_connections", "Average"),
    ],
    "microsoft.dbforpostgresql/flexibleservers": [
        ("cpu_percent",        "Average"),
        ("memory_percent",     "Average"),
        ("storage_percent",    "Average"),
        ("active_connections", "Average"),
    ],
    "microsoft.documentdb/databaseaccounts": [
        ("NormalizedRUConsumption", "Average"),
        ("ServerSideLatency",       "Average"),
        ("TotalRequests",           "Total"),
    ],
    "microsoft.cache/redis": [
        ("percentProcessorTime",  "Average"),
        ("usedmemorypercentage",  "Average"),
        ("connectedclients",      "Average"),
        ("operationsPerSecond",   "Average"),
    ],
    "microsoft.cache/redisenterprise": [
        ("percent_processor_time", "Average"),
        ("used_memory_percentage", "Average"),
    ],

    # ── Application Insights ─────────────────────────────────────────────────
    # App Insights components are separate resources linked to web apps / functions.
    # These metrics reflect real user traffic — much stronger signal than CPU alone.
    "microsoft.insights/components": [
        ("requests/count",                          "Count"),
        ("requests/failed",                         "Count"),
        ("requests/duration",                       "Average"),
        ("users/count",                             "Count"),
        ("sessions/count",                          "Count"),
        ("exceptions/count",                        "Count"),
        ("availabilityResults/availabilityPercentage", "Average"),
        ("dependencies/count",                      "Count"),
    ],

    # ── Web / Functions / Logic ───────────────────────────────────────────────
    "microsoft.web/sites": [
        ("CpuPercentage",    "Average"),
        ("MemoryPercentage", "Average"),
        ("Requests",         "Total"),
        ("HttpResponseTime", "Average"),
        ("Http5xx",          "Total"),
    ],
    "microsoft.web/serverfarms": [
        ("CpuPercentage",    "Average"),
        ("MemoryPercentage", "Average"),
        ("DiskQueueLength",  "Average"),
    ],
    "microsoft.logic/workflows": [
        ("RunsStarted",     "Total"),
        ("RunsCompleted",   "Total"),
        ("RunsFailed",      "Total"),
        ("ActionLatency",   "Average"),
    ],
    "microsoft.logic/integrationserviceenvironments": [
        ("IntegrationServiceEnvironmentProcessorUsage", "Average"),
        ("IntegrationServiceEnvironmentMemoryUsage",    "Average"),
    ],

    # ── Messaging ─────────────────────────────────────────────────────────────
    "microsoft.eventhub/namespaces": [
        ("IncomingMessages",  "Total"),
        ("OutgoingMessages",  "Total"),
        ("IncomingBytes",     "Total"),
        ("OutgoingBytes",     "Total"),
        ("ActiveConnections", "Average"),
    ],
    "microsoft.servicebus/namespaces": [
        ("IncomingMessages",  "Total"),
        ("OutgoingMessages",  "Total"),
        ("ActiveConnections", "Average"),
        ("Size",              "Average"),
    ],
    "microsoft.notificationhubs/namespaces/notificationhubs": [
        ("outgoing.allpns.success", "Total"),
        ("outgoing.allpns.badorexpiredchannel", "Total"),
    ],

    # ── Networking ────────────────────────────────────────────────────────────
    "microsoft.network/applicationgateways": [
        ("Throughput",          "Average"),
        ("CurrentConnections",  "Average"),
        ("FailedRequests",      "Total"),
        ("HealthyHostCount",    "Average"),
    ],
    "microsoft.network/loadbalancers": [
        ("ByteCount",                 "Total"),
        ("PacketCount",               "Total"),
        ("SYNCount",                  "Total"),
        ("AllocatedSnatPorts",        "Average"),
    ],
    "microsoft.network/publicipaddresses": [
        ("ByteCount",   "Total"),
        ("PacketCount", "Total"),
        ("IfUnderDDoSAttack", "Maximum"),
    ],
    "microsoft.network/virtualnetworkgateways": [
        ("TunnelAverageBandwidth",  "Average"),
        ("TunnelEgressBytes",       "Total"),
        ("TunnelIngressBytes",      "Total"),
    ],
    "microsoft.network/expressroutecircuits": [
        ("BitsInPerSecond",  "Average"),
        ("BitsOutPerSecond", "Average"),
    ],
    "microsoft.network/frontdoors": [
        ("RequestCount",     "Total"),
        ("RequestSize",      "Total"),
        ("BackendRequestCount", "Total"),
        ("BackendHealthPercentage", "Average"),
    ],
    "microsoft.cdn/profiles": [
        ("RequestCount",  "Total"),
        ("ByteHitRatio",  "Average"),
        ("OriginRequestCount", "Total"),
    ],

    # ── Containers / Kubernetes ───────────────────────────────────────────────
    "microsoft.containerservice/managedclusters": [
        ("node_cpu_usage_percentage",    "Average"),
        ("node_memory_rss_percentage",   "Average"),
        ("kube_pod_status_ready",        "Average"),
    ],
    "microsoft.containerregistry/registries": [
        ("StorageUsed",        "Average"),
        ("SuccessfulPullCount","Total"),
        ("SuccessfulPushCount","Total"),
    ],
    "microsoft.app/containerapps": [
        ("CpuUsageNanoCores",      "Average"),
        ("MemoryWorkingSetBytes",  "Average"),
        ("Requests",               "Total"),
        ("RestartCount",           "Total"),
    ],

    # ── API / Integration ─────────────────────────────────────────────────────
    "microsoft.apimanagement/service": [
        ("TotalRequests",         "Total"),
        ("SuccessfulRequests",    "Total"),
        ("FailedRequests",        "Total"),
        ("Capacity",              "Average"),
        ("BackendDuration",       "Average"),
    ],
    "microsoft.datafactory/factories": [
        ("PipelineSucceededRuns",  "Total"),
        ("PipelineFailedRuns",     "Total"),
        ("ActivitySucceededRuns",  "Total"),
        ("IntegrationRuntimeAvailableMemory", "Average"),
        ("IntegrationRuntimeCpuPercentage",   "Average"),
    ],

    # ── AI / Cognitive ────────────────────────────────────────────────────────
    # Azure AI Foundry (new) uses InputTokens/OutputTokens/TotalTokens/ModelRequests.
    # Classic Azure OpenAI still reports TotalCalls/ProcessedPromptTokens as fallback.
    "microsoft.cognitiveservices/accounts": [
        ("TotalTokens",                 "Total"),   # AI Foundry: total tokens
        ("InputTokens",                 "Total"),   # AI Foundry: prompt tokens
        ("OutputTokens",                "Total"),   # AI Foundry: completion tokens
        ("ModelRequests",               "Total"),   # AI Foundry: call count
        ("TotalCalls",                  "Total"),   # Classic OpenAI: call count
        ("SuccessfulCalls",             "Total"),
        ("TotalErrors",                 "Total"),
        ("BlockedCalls",                "Total"),
        ("ProcessedPromptTokens",       "Total"),   # Classic OpenAI: prompt tokens (fallback)
    ],
    "microsoft.search/searchservices": [
        ("SearchQueriesPerSecond",  "Average"),
        ("ThrottledSearchQueriesPercentage", "Average"),
        ("DocumentsProcessedCount", "Total"),
    ],
    "microsoft.machinelearningservices/workspaces": [
        ("active_runs",      "Total"),
        ("completed_runs",   "Total"),
        ("failed_runs",      "Total"),
        ("quota_utilization_percentage", "Average"),
    ],

    # ── Analytics / Big Data ──────────────────────────────────────────────────
    "microsoft.synapse/workspaces": [
        ("IntegrationPipelineRunsEnded",   "Total"),
        ("IntegrationActivityRunsEnded",   "Total"),
        ("BuiltinSqlPoolDataProcessedBytes", "Total"),
    ],
    "microsoft.hdinsight/clusters": [
        ("CategorizedGatewayRequests", "Total"),
        ("GatewayRequests",            "Total"),
        ("NumActiveWorkers",           "Average"),
    ],
    "microsoft.databricks/workspaces": [
        ("autoScale",          "Average"),
        ("clusterTerminated",  "Total"),
        ("jobsFailed",         "Total"),
        ("jobsSucceeded",      "Total"),
    ],

    # ── IoT / Devices ─────────────────────────────────────────────────────────
    "microsoft.devices/iothubs": [
        ("d2c.telemetry.ingress.allProtocol", "Total"),
        ("d2c.telemetry.egress.success",      "Total"),
        ("connectedDeviceCount",              "Average"),
    ],
    "microsoft.web/connections": [
        ("RequestCount", "Total"),
        ("Latency",      "Average"),
    ],

    # ── Security / Identity ───────────────────────────────────────────────────
    "microsoft.keyvault/vaults": [
        ("ServiceApiHit",    "Total"),
        ("Availability",     "Average"),
        ("SaturationShoebox", "Average"),
    ],
    "microsoft.keyvault/managedhsms": [
        ("ServiceApiHit", "Total"),
        ("Availability",  "Average"),
    ],

    # ── Backup / Recovery ─────────────────────────────────────────────────────
    "microsoft.recoveryservices/vaults": [
        ("BackupHealthEvent",  "Total"),
        ("RestoreHealthEvent", "Total"),
    ],

    # ── Monitoring / Management ───────────────────────────────────────────────
    "microsoft.operationalinsights/workspaces": [
        ("Average_% Processor Time", "Average"),
        ("DataIngestionVolume",       "Total"),
    ],
    "microsoft.signalrservice/signalr": [
        ("ConnectionCount",    "Maximum"),
        ("MessageCount",       "Total"),
        ("UserErrors",         "Total"),
    ],
}

# Metrics that are already 0-100 percentages
PERCENTAGE_METRICS = {
    "Percentage CPU", "CpuPercentage", "MemoryPercentage", "cpu_percent",
    "dtu_consumption_percent", "storage_percent", "memory_percent",
    "percentProcessorTime", "usedmemorypercentage",
    "NormalizedRUConsumption", "node_cpu_usage_percentage",
    "node_memory_rss_percentage", "Capacity", "BackendHealthPercentage",
    "ByteHitRatio", "ThrottledSearchQueriesPercentage",
    "quota_utilization_percentage", "Availability",
    "IntegrationServiceEnvironmentProcessorUsage",
    "IntegrationServiceEnvironmentMemoryUsage",
    "IntegrationRuntimeCpuPercentage", "active_connections",
    "AllocatedSnatPorts",
    "availabilityResults/availabilityPercentage",
}

# For non-percentage metrics: normalise to 0-100 using an upper bound
NORMALISATION_BOUNDS: Dict[str, float] = {
    # Network / throughput
    "Network In Total":          10 * 1024**3,
    "Network Out Total":         10 * 1024**3,
    "Disk Read Bytes":          100 * 1024**3,
    "Disk Write Bytes":         100 * 1024**3,
    "ByteCount":                 10 * 1024**3,
    "PacketCount":               10_000_000,
    "SYNCount":                   1_000_000,
    "Throughput":                 1_000_000_000,
    "CurrentConnections":        10_000,
    "TunnelEgressBytes":          5 * 1024**3,
    "TunnelIngressBytes":         5 * 1024**3,
    "TunnelAverageBandwidth":     1_000_000_000,
    "BitsInPerSecond":            1_000_000_000,
    "BitsOutPerSecond":           1_000_000_000,
    # Storage
    "UsedCapacity":               5 * 1024**4,
    "BlobCapacity":               5 * 1024**4,
    "StorageUsed":               50 * 1024**3,
    "Size":                       1 * 1024**3,
    "Ingress":                    1 * 1024**4,   # 1 TB written/month = fully active
    "Egress":                     5 * 1024**4,   # 5 TB read/month = fully active
    # Requests / messages
    "Transactions":               1_000_000,
    "Requests":                   1_000_000,
    "RequestCount":               1_000_000,
    "IncomingMessages":           1_000_000,
    "OutgoingMessages":           1_000_000,
    "IncomingBytes":              1 * 1024**3,
    "OutgoingBytes":              1 * 1024**3,
    "TotalRequests":              1_000_000,
    "TotalCalls":                 1_000_000,
    "SuccessfulCalls":            1_000_000,
    "SuccessfulPullCount":          100_000,
    "SuccessfulPushCount":            10_000,
    "SearchQueriesPerSecond":          1_000,
    "DocumentsProcessedCount":     100_000,
    "PipelineSucceededRuns":         1_000,
    "ActivitySucceededRuns":        10_000,
    "connectedclients":              1_000,
    "operationsPerSecond":          50_000,
    "connectedDeviceCount":         10_000,
    "RunsStarted":                   1_000,
    "RunsCompleted":                 1_000,
    "ConnectionCount":              10_000,
    "MessageCount":                100_000,
    "kube_pod_status_ready":           500,
    # Compute
    "CpuUsage":               4 * 1024**3,
    "MemoryUsage":            8 * 1024**3,
    "CpuUsageNanoCores":      2_000_000_000,   # 2 vCPU = 2e9 nanocores
    "MemoryWorkingSetBytes":  4 * 1024**3,     # 4 GiB working set
    "NumActiveWorkers":             1_000,
    "IntegrationRuntimeAvailableMemory": 32 * 1024**3,
    # Latency — lower is better → invert
    "ServerSideLatency":           100,
    "HttpResponseTime":              5,
    "ActionLatency":             5_000,
    "BackendDuration":           5_000,
    "Latency":                   5_000,
    # Misc
    "BackupHealthEvent":             1_000,
    "RestoreHealthEvent":              500,
    "ServiceApiHit":           100_000,
    "DataIngestionVolume":       1 * 1024**3,
    "ProcessedPromptTokens":      1_000_000,
    "ProcessedCompletionTokens":    500_000,
    "TotalTokens":                2_000_000,
    "InputTokens":                1_000_000,
    "OutputTokens":                 500_000,
    "ModelRequests":                100_000,
    "BlockedCalls":                  10_000,
    # App Insights
    "requests/count":            1_000_000,
    "requests/failed":              10_000,
    "requests/duration":             5_000,  # ms — lower is better → invert
    "users/count":                 100_000,
    "sessions/count":              100_000,
    "exceptions/count":             10_000,
    "dependencies/count":        1_000_000,
    # Failure metrics — high failures = low util → inverse
    "FailedRequests":            10_000,
    "Http5xx":                    1_000,
    "RunsFailed":                   100,
    "PipelineFailedRuns":           100,
    "UserErrors":                 1_000,
    "jobsFailed":                   100,
    "TotalErrors":               10_000,
}

# Metrics where HIGH value means BAD (lower is better → inverted)
INVERSE_METRICS = {
    "ServerSideLatency", "HttpResponseTime", "ActionLatency", "BackendDuration",
    "Latency", "FailedRequests", "Http5xx", "RunsFailed", "PipelineFailedRuns",
    "UserErrors", "jobsFailed", "TotalErrors",
    "ThrottledSearchQueriesPercentage",
    "outgoing.allpns.badorexpiredchannel",
    "requests/failed", "requests/duration", "exceptions/count",
}

# Metrics that on their own indicate "used" even without util% semantics.
# Includes network/disk bytes — any traffic at all means the resource is serving a purpose.
ACTIVITY_METRICS = {
    # Requests / transactions / messages
    "Transactions", "Requests", "RequestCount", "TotalRequests", "TotalCalls",
    "IncomingMessages", "OutgoingMessages", "RunsStarted", "RunsCompleted",
    "PipelineSucceededRuns", "ActivitySucceededRuns", "ServiceApiHit",
    "BackupHealthEvent", "RestoreHealthEvent",
    "SuccessfulCalls", "SuccessfulPullCount", "SuccessfulPushCount",
    "TotalTokens", "InputTokens", "OutputTokens", "ModelRequests",
    "SearchQueriesPerSecond", "connectedDeviceCount", "connectedclients",
    "d2c.telemetry.ingress.allProtocol", "d2c.telemetry.egress.success",
    "active_connections",
    # Network traffic — any bytes in/out means the resource is reachable and in use
    "Network In Total", "Network Out Total",
    "ByteCount", "PacketCount", "SYNCount",
    "TunnelEgressBytes", "TunnelIngressBytes",
    "IncomingBytes", "OutgoingBytes",
    "CurrentConnections", "ActiveConnections", "AllocatedSnatPorts",
    # Storage I/O — any ingress/egress confirms the account is actively read/written
    "Ingress", "Egress",
    # Disk I/O — any reads/writes means something is using the disk
    "Disk Read Bytes", "Disk Write Bytes",
    "Composite Disk Read Operations/sec", "Composite Disk Write Operations/sec",
    # App Insights — real user traffic signals
    "requests/count", "users/count", "sessions/count", "dependencies/count",
}


# Some resource types require an explicit metricnamespace to avoid Azure Monitor
# returning an empty result set despite the metrics existing.
METRIC_NAMESPACE_OVERRIDE: Dict[str, str] = {
    "microsoft.cognitiveservices/accounts": "microsoft.cognitiveservices/accounts",
}


def _normalise(metric_name: str, value: float) -> float:
    if metric_name in PERCENTAGE_METRICS:
        return min(max(value, 0.0), 100.0)
    bound = NORMALISATION_BOUNDS.get(metric_name)
    if bound and bound > 0:
        pct = min((value / bound) * 100.0, 100.0)
        if metric_name in INVERSE_METRICS:
            pct = 100.0 - pct
        return max(pct, 0.0)
    return min(value, 100.0)


def _fetch_metric(
    client: MonitorManagementClient,
    resource_id: str,
    metric_name: str,
    aggregation: str,
    start: datetime,
    end: datetime,
    metricnamespace: Optional[str] = None,
) -> Optional[float]:
    try:
        kwargs: dict = dict(
            resource_uri=resource_id,
            timespan=f"{start.isoformat().replace('+00:00','Z')}/{end.isoformat().replace('+00:00','Z')}",
            interval="P1D",
            metricnames=metric_name,
            aggregation=aggregation,
        )
        if metricnamespace:
            kwargs["metricnamespace"] = metricnamespace
        result = client.metrics.list(**kwargs)
        values: list[float] = []
        for metric in result.value:
            for ts in metric.timeseries:
                for dp in ts.data:
                    v = getattr(dp, aggregation.lower(), None)
                    if v is not None:
                        values.append(float(v))
        if not values:
            return None
        # Total aggregation = daily totals that accumulate over the month.
        # The normalisation bounds (Transactions: 1M, Ingress: 1TB, etc.) are
        # calibrated as 30-day totals, so we must SUM daily values here.
        # Average aggregation = point-in-time readings (CPU %, memory %) where
        # averaging across days is correct.
        if aggregation.lower() == "total":
            return sum(values)
        return sum(values) / len(values)
    except Exception as exc:
        logger.debug("Metric %s unavailable for %s: %s", metric_name, resource_id.split("/")[-1], exc)
        return None


class MetricsResult:
    def __init__(self):
        self.primary_utilization: Optional[float] = None
        self.peak_utilization:    Optional[float] = None   # S18: max utilization in 30-day window
        self.cpu:    Optional[float] = None
        self.memory: Optional[float] = None
        self.disk:   Optional[float] = None
        self.network: Optional[float] = None
        self.has_any_activity: bool = False
        self.raw:          Dict[str, float] = {}   # normalized 0-100 values
        self.raw_absolute: Dict[str, float] = {}   # pre-normalization actual values


def get_resource_metrics(resource_id: str, resource_type: str, subscription_id: str = "") -> MetricsResult:
    result = MetricsResult()
    rtype  = resource_type.lower()

    metrics_to_fetch = METRIC_MAP.get(rtype)

    # Partial-match fallback: match on the first two path segments
    if not metrics_to_fetch:
        prefix = "/".join(rtype.split("/")[:2])
        for key, val in METRIC_MAP.items():
            if key.startswith(prefix):
                metrics_to_fetch = val
                break

    if not metrics_to_fetch:
        return result

    # Use the resource's own subscription ID — critical for multi-subscription scans.
    # Using the wrong subscription causes the Monitor API to return no data silently.
    credential = get_credential()
    sub_id     = subscription_id or get_subscription_id()
    client     = MonitorManagementClient(credential, sub_id)

    end   = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=30)

    ns_override = METRIC_NAMESPACE_OVERRIDE.get(rtype)
    is_cog = rtype == "microsoft.cognitiveservices/accounts"

    raw_values:    Dict[str, float] = {}
    raw_absolute:  Dict[str, float] = {}
    null_metrics:  list = []
    for metric_name, aggregation in metrics_to_fetch:
        value = _fetch_metric(client, resource_id, metric_name, aggregation, start, end, ns_override)
        if value is not None:
            norm = _normalise(metric_name, value)
            raw_values[metric_name]   = norm
            raw_absolute[metric_name] = value
            if metric_name in ACTIVITY_METRICS and value > 0:
                result.has_any_activity = True
        elif is_cog:
            null_metrics.append(metric_name)

    if is_cog:
        name = resource_id.split("/")[-1]
        if raw_values:
            logger.info("CogSvc %s — metrics fetched: %s", name,
                        {k: round(v, 1) for k, v in raw_absolute.items()})
        else:
            logger.warning(
                "CogSvc %s — ALL metrics null. Tried: %s. "
                "Check Monitoring Reader role and that the resource is active.",
                name, [m for m, _ in metrics_to_fetch]
            )

    if not raw_values:
        logger.warning(
            "No metrics returned for %s (type: %s). "
            "Check that the service principal has the 'Monitoring Reader' role "
            "on the subscription or resource group.",
            resource_id.split("/")[-1],
            resource_type,
        )
        return result

    result.raw          = raw_values
    result.raw_absolute = raw_absolute

    # ── Primary utilisation — type-aware, not a naive average ─────────────────
    # Averaging CPU with near-zero normalised network/disk numbers destroys signal.
    # A VM at 15% CPU + tiny network traffic should NOT score as 3% utilised.
    # Use the most meaningful single metric per resource type as primary utilisation,
    # then fall back to averaging only same-dimension metrics.

    # CPU-primary types: use the CPU metric directly
    CPU_PRIMARY_METRICS = (
        "Percentage CPU",       # VMs
        "CpuPercentage",        # App Service / Web Apps
        "cpu_percent",          # SQL, MySQL, PostgreSQL
        "percentProcessorTime", # Redis
        "NormalizedRUConsumption",    # Cosmos DB
        "node_cpu_usage_percentage",  # AKS
        "Capacity",             # API Management
        "IntegrationServiceEnvironmentProcessorUsage",
        "IntegrationRuntimeCpuPercentage",
        "quota_utilization_percentage",  # ML
        "CpuUsageNanoCores",    # Container Apps
    )

    # Request-primary types: use requests/transactions as signal
    REQUEST_PRIMARY_METRICS = (
        "TotalRequests", "Requests", "RequestCount",
        "RunsStarted", "IncomingMessages", "ServiceApiHit",
        "TotalCalls", "PipelineSucceededRuns", "SearchQueriesPerSecond",
        "requests/count", "users/count",
        "Transactions",   # Storage account transactions — primary signal for storage usage
        "Egress",         # Storage egress bytes — strong signal: data is being read
    )

    # Try CPU first
    cpu_val = next((raw_values[k] for k in CPU_PRIMARY_METRICS if k in raw_values), None)
    if cpu_val is not None:
        result.primary_utilization = cpu_val
    else:
        # Try request/activity metrics
        req_vals = [raw_values[k] for k in REQUEST_PRIMARY_METRICS if k in raw_values]
        if req_vals:
            result.primary_utilization = max(req_vals)  # use highest signal
        else:
            # Fall back: average non-inverse, non-network-byte metrics to avoid dilution
            util_values = [
                v for k, v in raw_values.items()
                if k not in INVERSE_METRICS
            ]
            result.primary_utilization = sum(util_values) / len(util_values) if util_values else None

    # Semantic groupings
    cpu_keys  = {"Percentage CPU", "cpu_percent", "CpuPercentage", "percentProcessorTime",
                 "node_cpu_usage_percentage", "NormalizedRUConsumption", "Capacity",
                 "IntegrationServiceEnvironmentProcessorUsage", "IntegrationRuntimeCpuPercentage",
                 "CpuUsage", "quota_utilization_percentage"}
    mem_keys  = {"MemoryPercentage", "usedmemorypercentage", "node_memory_rss_percentage",
                 "memory_percent", "IntegrationServiceEnvironmentMemoryUsage",
                 "IntegrationRuntimeAvailableMemory", "MemoryUsage"}
    disk_keys = {"Disk Read Bytes", "Disk Write Bytes", "storage_percent", "UsedCapacity",
                 "BlobCapacity", "StorageUsed", "Size",
                 "Composite Disk Read Operations/sec", "Composite Disk Write Operations/sec"}
    net_keys  = {"Network In Total", "Network Out Total", "ByteCount", "PacketCount",
                 "Throughput", "CurrentConnections", "IncomingBytes", "OutgoingBytes",
                 "BitsInPerSecond", "BitsOutPerSecond", "TunnelAverageBandwidth"}

    def avg(keys):
        vals = [raw_values[k] for k in keys if k in raw_values]
        return sum(vals) / len(vals) if vals else None

    result.cpu     = avg(cpu_keys)
    result.memory  = avg(mem_keys)
    result.disk    = avg(disk_keys)
    result.network = avg(net_keys)

    # S18: Peak utilization — fetch Maximum for the primary metric to detect bursts.
    # A resource averaging 2% CPU but spiking to 80% once/day is a scheduled job, not waste.
    primary_metric = None
    for k in CPU_PRIMARY_METRICS:
        if k in raw_values:
            primary_metric = (k, "Maximum")
            break
    if primary_metric is None:
        for k in REQUEST_PRIMARY_METRICS:
            if k in raw_values:
                primary_metric = (k, "Maximum")
                break

    if primary_metric:
        peak_raw = _fetch_metric(client, resource_id, primary_metric[0], "Maximum", start, end)
        if peak_raw is not None:
            result.peak_utilization = _normalise(primary_metric[0], peak_raw)

    return result
