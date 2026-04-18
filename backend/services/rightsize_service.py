"""
Right-sizing recommendations for VMs and SQL databases.
Uses CPU utilisation thresholds to suggest the next smaller SKU tier.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# VM families: series_key → [(sku_name, vcpus), ...]  ascending by size
VM_SERIES: Dict[str, List[Tuple[str, int]]] = {
    "b": [("Standard_B1ms",1),("Standard_B2ms",2),("Standard_B4ms",4),
          ("Standard_B8ms",8),("Standard_B12ms",12),("Standard_B16ms",16),("Standard_B20ms",20)],
    "d_v3": [("Standard_D2_v3",2),("Standard_D4_v3",4),("Standard_D8_v3",8),
             ("Standard_D16_v3",16),("Standard_D32_v3",32),("Standard_D48_v3",48),("Standard_D64_v3",64)],
    "ds_v3":[("Standard_D2s_v3",2),("Standard_D4s_v3",4),("Standard_D8s_v3",8),
             ("Standard_D16s_v3",16),("Standard_D32s_v3",32),("Standard_D48s_v3",48),("Standard_D64s_v3",64)],
    "d_v4": [("Standard_D2_v4",2),("Standard_D4_v4",4),("Standard_D8_v4",8),
             ("Standard_D16_v4",16),("Standard_D32_v4",32),("Standard_D48_v4",48),("Standard_D64_v4",64)],
    "ds_v4":[("Standard_D2s_v4",2),("Standard_D4s_v4",4),("Standard_D8s_v4",8),("Standard_D16s_v4",16),("Standard_D32s_v4",32)],
    "d_v5": [("Standard_D2_v5",2),("Standard_D4_v5",4),("Standard_D8_v5",8),
             ("Standard_D16_v5",16),("Standard_D32_v5",32),("Standard_D48_v5",48),("Standard_D64_v5",64),("Standard_D96_v5",96)],
    "ds_v5":[("Standard_D2s_v5",2),("Standard_D4s_v5",4),("Standard_D8s_v5",8),("Standard_D16s_v5",16),("Standard_D32s_v5",32)],
    "e_v3": [("Standard_E2_v3",2),("Standard_E4_v3",4),("Standard_E8_v3",8),
             ("Standard_E16_v3",16),("Standard_E20_v3",20),("Standard_E32_v3",32),("Standard_E48_v3",48),("Standard_E64_v3",64)],
    "es_v3":[("Standard_E2s_v3",2),("Standard_E4s_v3",4),("Standard_E8s_v3",8),
             ("Standard_E16s_v3",16),("Standard_E20s_v3",20),("Standard_E32s_v3",32),("Standard_E48s_v3",48),("Standard_E64s_v3",64)],
    "e_v5": [("Standard_E2_v5",2),("Standard_E4_v5",4),("Standard_E8_v5",8),
             ("Standard_E16_v5",16),("Standard_E32_v5",32),("Standard_E48_v5",48),("Standard_E64_v5",64)],
    "es_v5":[("Standard_E2s_v5",2),("Standard_E4s_v5",4),("Standard_E8s_v5",8),
             ("Standard_E16s_v5",16),("Standard_E32s_v5",32)],
    "f_v2": [("Standard_F2s_v2",2),("Standard_F4s_v2",4),("Standard_F8s_v2",8),
             ("Standard_F16s_v2",16),("Standard_F32s_v2",32),("Standard_F48s_v2",48),("Standard_F64s_v2",64),("Standard_F72s_v2",72)],
}

# App Service Plan tier families: key → [(sku_name, relative_cost_units), ...] ascending
APP_SERVICE_FAMILIES: Dict[str, List[Tuple[str, int]]] = {
    "b":   [("B1", 1), ("B2", 2), ("B3", 4)],
    "s":   [("S1", 1), ("S2", 2), ("S3", 4)],
    "pv2": [("P1v2", 1), ("P2v2", 2), ("P3v2", 4)],
    "pv3": [("P1v3", 1), ("P2v3", 2), ("P3v3", 4)],
    "ep":  [("EP1", 1),  ("EP2", 2),  ("EP3", 4)],
    "iv2": [("I1v2", 1), ("I2v2", 2), ("I3v2", 4)],
}

# SQL service tier ordering with approximate monthly cost
SQL_TIERS: List[Tuple[str, float]] = [
    ("Basic", 5), ("S0",15), ("S1",30), ("S2",75), ("S3",150),
    ("S4",300), ("P1",465), ("P2",930), ("P4",1860), ("P6",3720),
]


@dataclass
class RightSizeRec:
    resource_id:       str
    resource_name:     str
    resource_type:     str
    resource_group:    str
    current_sku:       str
    suggested_sku:     str
    current_cost:      float
    estimated_savings: float
    savings_pct:       float
    reason:            str
    cpu_pct:           Optional[float]


def _asp_family_key(sku_name: str) -> Optional[str]:
    """Map an App Service Plan SKU name to its family key."""
    s = sku_name.lower()
    if s.startswith("ep"):                return "ep"
    if s.startswith("i") and "v2" in s:   return "iv2"
    if s.startswith("p") and "v3" in s:   return "pv3"
    if s.startswith("p") and "v2" in s:   return "pv2"
    if s.startswith("s"):                 return "s"
    if s.startswith("b"):                 return "b"
    return None


def _asp_suggestion(sku_name: str, cpu_pct: Optional[float]) -> Optional[Tuple[str, float]]:
    """Return (suggested_sku, savings_fraction) for an oversized App Service Plan."""
    if not sku_name or cpu_pct is None:
        return None
    key    = _asp_family_key(sku_name)
    series = APP_SERVICE_FAMILIES.get(key) if key else None
    if not series:
        return None
    for idx, (name, units) in enumerate(series):
        if name.lower() == sku_name.lower():
            drop = 2 if cpu_pct < 5 else 1 if cpu_pct < 20 else 0
            target_idx = max(0, idx - drop)
            if target_idx < idx:
                t_name, t_units = series[target_idx]
                return t_name, 1.0 - (t_units / units)
    return None


def _sku_key(sku: str) -> Optional[str]:
    """Normalise SKU name to family key used in VM_SERIES."""
    s = sku.lower().replace("standard_", "")
    # Map to family key: e.g. "d8s_v3" → "ds_v3", "e16_v5" → "e_v5"
    import re
    m = re.match(r"([a-z]+)\d+([a-z]*)_(v\d+)", s)
    if not m:
        return None
    family_letter, suffix, version = m.group(1), m.group(2), m.group(3)
    key = family_letter + (suffix if suffix else "") + "_" + version
    return key


def _vm_suggestion(sku: str, cpu_pct: Optional[float]) -> Optional[Tuple[str, float]]:
    if not sku or cpu_pct is None:
        return None
    key = _sku_key(sku)
    series = VM_SERIES.get(key) if key else None
    if not series:
        return None

    for idx, (name, vcpus) in enumerate(series):
        if name.lower() == sku.lower():
            drop = 2 if cpu_pct < 5 else 1 if cpu_pct < 20 else 0
            if drop == 0:
                return None
            target_idx  = max(0, idx - drop)
            if target_idx < idx:
                t_name, t_vcpus = series[target_idx]
                return t_name, 1.0 - (t_vcpus / vcpus)
    return None


def get_rightsize_recommendations(resources: List[dict]) -> List[RightSizeRec]:
    recs: List[RightSizeRec] = []

    for r in resources:
        rtype = r.get("resource_type", "").lower()
        sku   = r.get("sku") or ""
        cpu   = r.get("avg_cpu_pct")
        cost  = r.get("cost_current_month", 0.0)
        score = r.get("final_score", 100)

        if cost < 5 or score > 72:
            continue

        if "microsoft.web/serverfarms" in rtype:
            # SKU tier downgrade for App Service Plans
            sku_name = sku.split("/")[-1] if sku and "/" in sku else (sku or "")
            result = _asp_suggestion(sku_name, cpu)
            if result:
                suggested, frac = result
                savings = round(cost * frac, 2)
                recs.append(RightSizeRec(
                    resource_id=r["resource_id"], resource_name=r["resource_name"],
                    resource_type=r["resource_type"], resource_group=r["resource_group"],
                    current_sku=sku_name, suggested_sku=suggested,
                    current_cost=cost, estimated_savings=savings,
                    savings_pct=round(frac * 100, 1),
                    reason=f"Avg CPU {cpu:.1f}% — plan tier is oversized for actual load",
                    cpu_pct=cpu,
                ))

        elif "microsoft.compute/virtualmachines" in rtype:
            result = _vm_suggestion(sku, cpu)
            if result:
                suggested, frac = result
                savings = round(cost * frac, 2)
                recs.append(RightSizeRec(
                    resource_id=r["resource_id"], resource_name=r["resource_name"],
                    resource_type=r["resource_type"], resource_group=r["resource_group"],
                    current_sku=sku, suggested_sku=suggested,
                    current_cost=cost, estimated_savings=savings,
                    savings_pct=round(frac * 100, 1),
                    reason=f"Avg CPU {cpu:.1f}% — SKU is oversized for actual workload",
                    cpu_pct=cpu,
                ))

        elif "microsoft.sql/servers/databases" in rtype and cpu is not None and cpu < 20:
            curr_entry = next(((n, c) for n, c in SQL_TIERS if n.lower() in sku.lower()), None)
            if curr_entry:
                curr_name, curr_c = curr_entry
                cheaper = [(n, c) for n, c in SQL_TIERS if c < curr_c * 0.65]
                if cheaper:
                    t_name, t_c = cheaper[-1]
                    frac    = 1.0 - t_c / curr_c
                    savings = round(cost * frac, 2)
                    recs.append(RightSizeRec(
                        resource_id=r["resource_id"], resource_name=r["resource_name"],
                        resource_type=r["resource_type"], resource_group=r["resource_group"],
                        current_sku=curr_name, suggested_sku=t_name,
                        current_cost=cost, estimated_savings=savings,
                        savings_pct=round(frac * 100, 1),
                        reason=f"DTU/CPU avg {cpu:.1f}% — lower service tier is sufficient",
                        cpu_pct=cpu,
                    ))

    return sorted(recs, key=lambda x: -x.estimated_savings)[:30]
