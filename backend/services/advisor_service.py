"""
Pulls ALL Azure Advisor recommendations (Cost, Performance, Reliability,
Security, OperationalExcellence) and maps them to resource IDs.
Supports multiple subscriptions.

Score impact per category + impact level:
  Cost         High → -20, Medium → -12, Low → -6
  Performance  High → -10, Medium →  -6, Low → -3
  Reliability  High → -10, Medium →  -6, Low → -3
  Security     High → -15, Medium →  -8, Low → -4
  Operational  High →  -5, Medium →  -3, Low → -1
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from azure.mgmt.advisor import AdvisorManagementClient

from .azure_auth import get_credential, get_subscription_ids

logger = logging.getLogger(__name__)

SCORE_IMPACT: Dict[str, Dict[str, int]] = {
    "cost":                  {"high": -20, "medium": -12, "low": -6},
    "performance":           {"high": -10, "medium":  -6, "low": -3},
    "highavailability":      {"high": -10, "medium":  -6, "low": -3},
    "reliability":           {"high": -10, "medium":  -6, "low": -3},
    "security":              {"high": -15, "medium":  -8, "low": -4},
    "operationalexcellence": {"high":  -5, "medium":  -3, "low": -1},
}


class AdvisorRec:
    __slots__ = ("resource_id", "category", "impact", "short_description",
                 "score_impact", "potential_savings")

    def __init__(
        self,
        resource_id: str,
        category: str,
        impact: str,
        short_description: str,
        score_impact: int,
        potential_savings: float = 0.0,
    ):
        self.resource_id       = resource_id.lower()
        self.category          = category
        self.impact            = impact
        self.short_description = short_description
        self.score_impact      = score_impact
        self.potential_savings = potential_savings


def get_advisor_recommendations(
    subscription_ids: Optional[List[str]] = None,
) -> Dict[str, List[AdvisorRec]]:
    """
    Returns {resource_id_lower: [AdvisorRec, ...]} aggregated across all subscriptions.
    """
    credential = get_credential()
    sub_ids    = subscription_ids or get_subscription_ids()

    result: Dict[str, List[AdvisorRec]] = {}

    for sub_id in sub_ids:
        try:
            client = AdvisorManagementClient(credential, sub_id)
            recs   = list(client.recommendations.list())
            logger.info("[%s] Azure Advisor returned %d recommendations", sub_id, len(recs))

            for rec in recs:
                try:
                    rid = _extract_resource_id(rec)
                    if not rid:
                        continue

                    category    = (rec.category or "operationalexcellence").lower().replace(" ", "")
                    impact      = (rec.impact   or "low").lower()
                    impact_map  = SCORE_IMPACT.get(category, SCORE_IMPACT["operationalexcellence"])
                    score_impact = impact_map.get(impact, -1)

                    desc = ""
                    if rec.short_description:
                        desc = rec.short_description.solution or rec.short_description.problem or ""

                    savings = 0.0
                    if rec.extended_properties:
                        raw = (rec.extended_properties.get("savingsAmount")
                               or rec.extended_properties.get("annualSavingsAmount", 0))
                        try:
                            savings = float(raw) / 12 if "annual" in str(rec.extended_properties).lower() else float(raw)
                        except (TypeError, ValueError):
                            pass

                    result.setdefault(rid, []).append(
                        AdvisorRec(
                            resource_id=rid,
                            category=category,
                            impact=impact,
                            short_description=desc,
                            score_impact=score_impact,
                            potential_savings=savings,
                        )
                    )

                except Exception as e:
                    logger.debug("Skipping advisor rec: %s", e)

        except Exception as exc:
            logger.warning("[%s] Advisor API call failed: %s", sub_id, exc)

    return result


def _extract_resource_id(rec) -> str | None:
    """Try multiple fields to extract a clean resource ID."""
    try:
        rid = rec.resource_metadata.resource_id
        if rid:
            return rid.lower().strip()
    except AttributeError:
        pass
    try:
        if rec.impacted_value and "/" in rec.impacted_value:
            return rec.impacted_value.lower().strip()
    except AttributeError:
        pass
    return None
