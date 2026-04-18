"""
AI scoring layer — supports Claude (Anthropic) and Azure OpenAI as interchangeable providers.

Provider is selected via the `ai_provider` setting:
  "claude"       — uses Anthropic API (ANTHROPIC_API_KEY)
  "azure_openai" — uses Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY + AZURE_OPENAI_DEPLOYMENT)
  "none"         — AI scoring disabled

Resources are batched (up to 10 per call). Only resources with rule-based score < 75
OR monthly cost > threshold are sent for review.
"""
from __future__ import annotations

import json
import logging
import os
from typing import List

logger = logging.getLogger(__name__)

CLAUDE_MODEL   = "claude-haiku-4-5-20251001"
AI_BATCH_SIZE  = 10
AI_SCORE_THRESHOLD = 75
AI_COST_THRESHOLD  = 20.0


class AIVerdict:
    __slots__ = ("resource_id", "score_adjustment", "confidence",
                 "action", "explanation", "action_steps", "error")

    def __init__(self, resource_id: str, score_adjustment: int = 0,
                 confidence: str = "low", action: str = "monitor",
                 explanation: str = "", action_steps: list = None, error: str = ""):
        self.resource_id      = resource_id.lower()
        self.score_adjustment = score_adjustment   # -30 to +10
        self.confidence       = confidence          # "high" | "medium" | "low"
        self.action           = action              # "delete"|"downsize"|"reserve"|"monitor"|"none"
        self.explanation      = explanation
        self.action_steps     = action_steps or []  # specific step-by-step plan for this resource
        self.error            = error


def _build_resource_context(resource: dict) -> dict:
    # Build the Advisor recs list with enough detail for the AI to cite specific recommendations
    advisor_recs = [
        {
            "category":    rec.get("category", ""),
            "impact":      rec.get("impact", ""),
            "description": rec.get("short_description", ""),
            "savings":     rec.get("potential_savings", 0),
        }
        for rec in resource.get("advisor_recommendations", [])
    ]

    delta_is_mtd = resource.get("cost_delta_is_mtd", False)
    ctx = {
        "name":              resource.get("resource_name", ""),
        "type":              resource.get("resource_type", "").split("/")[-1],
        "rg":                resource.get("resource_group", ""),
        "sku":               resource.get("sku") or "unknown",
        "cost_curr":         round(resource.get("cost_current_month", 0), 2),
        # Only expose the full-month figure when we have a valid MTD comparison.
        # When delta_is_mtd=False we fell back to full-month vs partial-month, which
        # always shows a fake drop — omit it so the AI cannot cite a misleading number.
        "cost_prev_full_mo": round(resource.get("cost_previous_month", 0), 2) if delta_is_mtd else None,
        # MTD-to-MTD delta — only valid comparison during a live month (same elapsed days)
        "cost_prev_mtd":     round(resource.get("cost_previous_month_mtd", 0), 2),
        "delta_is_mtd":      delta_is_mtd,
        "mom_delta_pct":     round(resource.get("cost_delta_pct", 0), 1) if delta_is_mtd else None,
        # Utilisation — null means diagnostics are NOT enabled, not that the resource is idle
        "util_pct":          resource.get("primary_utilization_pct"),
        "cpu_pct":           resource.get("avg_cpu_pct"),
        "mem_pct":           resource.get("avg_memory_pct"),
        "disk_pct":          resource.get("avg_disk_pct"),
        "net_pct":           resource.get("avg_network_pct"),
        "peak_util_pct":     resource.get("peak_utilization_pct"),  # S18: max in 30 days
        "data_confidence":   resource.get("data_confidence", "none"),  # "high"|"medium"|"low"|"none"
        "workload_pattern":  resource.get("workload_pattern"),  # S19
        "rule_score":        round(resource.get("final_score", 50), 1),
        "trend":             resource.get("trend", "stable"),
        "is_orphan":         resource.get("is_orphan", False),
        "is_protected":      resource.get("is_protected", False),
        "protection_reasons":resource.get("protection_reasons", []),
        "days_idle":         resource.get("days_idle"),
        "cumulative_waste":  resource.get("cumulative_waste_usd"),
        "advisor_recs":      advisor_recs,
        "tags":              resource.get("tags", {}),
    }
    return ctx


_SYSTEM_PROMPT = """You are an Azure cloud cost optimisation expert.
You receive a batch of Azure resources with their cost, utilisation metrics,
trend data, and Azure Advisor recommendations.

For EACH resource return a JSON object with:
  "resource_name": string (exact match from input)
  "score_adjustment": integer from -30 to +10
      -30 = certain waste / should be deleted immediately
      -20 = highly under-utilised, strong action needed
      -10 = moderately under-utilised
        0 = your analysis matches the rule-based score
       +5 = rule-based score was too harsh, resource has valid usage
      +10 = resource is well-used, penalised unfairly
  "confidence": "high" | "medium" | "low"
  "action": one of "delete" | "downsize" | "reserve" | "monitor" | "none"
  "explanation": 1-2 sentence plain-English explanation citing actual evidence
  "action_steps": array of specific steps to take for THIS resource (see rules below)

EXPLANATION RULES — this is critical:
- Your explanation MUST cite the specific evidence that drove your decision.
- If metrics ARE available (util_pct, cpu_pct, mem_pct are not null):
  · State the actual values: "CPU averaged 2.1% and memory 4.3% over the last 30 days — well below the P2v3's capacity."
  · Mention peak if it differs significantly from average: "Peak CPU was 18% on day 14, suggesting occasional bursts."
- If metrics are NOT available (util_pct is null, data_confidence is "none" or "medium/cost only"):
  · NEVER cite cost delta as proof of underutilisation. Cost change alone does not prove idle.
  · NEVER say "spend dropped X% which suggests oversized" — the drop may be a partial-month billing artefact.
  · If Advisor recs exist: "Azure Advisor flags this as underutilised (Right-size recommendation, medium impact). No CPU or memory metrics available to independently confirm — enable diagnostics before acting."
  · If no Advisor recs: use the CRITICAL RULE below.
- workload_pattern context: if "bursty", note it's an event-driven workload; if "declining", note gradual reduction.
- If is_protected=true: acknowledge the protection signals (protection_reasons) in your explanation.
- delta_is_mtd=true means the delta is month-to-date vs same period last month (fair, cite freely).
  delta_is_mtd=false means no valid prior-MTD data exists — cost_prev_full_mo and mom_delta_pct will be null.
  Do NOT mention any cost comparison figures or percentage drops in your explanation when delta_is_mtd=false.

ACTION STEPS RULES:
- Only include action_steps when action is "delete" or "downsize". For "monitor"/"reserve"/"none", return [].
- Each step: {"phase": "...", "title": "...", "detail": "...", "az_cli": "..."}
  - phase: "immediate" | "verify" | "tag" | "wait" | "delete"
  - title: 6-10 words, name the specific resource and what to do
  - detail: 1-2 sentences — mention the actual resource name, SKU, RG, cost, or idle days from the input data
  - az_cli: (optional) one CLI command with the actual resource name and RG substituted in. Include only for the 1-2 most impactful steps.
- Use 3-5 steps max. Follow the quarantine-first philosophy:
  1. (immediate) Restrict access — deny network traffic or stop the resource
  2. (immediate or verify) Main cost-saving action — deallocate/stop/scale-down
  3. (tag) Tag as pending-deletion with date
  4. (wait) Wait 2-4 weeks and monitor — shorter wait if resource is clearly idle
  5. (delete) Permanently delete — list which attached resources to include
- Exception: orphaned resources (is_orphan=true) skip the wait step — go straight to verify → delete.
- Be specific: mention actual numbers from the input (e.g. "47 days idle", "$487/mo", "D8s_v3 in prod-rg").

SCORING SIGNALS (in order of importance):
1. Azure Advisor cost recommendations — highest trust (Microsoft's own analysis)
2. Utilisation metrics: cpu_pct, mem_pct, util_pct — only use these if not null
3. Peak utilisation (peak_util_pct) — a resource that spiked to 60%+ is NOT idle even if avg is low
4. Cost trend (rising cost + falling utilisation = red flag) — only cite if delta_is_mtd=true
5. Workload pattern (bursty/declining/inactive/steady_low)
6. Days idle + cumulative waste — strong signal if days_idle > 30
7. Tags — no owner/env = untracked, higher waste risk

CRITICAL RULE — missing metrics, no Advisor:
If util_pct is null AND there are no advisor_recs:
Set score_adjustment=0, action="monitor", confidence="low", action_steps=[].
Set explanation to EXACTLY this string with NO additional sentences, NO cost commentary, and NO speculation:
"No utilisation metrics available and no Azure Advisor recommendations — enable diagnostics to assess this resource before making any changes."
Do NOT append anything about cost changes, usage patterns, or delta figures to this explanation.

Return ONLY a JSON array, no prose, no markdown fences."""


def _parse_response(raw: str, batch: list) -> list[AIVerdict]:
    """Parse JSON response from any provider and map back to resource IDs."""
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    parsed: list = json.loads(raw.strip())
    verdicts = []
    for item in parsed:
        name    = item.get("resource_name", "")
        matched = next((r for r in batch if r.get("resource_name") == name), None)
        rid     = (matched or {}).get("resource_id", name)
        # Add step numbers to action_steps (AI may omit them)
        raw_steps = item.get("action_steps", []) or []
        steps = [
            {**s, "step": i + 1}
            for i, s in enumerate(raw_steps)
            if isinstance(s, dict)
        ]
        verdicts.append(AIVerdict(
            resource_id      = rid,
            score_adjustment = int(item.get("score_adjustment", 0)),
            confidence       = item.get("confidence", "low"),
            action           = item.get("action", "monitor"),
            explanation      = item.get("explanation", ""),
            action_steps     = steps,
        ))
    return verdicts


def _call_claude(batch: list, api_key: str) -> list[AIVerdict]:
    import anthropic
    client   = anthropic.Anthropic(api_key=api_key)
    contexts = [_build_resource_context(r) for r in batch]
    response = client.messages.create(
        model      = CLAUDE_MODEL,
        max_tokens = 4096,
        system     = _SYSTEM_PROMPT,
        messages   = [{"role": "user", "content":
                        f"Analyse these {len(contexts)} Azure resources:\n\n{json.dumps(contexts, indent=2)}"}],
    )
    return _parse_response(response.content[0].text, batch)


def _normalise_aoai_endpoint(endpoint: str) -> str:
    """Strip /openai/... paths — the SDK adds them automatically."""
    import re
    return re.sub(r"/openai/.*$", "", endpoint.rstrip("/")) + "/"


def _call_azure_openai(batch: list, endpoint: str, api_key: str, deployment: str) -> list[AIVerdict]:
    from openai import AzureOpenAI
    client   = AzureOpenAI(azure_endpoint=_normalise_aoai_endpoint(endpoint), api_key=api_key, api_version="2024-12-01-preview")
    contexts = [_build_resource_context(r) for r in batch]

    # Newer models (o1, o3, o4-mini) use max_completion_tokens and don't support temperature.
    # Try the new parameter first, fall back to max_tokens for older deployments.
    kwargs = dict(
        model    = deployment,
        messages = [
            {"role": "system",  "content": _SYSTEM_PROMPT},
            {"role": "user",    "content":
                f"Analyse these {len(contexts)} Azure resources:\n\n{json.dumps(contexts, indent=2)}"},
        ],
        max_completion_tokens = 4096,
    )
    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as e:
        if "max_completion_tokens" in str(e) or "unsupported_parameter" in str(e):
            kwargs.pop("max_completion_tokens")
            kwargs["max_tokens"] = 2048
            kwargs["temperature"] = 0.1
            response = client.chat.completions.create(**kwargs)
        else:
            raise
    return _parse_response(response.choices[0].message.content, batch)


def get_active_provider() -> str:
    """Return the active AI provider name, or 'none' if not configured."""
    import services.settings_service as svc
    provider = svc.get_value("ai_provider", "none")
    if provider == "claude":
        return "claude" if svc.get_value("ANTHROPIC_API_KEY", "") else "none"
    if provider == "azure_openai":
        endpoint = svc.get_value("AZURE_OPENAI_ENDPOINT", "")
        key      = svc.get_value("AZURE_OPENAI_KEY", "")
        return "azure_openai" if (endpoint and key) else "none"
    return "none"


def get_ai_verdicts(resources: List[dict]) -> List[AIVerdict]:
    """
    Takes a list of resource dicts (already scored by rule engine),
    filters to candidates worth reviewing, batches them, calls the
    configured AI provider, and returns AIVerdict objects.
    """
    import services.settings_service as svc

    provider = svc.get_value("ai_provider", "none")
    cost_threshold = svc.get_value("ai_cost_threshold_usd", AI_COST_THRESHOLD)

    # Resolve credentials based on provider
    if provider == "claude":
        api_key = svc.get_value("ANTHROPIC_API_KEY", "")
        if not api_key:
            logger.info("Claude selected but ANTHROPIC_API_KEY not set — skipping AI scoring")
            return []
        call_fn = lambda batch: _call_claude(batch, api_key)
        log_name = "Claude"

    elif provider == "azure_openai":
        endpoint   = svc.get_value("AZURE_OPENAI_ENDPOINT",   "")
        api_key    = svc.get_value("AZURE_OPENAI_KEY",        "")
        deployment = svc.get_value("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
        if not endpoint or not api_key:
            logger.info("Azure OpenAI selected but credentials not set — skipping AI scoring")
            return []
        call_fn  = lambda batch: _call_azure_openai(batch, endpoint, api_key, deployment)
        log_name = f"Azure OpenAI ({deployment})"

    else:
        logger.info("AI provider set to 'none' — skipping AI scoring")
        return []

    # Filter candidates
    candidates = [
        r for r in resources
        if r.get("final_score", 100) < AI_SCORE_THRESHOLD
        or r.get("cost_current_month", 0) >= cost_threshold
    ]
    if not candidates:
        return []

    logger.info("Sending %d resources to %s for AI scoring", len(candidates), log_name)
    verdicts: List[AIVerdict] = []

    for i in range(0, len(candidates), AI_BATCH_SIZE):
        batch = candidates[i: i + AI_BATCH_SIZE]
        try:
            verdicts.extend(call_fn(batch))
        except json.JSONDecodeError as exc:
            logger.warning("AI response was not valid JSON (batch %d): %s", i, exc)
        except Exception as exc:
            logger.warning("AI scoring batch %d failed: %s", i, exc)
            for r in batch:
                verdicts.append(AIVerdict(resource_id=r.get("resource_id", ""), error=str(exc)))

    logger.info("AI scoring complete: %d verdicts from %s", len(verdicts), log_name)
    return verdicts


_NARRATIVE_SYSTEM = """You are an Azure FinOps expert writing an executive summary for a cloud cost dashboard.
You will receive aggregated subscription data and return a concise, plain-English paragraph (3-5 sentences max).

Your summary should:
- Start with the overall subscription health in one sentence
- Highlight the single biggest cost driver
- Name the top 1-2 actionable savings opportunities with estimated dollar amounts if available
- End with a confidence note if AI analysis was enabled
- Only mention orphaned resources as a cost concern if orphan_waste_usd > 0; if it is 0, do not imply they are wasting money.

CRITICAL — month-over-month comparisons:
- total_cost_usd is the spend so far this calendar month (MTD), NOT a full-month figure.
- current_day_of_month tells you how many days of data exist. If it is <= 20, the MoM% is
  a partial-month-vs-full-month artefact and is NOT meaningful. Do NOT cite mom_delta_pct
  as evidence of a real trend when current_day_of_month <= 20.
- If current_day_of_month <= 20, describe spend as "X so far this month" and omit any % comparison.
- Only cite mom_delta_pct as a trend signal when current_day_of_month > 20.

Use plain English — no bullet points, no headers, no markdown. Write for a business audience.
Be specific with numbers. Be direct and actionable."""


def get_ai_narrative(resources: list, kpi) -> str | None:
    """
    Generate a plain-English narrative summary of the subscription's cost health.
    Returns None if AI is not configured.
    """
    import services.settings_service as svc

    provider = svc.get_value("ai_provider", "none")

    # Build a compact summary context
    from collections import Counter
    type_costs: dict = {}
    for r in resources:
        rtype = getattr(r, "resource_type", "").split("/")[-1] or "unknown"
        type_costs[rtype] = type_costs.get(rtype, 0.0) + getattr(r, "cost_current_month", 0.0)
    top_types = sorted(type_costs.items(), key=lambda x: -x[1])[:5]

    not_used = [r for r in resources if getattr(r, "score_label", None) and r.score_label.value == "Not Used" and not r.is_infrastructure]
    top_savings = sorted(
        [r for r in resources if getattr(r, "estimated_monthly_savings", 0) > 0],
        key=lambda x: -x.estimated_monthly_savings,
    )[:3]

    from datetime import datetime
    context = {
        "total_cost_usd": round(kpi.total_cost_current_month, 2),
        "current_day_of_month": datetime.now().day,
        "mom_delta_pct":  round(kpi.mom_cost_delta_pct, 1),
        "total_resources": kpi.total_resources,
        "health_pct":     kpi.health_score_pct,
        "not_used_count": kpi.not_used_count,
        "not_used_cost":  kpi.not_used_cost,
        "orphan_count":   kpi.orphan_count,
        "orphan_waste_usd": round(kpi.orphan_cost, 2),
        "advisor_recs":   kpi.advisor_total_recs,
        "potential_savings": kpi.total_potential_savings,
        "top_resource_types": [{"type": t, "cost": round(c, 2)} for t, c in top_types],
        "top_savings_ops": [
            {
                "name": r.resource_name,
                "savings": round(r.estimated_monthly_savings, 2),
                "action": r.ai_action or "review",
                "explanation": r.ai_explanation or r.recommendation or "",
            }
            for r in top_savings
        ],
    }

    prompt = f"Subscription data:\n{json.dumps(context, indent=2)}\n\nWrite the executive summary."

    try:
        if provider == "claude":
            api_key = svc.get_value("ANTHROPIC_API_KEY", "")
            if not api_key:
                return None
            import anthropic
            client   = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model      = CLAUDE_MODEL,
                max_tokens = 300,
                system     = _NARRATIVE_SYSTEM,
                messages   = [{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()

        elif provider == "azure_openai":
            endpoint   = svc.get_value("AZURE_OPENAI_ENDPOINT", "")
            api_key    = svc.get_value("AZURE_OPENAI_KEY", "")
            deployment = svc.get_value("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
            if not endpoint or not api_key:
                return None
            from openai import AzureOpenAI
            client   = AzureOpenAI(azure_endpoint=_normalise_aoai_endpoint(endpoint), api_key=api_key, api_version="2024-12-01-preview")
            kwargs = dict(
                model    = deployment,
                messages = [
                    {"role": "system", "content": _NARRATIVE_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                max_completion_tokens = 300,
            )
            try:
                response = client.chat.completions.create(**kwargs)
            except Exception as e:
                if "max_completion_tokens" in str(e) or "unsupported_parameter" in str(e):
                    kwargs.pop("max_completion_tokens")
                    kwargs["max_tokens"] = 300
                    kwargs["temperature"] = 0.3
                    response = client.chat.completions.create(**kwargs)
                else:
                    raise
            return response.choices[0].message.content.strip()

    except Exception as exc:
        logger.warning("AI narrative generation failed: %s", exc)

    return None
