"""
Estimates monthly carbon footprint per resource.
Formula: kWh/month = (watts × 730 hours) / 1000
         kgCO2/month = kWh × regional_carbon_intensity
"""
from __future__ import annotations
from typing import Dict, Optional

# kgCO2 per kWh by Azure region (approximate 2023 data)
CARBON_INTENSITY: Dict[str, float] = {
    "eastus": 0.386,   "eastus2": 0.386,  "westus": 0.322,
    "westus2": 0.136,  "westus3": 0.322,  "centralus": 0.514,
    "northcentralus": 0.514, "southcentralus": 0.514,
    "canadacentral": 0.120, "canadaeast": 0.010, "brazilsouth": 0.074,
    "northeurope": 0.101,  "westeurope": 0.210,
    "uksouth": 0.228,  "ukwest": 0.228,   "francecentral": 0.056,
    "germanywestcentral": 0.338, "swedencentral": 0.009,
    "norwayeast": 0.017, "switzerlandnorth": 0.029,
    "eastasia": 0.684, "southeastasia": 0.493,
    "australiaeast": 0.730, "australiasoutheast": 0.730,
    "japaneast": 0.506, "japanwest": 0.506, "koreacentral": 0.415,
    "centralindia": 0.708, "southindia": 0.708, "westindia": 0.708,
    "default": 0.400,
}

# Estimated average watts by resource type
POWER_W: Dict[str, float] = {
    "microsoft.compute/virtualmachines":              150.0,
    "microsoft.compute/virtualmachinescalesets":       75.0,
    "microsoft.compute/disks":                          2.0,
    "microsoft.sql/servers/databases":                 50.0,
    "microsoft.sql/servers/elasticpools":              80.0,
    "microsoft.dbformysql/flexibleservers":            40.0,
    "microsoft.dbformysql/servers":                    40.0,
    "microsoft.dbforpostgresql/flexibleservers":       40.0,
    "microsoft.dbforpostgresql/servers":               40.0,
    "microsoft.storage/storageaccounts":                5.0,
    "microsoft.cache/redis":                           30.0,
    "microsoft.documentdb/databaseaccounts":           40.0,
    "microsoft.web/sites":                             10.0,
    "microsoft.web/serverfarms":                       20.0,
    "microsoft.logic/workflows":                        2.0,
    "microsoft.containerservice/managedclusters":     200.0,
    "microsoft.containerinstance/containergroups":     20.0,
    "microsoft.containerregistry/registries":           5.0,
    "microsoft.network/applicationgateways":           20.0,
    "microsoft.network/loadbalancers":                  5.0,
    "microsoft.network/virtualnetworkgateways":        10.0,
    "microsoft.network/publicipaddresses":              0.5,
    "microsoft.apimanagement/service":                 30.0,
    "microsoft.datafactory/factories":                 15.0,
    "microsoft.eventhub/namespaces":                   10.0,
    "microsoft.servicebus/namespaces":                 10.0,
    "microsoft.cognitiveservices/accounts":            15.0,
    "microsoft.search/searchservices":                 20.0,
    "microsoft.hdinsight/clusters":                   300.0,
    "microsoft.databricks/workspaces":                200.0,
    "microsoft.synapse/workspaces":                    50.0,
    "microsoft.devices/iothubs":                       10.0,
    "microsoft.keyvault/vaults":                        2.0,
    "microsoft.operationalinsights/workspaces":         5.0,
    "microsoft.machinelearningservices/workspaces":    40.0,
    "default":                                          5.0,
}

# vCPU-based multiplier for VMs — extracted from SKU string
def _vm_power_watts(sku: Optional[str]) -> float:
    """Estimate VM watts from SKU name (e.g. Standard_D8s_v3 → 8 vCPUs)."""
    if not sku:
        return POWER_W["microsoft.compute/virtualmachines"]
    parts = sku.lower().split("_")
    for part in parts:
        # Find the numeric size (2, 4, 8, 16 ...)
        digits = "".join(c for c in part if c.isdigit())
        if digits and 1 <= int(digits) <= 512:
            vcpus = int(digits)
            # ~15W per vCPU + 20W base overhead
            return 20.0 + vcpus * 15.0
    return POWER_W["microsoft.compute/virtualmachines"]


HOURS_PER_MONTH = 730.0


def estimate_carbon(resource_type: str, location: str, sku: Optional[str] = None) -> float:
    """Returns estimated kgCO2 per month."""
    region_key = location.lower().replace(" ", "").replace("-", "")
    intensity  = CARBON_INTENSITY.get(region_key, CARBON_INTENSITY["default"])
    rtype      = resource_type.lower()

    if "microsoft.compute/virtualmachines" in rtype:
        watts = _vm_power_watts(sku)
    else:
        watts = POWER_W.get(rtype, POWER_W["default"])

    kwh = (watts * HOURS_PER_MONTH) / 1000.0
    return round(kwh * intensity, 3)


def carbon_equivalents(total_kg: float) -> dict:
    return {
        "car_km":              round(total_kg / 0.21,  0),
        "flights_nyc_la":      round(total_kg / 250.0, 1),
        "trees_to_offset":     round(total_kg / 22.0,  0),
        "smartphones_charged": round(total_kg / 0.008, 0),
    }
