"""
Lists all resources across one or more subscriptions and identifies orphaned resources.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Set, Tuple

from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)


def list_all_resources(subscription_ids: Optional[List[str]] = None) -> List[Dict]:
    """Return all resources across all given subscription IDs (defaults to configured list)."""
    credential = get_credential()
    sub_ids = subscription_ids or get_subscription_ids()

    resources: List[Dict] = []
    for sub_id in sub_ids:
        try:
            client = ResourceManagementClient(credential, sub_id)
            for resource in client.resources.list(expand="tags,createdTime"):
                rtype = (resource.type or "").lower()
                # Capture instance count for App Service Plans (sku.capacity = number of instances)
                instance_count: int | None = None
                if rtype == "microsoft.web/serverfarms":
                    if hasattr(resource, "sku") and resource.sku and hasattr(resource.sku, "capacity"):
                        instance_count = resource.sku.capacity
                # Resource creation date — used for age-based scoring
                created_at: str = ""
                try:
                    if hasattr(resource, "created_time") and resource.created_time:
                        created_at = resource.created_time.isoformat()
                    elif hasattr(resource, "system_data") and resource.system_data:
                        cd = getattr(resource.system_data, "created_at", None)
                        if cd:
                            created_at = cd.isoformat()
                except Exception:
                    pass
                resources.append({
                    "id":             resource.id or "",
                    "name":           resource.name or "",
                    "type":           rtype,
                    "resource_group": _extract_rg(resource.id or ""),
                    "location":       resource.location or "",
                    "sku":            _extract_sku(resource),
                    "tags":           dict(resource.tags or {}),
                    "subscription_id": sub_id,
                    "instance_count": instance_count,
                    "created_at":     created_at,
                })
        except Exception as exc:
            logger.error("Failed to list resources for subscription %s: %s", sub_id, exc)

    logger.info("Found %d total resources across %d subscription(s)", len(resources), len(sub_ids))
    return resources


def find_orphans(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> List[Tuple[str, str]]:
    """
    Returns list of (resource_id_lower, orphan_reason) pairs across all subscriptions.
    Checks:
      - Unattached managed disks
      - Unassigned public IP addresses
      - Network interfaces with no VM
      - NSGs with no associations

    NOTE: Deallocated (stopped) VMs are intentionally NOT flagged as orphans.
    A stopped VM is a deliberate operational state — dev/test VMs, VMs stopped
    overnight, etc. Calling them orphans would mislead users into deleting
    actively-used machines. Their power state is captured separately via
    get_vm_power_states() for display purposes only.
    """
    credential = get_credential()
    sub_ids = subscription_ids or get_subscription_ids()

    orphans: List[Tuple[str, str]] = []

    for sub_id in sub_ids:
        try:
            compute_client = ComputeManagementClient(credential, sub_id)
            network_client = NetworkManagementClient(credential, sub_id)

            # --- Unattached managed disks ---
            try:
                for disk in compute_client.disks.list():
                    if disk.disk_state and disk.disk_state.lower() not in ("attached", "reserved"):
                        orphans.append((
                            (disk.id or "").lower(),
                            f"Unattached disk (state: {disk.disk_state})",
                        ))
            except Exception as exc:
                logger.warning("[%s] Disk orphan check failed: %s", sub_id, exc)

            # --- Unassigned public IPs ---
            try:
                for pip in network_client.public_ip_addresses.list_all():
                    if pip.ip_configuration is None and pip.nat_gateway is None:
                        orphans.append((
                            (pip.id or "").lower(),
                            "Public IP not assigned to any resource",
                        ))
            except Exception as exc:
                logger.warning("[%s] Public IP orphan check failed: %s", sub_id, exc)

            # --- NICs with no VM ---
            try:
                for nic in network_client.network_interfaces.list_all():
                    if nic.virtual_machine is None and nic.private_endpoint is None:
                        orphans.append((
                            (nic.id or "").lower(),
                            "NIC not attached to any VM",
                        ))
            except Exception as exc:
                logger.warning("[%s] NIC orphan check failed: %s", sub_id, exc)

            # --- NSGs with no subnet and no NIC ---
            try:
                for nsg in network_client.network_security_groups.list_all():
                    if not nsg.subnets and not nsg.network_interfaces:
                        orphans.append((
                            (nsg.id or "").lower(),
                            "NSG not associated with any subnet or NIC",
                        ))
            except Exception as exc:
                logger.warning("[%s] NSG orphan check failed: %s", sub_id, exc)

            # Deallocated VMs are NOT orphans — do not add them here.
            # Use get_vm_power_states() to surface their stopped state separately.

        except Exception as exc:
            logger.error("Orphan check failed for subscription %s: %s", sub_id, exc)

    # Deduplicate
    seen: set = set()
    unique: List[Tuple[str, str]] = []
    for rid, reason in orphans:
        if rid not in seen:
            seen.add(rid)
            unique.append((rid, reason))

    logger.info("Found %d orphaned resources", len(unique))
    return unique


def get_app_service_plan_links(subscription_ids: Optional[List[str]] = None) -> Dict[str, str]:
    """
    Returns {site_resource_id_lower: plan_resource_id_lower} for every
    Web App / Function App across all subscriptions.
    Used to show which apps run under which App Service Plan.
    """
    from azure.mgmt.web import WebSiteManagementClient
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    links: Dict[str, str] = {}
    for sub_id in sub_ids:
        try:
            web_client = WebSiteManagementClient(credential, sub_id)
            for site in web_client.web_apps.list():
                if site.id and site.server_farm_id:
                    links[site.id.lower()] = site.server_farm_id.lower()
        except Exception as exc:
            logger.warning("App Service plan link fetch failed for %s: %s", sub_id, exc)
    return links


def get_vm_power_states(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Returns (power_map, size_map) for all VMs.
    power_map: {vm_resource_id_lower: power_state}  e.g. "running", "deallocated"
    size_map:  {vm_resource_id_lower: vm_size}       e.g. "Standard_D4s_v3"
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    power_map: Dict[str, str] = {}
    size_map:  Dict[str, str] = {}

    for sub_id in sub_ids:
        try:
            compute_client = ComputeManagementClient(credential, sub_id)
            sub_vms = [r for r in resources
                       if r.get("subscription_id") == sub_id
                       and r["type"] == "microsoft.compute/virtualmachines"]
            rgs = {r["resource_group"] for r in sub_vms}
            for rg in rgs:
                for vm in compute_client.virtual_machines.list(rg):
                    vid = (vm.id or "").lower()
                    # Capture VM size from hardware profile
                    try:
                        vm_size = getattr(getattr(vm, "hardware_profile", None), "vm_size", None)
                        if vm_size:
                            size_map[vid] = vm_size
                    except Exception:
                        pass
                    # Capture power state via instance view
                    try:
                        statuses = compute_client.virtual_machines.instance_view(rg, vm.name).statuses
                        ps_codes = [s.code for s in statuses if s.code and s.code.startswith("PowerState/")]
                        if ps_codes:
                            state = ps_codes[-1].replace("PowerState/", "").lower()
                        else:
                            state = "unknown"
                        power_map[vid] = state
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning("[%s] VM power state fetch failed: %s", sub_id, exc)

    return power_map, size_map


def get_app_insights_links(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, str]:
    """
    Returns {web_app_resource_id_lower: app_insights_resource_id_lower}.

    Strategy:
    1. Find all App Insights components (microsoft.insights/components) in the resource list.
    2. For each web app, check its app settings for APPINSIGHTS_INSTRUMENTATIONKEY or
       APPLICATIONINSIGHTS_CONNECTION_STRING — if found, match to the component.
    3. Fall back to name/resource-group matching for apps without explicit settings.
    """
    from azure.mgmt.web import WebSiteManagementClient
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    # Build a map of instrumentation key → App Insights resource ID
    ikey_to_ai: Dict[str, str] = {}
    name_rg_to_ai: Dict[str, str] = {}
    for r in resources:
        if r["type"] == "microsoft.insights/components":
            # Tags sometimes carry the ikey; the resource name+RG is the fallback
            ikey = (r.get("tags") or {}).get("hidden-link", "")
            if ikey:
                ikey_to_ai[ikey.lower()] = r["id"].lower()
            name_rg_to_ai[f"{r['name'].lower()}|{r['resource_group'].lower()}"] = r["id"].lower()

    links: Dict[str, str] = {}
    for sub_id in sub_ids:
        try:
            web_client = WebSiteManagementClient(credential, sub_id)
            sub_apps   = [r for r in resources
                          if r["type"] == "microsoft.web/sites"
                          and r.get("subscription_id") == sub_id]
            for app in sub_apps:
                try:
                    settings = web_client.web_apps.list_application_settings(
                        app["resource_group"], app["name"]
                    )
                    props = settings.properties or {}
                    conn_str = props.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
                    ikey     = props.get("APPINSIGHTS_INSTRUMENTATIONKEY", "")

                    ai_id = None
                    if conn_str:
                        # Extract ikey from connection string
                        for part in conn_str.split(";"):
                            if part.lower().startswith("instrumentationkey="):
                                ikey = part.split("=", 1)[1]
                                break
                    if ikey:
                        ai_id = ikey_to_ai.get(ikey.lower())
                    if not ai_id:
                        # Fallback: match by app name in same resource group
                        key = f"{app['name'].lower()}|{app['resource_group'].lower()}"
                        ai_id = name_rg_to_ai.get(key)
                    if ai_id:
                        links[app["id"].lower()] = ai_id
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("[%s] App Insights link fetch failed: %s", sub_id, exc)

    logger.info("Linked %d web apps to App Insights components", len(links))
    return links


def get_resource_locks(
    subscription_ids: Optional[List[str]] = None,
) -> Set[str]:
    """
    Returns a set of resource_id_lower strings that have a ReadOnly or CanNotDelete lock.
    Locked resources are intentionally protected — never flag them as Not Used or orphaned.
    """
    from azure.mgmt.resource import ManagementLockClient
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    locked: Set[str] = set()

    for sub_id in sub_ids:
        try:
            lock_client = ManagementLockClient(credential, sub_id)
            for lock in lock_client.management_locks.list_at_subscription_level():
                # Subscription-level lock — protect everything (rare but possible)
                if lock.level in ("ReadOnly", "CanNotDelete"):
                    locked.add(f"/subscriptions/{sub_id}".lower())
            for lock in lock_client.management_locks.list_at_resource_group_level_by_subscription():
                if lock.level in ("ReadOnly", "CanNotDelete"):
                    # Resource group lock — we'll match resources by RG prefix
                    if lock.id:
                        rg_id = "/".join(lock.id.lower().split("/")[:5])
                        locked.add(rg_id)
            for lock in lock_client.management_locks.list_by_subscription():
                if lock.level in ("ReadOnly", "CanNotDelete") and lock.id:
                    # Resource-level lock — extract the resource ID from the lock ID
                    # Lock ID format: /subscriptions/{sub}/resourceGroups/{rg}/providers/{type}/{name}/providers/Microsoft.Authorization/locks/{lockName}
                    parts = lock.id.lower().split("/providers/microsoft.authorization/locks/")
                    if parts:
                        locked.add(parts[0])
        except Exception as exc:
            logger.warning("[%s] Lock check failed: %s", sub_id, exc)

    logger.info("Found %d locked resources/scopes across %d subscription(s)", len(locked), len(sub_ids))
    return locked


def get_app_service_details(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, Dict]:
    """
    Returns {app_resource_id_lower: details} for all web/function/logic apps.

    Fetched in one web_apps.list() pass per subscription (no per-app calls).
    Fields returned:
      app_kind          — "web" | "function" | "logic"
      runtime_stack     — e.g. "Python 3.11", "Node 20", ".NET 8"
      last_modified     — ISO datetime of last config change (proxy for last deploy)
      custom_domain_count — hostnames not ending in .azurewebsites.net/.azure-api.net
      health_check_enabled — True if health_check_path is set
      health_check_path   — the configured path
      ssl_expiry_date   — earliest SSL cert expiry date (ISO) across all custom hostnames
      slot_count        — number of deployment slots (excluding production)
      has_linked_storage — True if any Azure Storage accounts linked
    """
    from azure.mgmt.web import WebSiteManagementClient

    def _parse_runtime(site) -> str:
        cfg = getattr(site, "site_config", None)
        if not cfg:
            return ""
        _LABELS = {
            "python": "Python", "node": "Node", "dotnetcore": ".NET",
            "dotnet": ".NET", "java": "Java", "php": "PHP", "ruby": "Ruby",
            "go": "Go", "powershell": "PowerShell", "custom": "Custom Container",
        }
        for attr in ("linux_fx_version", "windows_fx_version"):
            fx = (getattr(cfg, attr, "") or "").strip()
            if fx and "|" in fx:
                rt, ver = fx.split("|", 1)
                label = _LABELS.get(rt.lower(), rt)
                return f"{label} {ver}" if ver else label
        net = (getattr(cfg, "net_framework_version", "") or "").lstrip("v")
        if net and net not in ("4.0", "4"):
            return f".NET {net}"
        for attr, label in [("java_version","Java"), ("php_version","PHP"),
                             ("python_version","Python"), ("node_version","Node")]:
            v = (getattr(cfg, attr, "") or "").strip()
            if v:
                return f"{label} {v}"
        return ""

    def _parse_kind(site) -> str:
        kind = (getattr(site, "kind", "") or "").lower()
        if "workflowapp" in kind or "logicapp" in kind:
            return "logic"
        if "functionapp" in kind:
            return "function"
        return "web"

    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    details: Dict[str, Dict] = {}

    for sub_id in sub_ids:
        try:
            web_client = WebSiteManagementClient(credential, sub_id)

            # One list() call returns all apps with full properties
            for site in web_client.web_apps.list():
                rid = (site.id or "").lower()
                if not rid:
                    continue

                # Custom domain count (filter out built-in Azure domains)
                host_names = getattr(site, "host_names", None) or []
                custom_domains = [h for h in host_names
                                  if not h.endswith(".azurewebsites.net")
                                  and not h.endswith(".azure-api.net")
                                  and not h.endswith(".trafficmanager.net")]

                # Earliest SSL cert expiry across all hostname SSL states
                ssl_expiry = None
                for ssl_state in (getattr(site, "host_name_ssl_states", None) or []):
                    exp = getattr(ssl_state, "expiry_date", None)
                    if exp:
                        exp_str = exp.isoformat() if hasattr(exp, "isoformat") else str(exp)
                        if ssl_expiry is None or exp_str < ssl_expiry:
                            ssl_expiry = exp_str

                # Last modified as proxy for last deployment
                lm = getattr(site, "last_modified_time_utc", None)
                last_modified = lm.isoformat() if hasattr(lm, "isoformat") else str(lm or "")

                hc_path = (getattr(site, "health_check_path", None) or
                           getattr(getattr(site, "site_config", None), "health_check_path", None) or "")

                details[rid] = {
                    "app_kind":             _parse_kind(site),
                    "runtime_stack":        _parse_runtime(site),
                    "last_modified":        last_modified,
                    "custom_domain_count":  len(custom_domains),
                    "health_check_enabled": bool(hc_path),
                    "health_check_path":    hc_path,
                    "ssl_expiry_date":      ssl_expiry,
                    "slot_count":           0,       # populated below
                    "has_linked_storage":   False,   # populated below
                    "app_state":            (getattr(site, "state", None) or "").lower(),  # "running" | "stopped"
                }

            # Deployment slot count — one list_slots() call per app (paginated, lazy)
            sub_apps = [r for r in resources
                        if r.get("subscription_id") == sub_id
                        and r["type"] == "microsoft.web/sites"]
            for r in sub_apps:
                rid = r["id"].lower()
                if rid not in details:
                    continue
                try:
                    slots = list(web_client.web_apps.list_slots(r["resource_group"], r["name"]))
                    details[rid]["slot_count"] = len(slots)
                except Exception:
                    pass

            # Linked Azure Storage — check app settings for AzureWebJobsStorage or WEBSITE_CONTENTAZUREFILECONNECTIONSTRING
            for r in sub_apps:
                rid = r["id"].lower()
                if rid not in details:
                    continue
                try:
                    settings = web_client.web_apps.list_application_settings(
                        r["resource_group"], r["name"]
                    )
                    props = settings.properties or {}
                    has_storage = any(
                        "storage" in k.lower() or "connectionstring" in k.lower()
                        for k in props.keys()
                    )
                    details[rid]["has_linked_storage"] = has_storage
                except Exception:
                    pass

        except Exception as exc:
            logger.warning("[%s] App Service detail fetch failed: %s", sub_id, exc)

    logger.info("Fetched app service details for %d apps", len(details))
    return details


def get_openai_deployments(credential, sub_id: str, resource_group: str, account_name: str) -> list:
    """Returns deployments for a Cognitive Services / OpenAI account."""
    try:
        from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
        client = CognitiveServicesManagementClient(credential, sub_id)
        result = []
        for d in client.deployments.list(resource_group, account_name):
            result.append({
                "name":     d.name,
                "model":    d.properties.model.name    if d.properties and d.properties.model else None,
                "version":  d.properties.model.version if d.properties and d.properties.model else None,
                "sku":      d.sku.name     if d.sku else None,
                "capacity": d.sku.capacity if d.sku else None,
                "state":    d.properties.provisioning_state if d.properties else None,
            })
        return result
    except Exception as exc:
        logger.warning("OpenAI deployment fetch failed for %s/%s: %s", resource_group, account_name, exc)
        return []


def get_private_endpoint_targets(
    subscription_ids: Optional[List[str]] = None,
) -> Set[str]:
    """
    Returns a set of resource_id_lower strings targeted by private endpoints.
    A resource with a private endpoint is actively used — strong positive signal (S16).
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    targets: Set[str] = set()

    for sub_id in sub_ids:
        try:
            network_client = NetworkManagementClient(credential, sub_id)
            for pe in network_client.private_endpoints.list_by_subscription():
                for conn in (pe.private_link_service_connections or []):
                    if conn.private_link_service_id:
                        targets.add(conn.private_link_service_id.lower())
                for conn in (pe.manual_private_link_service_connections or []):
                    if conn.private_link_service_id:
                        targets.add(conn.private_link_service_id.lower())
        except Exception as exc:
            logger.warning("[%s] Private endpoint target fetch failed: %s", sub_id, exc)

    logger.info("Found %d resources targeted by private endpoints", len(targets))
    return targets


def get_sql_replica_ids(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Set[str]:
    """
    Returns a set of resource_id_lower strings for SQL secondary replica databases.
    Geo-replicas and named replicas exist to serve the primary — should not be
    scored as waste independently (S11).
    """
    from azure.mgmt.sql import SqlManagementClient
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()
    replica_ids: Set[str] = set()

    for sub_id in sub_ids:
        try:
            sql_client   = SqlManagementClient(credential, sub_id)
            sub_dbs      = [r for r in resources
                            if r.get("subscription_id") == sub_id
                            and "microsoft.sql/servers/databases" in r["type"]]
            # Extract unique (rg, server_name) pairs from resource IDs
            rg_server: set = set()
            for r in sub_dbs:
                parts = r["id"].lower().split("/")
                try:
                    srv_idx = parts.index("servers")
                    rg_server.add((r["resource_group"], parts[srv_idx + 1]))
                except (ValueError, IndexError):
                    pass

            for rg, server in rg_server:
                try:
                    for db in sql_client.databases.list_by_server(rg, server):
                        if getattr(db, "secondary_type", None) in ("Geo", "Named"):
                            replica_ids.add((db.id or "").lower())
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("[%s] SQL replica check failed: %s", sub_id, exc)

    logger.info("Found %d SQL secondary replica databases", len(replica_ids))
    return replica_ids


def get_backup_protected_ids(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Set[str]:
    """
    Returns a set of resource IDs (lowercased) that are protected by an Azure Backup policy.
    Iterates every Recovery Services vault found in the resource list and queries its
    protected items. The source_resource_id on each item is the VM (or other resource) ID.
    """
    from azure.mgmt.recoveryservicesbackup import RecoveryServicesBackupClient

    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    vaults = [
        r for r in resources
        if r.get("type", "").lower() == "microsoft.recoveryservices/vaults"
    ]

    if not vaults:
        logger.info("No Recovery Services vaults found — skipping backup detection")
        return set()

    backed_up: Set[str] = set()

    for sub_id in sub_ids:
        client     = RecoveryServicesBackupClient(credential, sub_id)
        sub_vaults = [v for v in vaults if v.get("subscription_id", "") == sub_id]

        for vault in sub_vaults:
            try:
                items = client.backup_protected_items.list(
                    vault_name=vault["name"],
                    resource_group_name=vault["resource_group"],
                )
                for item in items:
                    props     = getattr(item, "properties", None)
                    source_id = getattr(props, "source_resource_id", None) or ""
                    if source_id:
                        backed_up.add(source_id.lower())
            except Exception as exc:
                logger.warning("Backup query failed for vault %s: %s", vault["name"], exc)

    logger.info(
        "Backup detection: %d protected resource(s) across %d vault(s)",
        len(backed_up), len(vaults),
    )
    return backed_up


def get_reservation_coverage(
    subscription_ids: Optional[List[str]] = None,
) -> Tuple[Set[str], List[Dict]]:
    """
    Returns (coverage_set, reservations_list).

    coverage_set: set of "{arm_type}|{location_lower}" for active reservations — used
        for S3 scoring (suppress RI recommendations, positive activity signal).

    reservations_list: list of dicts with full reservation details for the R2 dashboard
        view (name, display_name, resource_type, sku, location, term, quantity,
        expiry_date, utilization_pct, provisioning_state).
    """
    from azure.mgmt.reservations import AzureReservationAPI as ReservationManagementClient

    _TYPE_MAP = {
        # Compute
        "virtualmachines":              "microsoft.compute/virtualmachines",
        "virtualmachinescalesets":      "microsoft.compute/virtualmachinescalesets",
        "manageddisks":                 "microsoft.compute/disks",
        "dedicatedhost":                "microsoft.compute/dedicatedhosts",
        "dedicatedhosts":               "microsoft.compute/dedicatedhosts",
        # SQL
        "sqldatabases":                 "microsoft.sql/servers/databases",
        "sqldatawarehouse":             "microsoft.sql/servers/databases",
        "sqlmanagedinstances":          "microsoft.sql/managedinstances",
        "sqlmanagedinstance":           "microsoft.sql/managedinstances",
        "sqlelasticpool":               "microsoft.sql/servers/elasticpools",
        "sqlelasticpools":              "microsoft.sql/servers/elasticpools",
        # App Service
        "appservice":                   "microsoft.web/serverfarms",
        "azureappservice":              "microsoft.web/serverfarms",
        "appserviceenvironment":        "microsoft.web/serverfarms",
        # Cache
        "rediscache":                   "microsoft.cache/redis",
        "redisenterprise":              "microsoft.cache/redisenterprise",
        # Databases
        "cosmosdb":                     "microsoft.documentdb/databaseaccounts",
        "postgresqlflexibleservers":    "microsoft.dbforpostgresql/flexibleservers",
        "postgresql":                   "microsoft.dbforpostgresql/flexibleservers",
        "mysqlflexibleservers":         "microsoft.dbformysql/flexibleservers",
        "mysql":                        "microsoft.dbformysql/flexibleservers",
        "mariadb":                      "microsoft.dbformariadb/servers",
        # Containers / Kubernetes
        "aks":                          "microsoft.containerservice/managedclusters",
        "azurekubernetesservice":       "microsoft.containerservice/managedclusters",
        "managedclusters":              "microsoft.containerservice/managedclusters",
        # Analytics
        "databricks":                   "microsoft.databricks/workspaces",
        "synapse":                      "microsoft.synapse/workspaces",
        "synapseanalytics":             "microsoft.synapse/workspaces",
        "azuresynapseanalytics":        "microsoft.synapse/workspaces",
        # AI / Search
        "azuresearch":                  "microsoft.search/searchservices",
        "searchservices":               "microsoft.search/searchservices",
        "cognitiveservices":            "microsoft.cognitiveservices/accounts",
        "azureopenai":                  "microsoft.cognitiveservices/accounts",
        # Data / Storage
        "azurekusto":                   "microsoft.kusto/clusters",
        "netappfiles":                  "microsoft.netapp/netappaccounts/capacitypools",
        "netappstorage":                "microsoft.netapp/netappaccounts/capacitypools",
        # Infrastructure
        "hdinsight":                    "microsoft.hdinsight/clusters",
        "avs":                          "microsoft.avs/privateclouds",
        "signalr":                      "microsoft.signalrservice/signalr",
        "applicationgateway":           "microsoft.network/applicationgateways",
        "applicationgateways":          "microsoft.network/applicationgateways",
        # Azure ML compute instances/clusters are reserved under the MachineLearningServices type.
        # They map back to the workspace (the only ARM-level ML resource with cost).
        "machinelearningservices":      "microsoft.machinelearningservices/workspaces",
    }

    _TERM_LABEL = {"p1y": "1 Year", "p3y": "3 Years"}

    # States that mean "this reservation is dead — ignore it"
    _DEAD_STATES = {"cancelled", "expired", "billingfailed", "failed", "split", "merged"}

    credential = get_credential()
    covered: Set[str] = set()
    reservations: List[Dict] = []

    try:
        client = ReservationManagementClient(credential)
        all_items = list(client.reservation.list_all())
        logger.info("Reservation API returned %d raw items", len(all_items))
        for res in all_items:
            props = getattr(res, "properties", None)
            if not props:
                continue
            state = (getattr(props, "provisioning_state", "") or "").lower()
            if not state or state in _DEAD_STATES:
                continue

            res_type_raw = (getattr(props, "reserved_resource_type", "") or "").lower().replace(" ", "").replace("_", "")
            # ReservationsProperties has NO location field — location lives on the top-level
            # ReservationResponse object (res.location).
            raw_loc  = (getattr(res, "location", "") or "").strip()
            location = raw_loc.lower().replace(" ", "")
            sku_name = getattr(getattr(res, "sku", None), "name", None) or ""
            arm_type = _TYPE_MAP.get(res_type_raw)
            logger.info(
                "Reservation: name=%r display=%r state=%r type_raw=%r arm_type=%r "
                "res.location=%r location_final=%r sku=%r",
                getattr(res, "name", ""),
                getattr(props, "display_name", ""),
                state,
                res_type_raw,
                arm_type,
                getattr(res, "location", None),
                location,
                sku_name,
            )
            if arm_type:
                if location:
                    covered.add(f"{arm_type}|{location}")
                else:
                    # Location unknown (possible for management-group-scoped reservations).
                    # Use a wildcard so ALL resources of this type are suppressed from RI candidates.
                    covered.add(f"{arm_type}|*")
                    logger.warning("Reservation %r has no location — wildcard coverage added for type %r",
                                   getattr(res, "name", ""), arm_type)

            term_raw     = (getattr(props, "term", "") or "").lower()
            expiry       = getattr(props, "expiry_date", None)
            expiry_str   = expiry.isoformat() if hasattr(expiry, "isoformat") else str(expiry or "")
            # purchase_date is a date object; benefit_start_time is a datetime — prefer purchase_date
            effective_dt = getattr(props, "purchase_date", None) or getattr(props, "benefit_start_time", None) or getattr(props, "effective_date_time", None)
            effective_str = effective_dt.isoformat() if hasattr(effective_dt, "isoformat") else str(effective_dt or "")
            util         = getattr(props, "utilization", None)
            util_pct     = None
            if util is not None:
                try:
                    util_pct = float(getattr(util, "trend", None) or getattr(util, "avg_utilization_percentage", None) or 0)
                except Exception:
                    pass

            reservations.append({
                "reservation_id":    getattr(res, "id", "") or "",
                "name":              getattr(res, "name", "") or "",
                "display_name":      getattr(props, "display_name", "") or getattr(res, "name", "") or "",
                "resource_type":     arm_type or res_type_raw,
                "sku":               sku_name,
                "location":          location,
                "term":              _TERM_LABEL.get(term_raw, term_raw.upper()),
                "quantity":          getattr(props, "quantity", 1) or 1,
                "expiry_date":       expiry_str,
                "effective_date":    effective_str,
                "utilization_pct":   util_pct,
                "provisioning_state": state,
            })
    except Exception as exc:
        logger.warning("Reservation coverage fetch failed: %s", exc)

    logger.info("Found %d active reservations covering %d type+location combinations",
                len(reservations), len(covered))
    return covered, reservations


def get_rbac_signals(
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, int]:
    """
    Returns {resource_id_lower: direct_assignment_count} for resources that have
    one or more role assignments scoped directly to them (not inherited from RG/sub).

    A resource with direct role assignments is actively used by someone —
    treat as a positive activity signal (S7). Excludes the scanning service
    principal to avoid false positives on every resource.
    """
    from azure.mgmt.authorization import AuthorizationManagementClient
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    # Exclude our own scanning SP so it doesn't pollute every resource's signal
    import os
    scan_sp = os.getenv("AZURE_CLIENT_ID", "").lower()

    rbac: Dict[str, int] = {}

    for sub_id in sub_ids:
        try:
            auth_client = AuthorizationManagementClient(credential, sub_id)
            for assignment in auth_client.role_assignments.list_for_subscription():
                scope = (assignment.scope or "").lower().rstrip("/")
                # Direct resource assignment: scope contains /providers/ and is not a sub or RG scope
                if "/providers/" not in scope:
                    continue
                # Skip if this is the scanning SP
                principal = (assignment.principal_id or "").lower()
                if principal == scan_sp:
                    continue
                rbac[scope] = rbac.get(scope, 0) + 1
        except Exception as exc:
            logger.warning("[%s] RBAC signal fetch failed: %s", sub_id, exc)

    logger.info("Found direct RBAC assignments on %d resources", len(rbac))
    return rbac


def get_vm_attachments(
    resources: List[Dict],
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, str]:
    """
    Returns {attached_resource_id_lower: vm_resource_id_lower} for:
    - Managed disks attached to VMs (via disk.managed_by)
    - NICs attached to VMs (via nic.virtual_machine)
    - Public IPs assigned to NICs that connect to VMs

    Used for S9 dependency propagation: attached NICs/disks/PIPs should
    inherit their parent VM's score rather than scoring independently.
    """
    credential = get_credential()
    sub_ids = subscription_ids or get_subscription_ids()
    attachments: Dict[str, str] = {}

    for sub_id in sub_ids:
        try:
            compute_client = ComputeManagementClient(credential, sub_id)
            network_client = NetworkManagementClient(credential, sub_id)

            # --- Attached managed disks → VM ---
            try:
                for disk in compute_client.disks.list():
                    if disk.managed_by and disk.disk_state and disk.disk_state.lower() in ("attached", "reserved"):
                        attachments[(disk.id or "").lower()] = disk.managed_by.lower()
            except Exception as exc:
                logger.warning("[%s] Disk attachment fetch failed: %s", sub_id, exc)

            # --- NICs → VM; also collect NIC ID for PIP resolution ---
            nic_to_vm: Dict[str, str] = {}
            try:
                for nic in network_client.network_interfaces.list_all():
                    if nic.virtual_machine and nic.virtual_machine.id:
                        vm_id = nic.virtual_machine.id.lower()
                        nic_id = (nic.id or "").lower()
                        attachments[nic_id] = vm_id
                        nic_to_vm[nic_id] = vm_id
            except Exception as exc:
                logger.warning("[%s] NIC attachment fetch failed: %s", sub_id, exc)

            # --- Public IPs assigned to a NIC that's attached to a VM ---
            try:
                for pip in network_client.public_ip_addresses.list_all():
                    if pip.ip_configuration and pip.ip_configuration.id:
                        cfg_id = pip.ip_configuration.id.lower()
                        # cfg_id: .../networkInterfaces/{nic}/ipConfigurations/{cfg}
                        if "/ipconfigurations/" in cfg_id:
                            nic_id = cfg_id.split("/ipconfigurations/")[0]
                            vm_id = nic_to_vm.get(nic_id)
                            if vm_id:
                                attachments[(pip.id or "").lower()] = vm_id
            except Exception as exc:
                logger.warning("[%s] PIP attachment fetch failed: %s", sub_id, exc)

        except Exception as exc:
            logger.error("VM attachment fetch failed for subscription %s: %s", sub_id, exc)

    logger.info("Found %d VM-attached resources (disks/NICs/PIPs) across %d subscription(s)",
                len(attachments), len(sub_ids))
    return attachments


def _extract_rg(resource_id: str) -> str:
    parts = resource_id.lower().split("/")
    try:
        idx = parts.index("resourcegroups")
        return parts[idx + 1]
    except (ValueError, IndexError):
        return "unknown"


def _extract_sku(resource) -> str | None:
    if hasattr(resource, "sku") and resource.sku:
        sku = resource.sku
        parts = []
        if hasattr(sku, "tier") and sku.tier:
            parts.append(sku.tier)
        if hasattr(sku, "name") and sku.name:
            parts.append(sku.name)
        return "/".join(parts) if parts else None
    return None


# ── Reservation recommendations (Consumption API) ────────────────────────────

# Maps Consumption API resourceType values → ARM resource types
_REC_TYPE_MAP: Dict[str, str] = {
    "virtualmachines":          "microsoft.compute/virtualmachines",
    "sqldatabases":             "microsoft.sql/servers/databases",
    "sqlmanagedinstances":      "microsoft.sql/managedinstances",
    "sqlelasticpool":           "microsoft.sql/servers/elasticpools",
    "rediscache":               "microsoft.cache/redis",
    "cosmosdb":                 "microsoft.documentdb/databaseaccounts",
    "postgresqlflexibleservers":"microsoft.dbforpostgresql/flexibleservers",
    "mysqlflexibleservers":     "microsoft.dbformysql/flexibleservers",
    "appservice":               "microsoft.web/serverfarms",
    "manageddisks":             "microsoft.compute/disks",
    "databricks":               "microsoft.databricks/workspaces",
    "synapse":                  "microsoft.synapse/workspaces",
    "azuresearch":              "microsoft.search/searchservices",
    "azurekusto":               "microsoft.kusto/clusters",
    "aks":                      "microsoft.containerservice/managedclusters",
}


def get_reservation_recommendations(
    subscription_ids: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Calls Microsoft.Consumption/reservationRecommendations for each subscription.
    Returns Microsoft's own gap analysis — recommended purchases with net savings.
    Gracefully returns [] if the API is unavailable or lacks permissions.
    """
    import httpx as _httpx

    credential = get_credential()
    try:
        token = credential.get_token("https://management.azure.com/.default")
        headers = {"Authorization": f"Bearer {token.token}"}
    except Exception as exc:
        logger.debug("get_reservation_recommendations: token error: %s", exc)
        return []

    _TERM_MAP = {"P1Y": "1 Year", "P3Y": "3 Years"}
    results: List[Dict] = []
    sub_ids = subscription_ids or get_subscription_ids()

    for sub_id in sub_ids:
        try:
            resp = _httpx.get(
                f"https://management.azure.com/subscriptions/{sub_id}"
                "/providers/Microsoft.Consumption/reservationRecommendations",
                params={"api-version": "2023-05-01", "scope": "Single"},
                headers=headers,
                timeout=20.0,
            )
            if resp.status_code != 200:
                logger.debug("reservationRecommendations %d for sub %s", resp.status_code, sub_id)
                continue

            for rec in resp.json().get("value", []):
                props = rec.get("properties", {})
                raw_type = (props.get("resourceType", "") or "").lower().replace(" ", "").replace("_", "")
                arm_type = _REC_TYPE_MAP.get(raw_type, raw_type)

                # sku_name may come as a top-level string or from skuProperties list
                sku_name = props.get("skuName", "")
                if not sku_name and isinstance(props.get("skuProperties"), list):
                    sku_vals = [p.get("value", "") for p in props["skuProperties"] if p.get("name") == "Cores" or p.get("name") == "Name"]
                    sku_name = ", ".join(v for v in sku_vals if v)

                # netSavings is over the full term; convert to monthly
                net_savings_total = float(props.get("netSavings", 0) or 0)
                term_raw = (props.get("term", "") or "").upper()
                months = 12 if term_raw == "P1Y" else 36 if term_raw == "P3Y" else 12
                monthly_savings = round(net_savings_total / months, 2) if months else 0

                results.append({
                    "subscription_id":      sub_id,
                    "resource_type":        arm_type,
                    "sku":                  sku_name,
                    "location":             (props.get("location", "") or "").lower().replace(" ", ""),
                    "term":                 _TERM_MAP.get(term_raw, term_raw),
                    "look_back_period":     props.get("lookBackPeriod", "Last30Days"),
                    "recommended_quantity": int(props.get("recommendedQuantity", 0) or 0),
                    "net_savings_monthly":  monthly_savings,
                    "scope":               props.get("scope", "Single"),
                    "first_usage_date":    str(props.get("firstUsageDate", "") or ""),
                })
        except Exception as exc:
            logger.warning("Reservation recommendations failed for %s: %s", sub_id, exc)

    logger.info("Fetched %d reservation recommendations across %d subscription(s)",
                len(results), len(sub_ids))
    return results
