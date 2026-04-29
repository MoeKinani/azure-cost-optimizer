"""
Scores each resource 0–100.

Pipeline
────────
1. Base score   from primary utilisation (or activity signals)
2. Advisor mod  sum of Azure Advisor score impacts for this resource
3. Idle penalty if resource is old with no metrics and no activity
4. Trend mod    rising/stable/falling/idle cost trend
5. AI mod       Claude's adjustment after reviewing full context
6. Clamp        [0, 100]

Score labels
────────────
  0– 25  Not Used      → delete / strong action
  26–50  Rarely Used   → right-size / investigate
  51–75  Actively Used → minor optimisation
  76–100 Fully Used    → well utilised

Infrastructure note
───────────────────
Network, DNS, and other support resource types have no utilisation metrics
by design. They are scored as INFRASTRUCTURE (neutral 60) so they do not
appear as "Not Used" — they are serving a purpose even without traffic.
"""
from __future__ import annotations

from typing import Optional
from models.schemas import ScoreLabel, TrendDirection

# ── Infrastructure resource types ──────────────────────────────────────────────
# These have no meaningful utilisation metrics in Azure Monitor.
# Scoring them as "Not Used" would be misleading — they serve support purposes.
INFRASTRUCTURE_TYPE_PREFIXES = (
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
    # Backup vaults are passive containers — they cost money only when protecting data.
    # There is no useful utilisation metric: BackupHealthEvent=0 means healthy (good),
    # not inactive. Treat as infrastructure so they never score as "Likely Waste".
    "microsoft.recoveryservices/vaults",
    "microsoft.dataprotection/backupvaults",
)

INFRASTRUCTURE_BASE_SCORE = 60.0   # "Actively Used" tier — present and serving a purpose


def _has_protection_tag(tags: dict) -> bool:
    """Return True if the resource has a tag indicating it is production/critical."""
    if not tags:
        return False
    tags_lower = {k.lower(): str(v).lower() for k, v in tags.items()}
    for tag_key, allowed_values in _PROTECTION_TAGS.items():
        if tag_key in tags_lower:
            if allowed_values is None or tags_lower[tag_key] in allowed_values:
                return True
    return False


def is_infrastructure_resource(resource_type: str) -> bool:
    """Return True for resource types that have no utilisation metrics by design."""
    t = resource_type.lower()
    return any(t.startswith(pfx) for pfx in INFRASTRUCTURE_TYPE_PREFIXES)

# ── Constants ──────────────────────────────────────────────────────────────────

IDLE_UTIL_THRESHOLD   = 3.0    # util% below this = "idle"
STABLE_COST_BAND_PCT  = 10.0   # cost delta within ±10% = stable
NO_METRICS_OLD_PENALTY = -20   # applied when resource has no metrics + old
AGE_PENALTY_THRESHOLD_DAYS  = 90    # resources older than this with no activity get penalised
AGE_PENALTY_SEVERE_DAYS     = 180   # heavier penalty beyond this age
AGE_PENALTY_MODERATE        = -10   # 90–180 days old, no activity
AGE_PENALTY_SEVERE          = -20   # 180+ days old, no activity
ORPHAN_FIXED_SCORE    = 5.0
LOW_COST_FLOOR_USD    = 5.0    # resources below this cost get "Rarely Used" floor when data is uncertain
NOT_USED_FLOOR_SCORE  = 26.0   # minimum score to avoid "Not Used" when uncertainty is high

# Tags that indicate a resource should never be auto-labelled "Not Used"
# Key = tag name (case-insensitive), Value = set of protected values (None = any value protects)
_PROTECTION_TAGS: dict[str, Optional[set]] = {
    "environment":  {"prod", "production", "prd", "live"},
    "env":          {"prod", "production", "prd", "live"},
    "criticality":  {"high", "critical", "business-critical"},
    "critical":     {"true", "yes", "1"},
    "costcenter":   None,   # any cost centre tag = this resource is owned/tracked
    "businessunit": None,
}

TREND_MODIFIER: dict[TrendDirection, int] = {
    TrendDirection.RISING:  +10,
    TrendDirection.STABLE:    0,
    TrendDirection.FALLING: -10,
    TrendDirection.IDLE:    -20,
}

# ── Trend detection ────────────────────────────────────────────────────────────

def detect_trend(
    cost_current: float,
    cost_previous: float,
    util_current: Optional[float],
    cost_two_months_ago: Optional[float] = None,
) -> TrendDirection:
    if util_current is not None and util_current < IDLE_UTIL_THRESHOLD:
        if cost_previous > 0:
            return TrendDirection.IDLE

    if cost_previous > 0:
        delta_pct = ((cost_current - cost_previous) / cost_previous) * 100.0
    else:
        delta_pct = 0.0

    # With 3 months of data, detect a sustained trend.
    # Two consecutive periods both moving >5% in the same direction = confirmed trend,
    # even when the most-recent delta alone falls within the ±10% stable band.
    if cost_two_months_ago and cost_two_months_ago > 0 and cost_previous > 0:
        delta_prev2 = ((cost_previous - cost_two_months_ago) / cost_two_months_ago) * 100.0
        if delta_pct < -5.0 and delta_prev2 < -5.0:
            return TrendDirection.FALLING
        if delta_pct > 5.0 and delta_prev2 > 5.0:
            return TrendDirection.RISING

    if delta_pct > STABLE_COST_BAND_PCT:
        return TrendDirection.RISING
    if delta_pct < -STABLE_COST_BAND_PCT:
        return TrendDirection.FALLING
    return TrendDirection.STABLE


# ── Base score from utilisation ────────────────────────────────────────────────

def _util_to_base_score(
    util_pct: Optional[float],
    has_any_activity: bool,
    resource_age_days: int,
) -> float:
    """
    Map 0-100 utilisation % → base score.

    Key improvements:
    - Activity signals (requests, network bytes, connections, disk I/O) act as a
      floor even when util_pct is available and low — prevents false "Not Used"
      on resources like bastion hosts, VPN gateways, and low-CPU-but-active services.
    - No metrics + no activity + resource > 7 days old → penalised score (15)
    """
    if util_pct is not None:
        u = max(0.0, min(100.0, util_pct))
        # Piecewise linear calibrated to real-world usage patterns.
        # Azure Advisor flags VMs idle at < 5% CPU average — that is the true "not used" boundary.
        # A VM at 10-20% CPU is running workloads and should score in "Actively Used" range.
        #
        #  0% →  5   (genuinely idle — nothing running)
        #  5% → 40   (Azure Advisor idle boundary — borderline)
        # 20% → 60   (light workload — actively used)
        # 50% → 80   (moderate load — well utilised)
        # 100% → 95  (heavily loaded)
        if u <= 5:
            computed = 5.0 + (u / 5.0) * 35.0          # 5 → 40
        elif u <= 20:
            computed = 40.0 + ((u - 5.0) / 15.0) * 20.0   # 40 → 60
        elif u <= 50:
            computed = 60.0 + ((u - 20.0) / 30.0) * 20.0  # 60 → 80
        else:
            computed = 80.0 + ((u - 50.0) / 50.0) * 15.0  # 80 → 95
        # If there is any confirmed activity (network, disk, requests),
        # don't let a low util_pct alone push the score into "Not Used" territory.
        # Floor at 40 so the resource lands in "Rarely Used" at worst.
        if has_any_activity:
            return max(computed, 40.0)
        return computed

    # No utilisation metrics available.
    # Do NOT penalise for missing metrics — diagnostics are not enabled by default in Azure.
    # Absence of metrics ≠ absence of usage.
    # Activity logs track management operations (create/resize/delete), NOT workload traffic.
    # A VM running unchanged for months will have zero activity log events but is fully in use.
    # If we have confirmed activity signals (Transactions, Ingress, Requests, etc.),
    # score above the neutral 50 — we know something is happening even without CPU/memory.
    if has_any_activity:
        return 65.0
    return 50.0


# ── Main scoring function ──────────────────────────────────────────────────────

def score_resource(
    util_pct: Optional[float],
    cost_current: float,
    cost_previous: float,
    is_orphan: bool = False,
    advisor_score_delta: int = 0,
    ai_score_adjustment: int = 0,
    has_any_activity: bool = False,
    resource_age_days: int = 30,
    days_since_active: Optional[int] = None,
    activity_log_count: int = 0,
    idle_confirmed: bool = False,
    is_infrastructure: bool = False,
    data_confidence: str = "high",  # "high"|"medium"|"low"|"none"
    tags: dict = {},
    vm_is_deallocated: bool = False,
    has_lock: bool = False,
    has_inherited_lock: bool = False,  # RG/sub-level lock — floors at 51 (never "Likely Waste")
    is_protected: bool = False,      # S17: intent signal (RBAC, PE, RI, backup) — blocks Not Used but does NOT boost score
    peak_util_pct: Optional[float] = None,  # S18: maximum utilization in 30-day window
    cost_two_months_ago: float = 0.0,       # enables 3-month sustained-trend detection
) -> tuple[float, float, int, TrendDirection, ScoreLabel]:
    """
    Returns (base_score, final_score, trend_modifier, trend, label).
    """
    # Orphans are structurally confirmed waste regardless of any inherited locks.
    # Check orphan BEFORE lock so a resource in a locked RG is still flagged as waste.
    if is_orphan:
        trend = TrendDirection.IDLE
        modifier = TREND_MODIFIER[TrendDirection.IDLE]
        return ORPHAN_FIXED_SCORE, ORPHAN_FIXED_SCORE, modifier, trend, ScoreLabel.NOT_USED

    # Direct resource lock = intentional human protection — floor at 60 (Actively Used).
    # RG/subscription inherited locks are handled as is_protected (floor at 26 only).
    if has_lock:
        trend = detect_trend(cost_current, cost_previous, util_pct, cost_two_months_ago or None)
        trend_mod = TREND_MODIFIER.get(trend, 0) if trend not in (TrendDirection.IDLE,) else 0
        advisor_capped = max(advisor_score_delta, -20)  # softer cap for locked resources
        ai_capped = max(-10, min(10, ai_score_adjustment))
        final = max(60.0, min(100.0, 60.0 + trend_mod + advisor_capped + ai_capped))
        return 60.0, final, trend_mod, trend, _score_to_label(final)

    # Infrastructure resources (VNets, NSGs, DNS zones, etc.) have no utilisation
    # metrics by design — score them as neutral/active so they don't mislead as "Not Used".
    if is_infrastructure:
        trend = detect_trend(cost_current, cost_previous, None, cost_two_months_ago or None)
        trend_mod = TREND_MODIFIER.get(trend, 0) if trend not in (TrendDirection.IDLE,) else 0
        base = INFRASTRUCTURE_BASE_SCORE
        advisor_capped = max(advisor_score_delta, -35)
        ai_capped = max(-30, min(10, ai_score_adjustment))
        final = max(0.0, min(100.0, base + advisor_capped + ai_capped))
        return base, final, 0, trend, _score_to_label(final)

    # Deallocated (stopped) VMs have 0% CPU by design — that is the expected state.
    # Score them as "Rarely Used" floor (35) regardless of utilization metrics,
    # so they appear as a cost-awareness item ("VM is stopped, disk/IP still cost money")
    # rather than "Not Used / delete this". They are NOT waste — they are intentionally off.
    if vm_is_deallocated:
        trend = detect_trend(cost_current, cost_previous, None, cost_two_months_ago or None)
        trend_mod = 0  # don't penalize trend when intentionally stopped
        advisor_capped = max(advisor_score_delta, -35)
        ai_capped = max(-30, min(10, ai_score_adjustment))
        final = max(35.0, min(100.0, 35.0 + advisor_capped + ai_capped))
        return 35.0, final, trend_mod, trend, _score_to_label(final)

    base  = _util_to_base_score(util_pct, has_any_activity, resource_age_days)
    trend = detect_trend(cost_current, cost_previous, util_pct, cost_two_months_ago or None)
    trend_mod = TREND_MODIFIER[trend]

    # Idle penalties only apply when we have confirmed metrics data.
    # Activity log "days_since_active" tracks management operations, NOT workload traffic —
    # a VM unchanged for months scores 0 here but could be running 24/7.
    # Never penalise for idle when util_pct is None (no metrics = no evidence either way).
    idle_penalty = 0
    if util_pct is not None and data_confidence == "high":
        if idle_confirmed:
            idle_penalty = -15
        elif days_since_active is not None and days_since_active > 21 and util_pct < 20:
            idle_penalty = -10
        elif days_since_active is not None and days_since_active > 14 and util_pct < 20:
            idle_penalty = -5

    # ── S6: Resource age weighting ────────────────────────────────────────────
    # A resource that has been sitting unused for 90–180+ days is more suspicious
    # than a recently created one. Only apply when we have no positive activity
    # signals and metrics are available (to avoid piling penalties on unknown data).
    age_penalty = 0
    if (
        not has_any_activity
        and not idle_confirmed  # already penalised separately
        and util_pct is not None
        and util_pct < IDLE_UTIL_THRESHOLD
        and data_confidence == "high"
        and not has_lock
    ):
        if resource_age_days >= AGE_PENALTY_SEVERE_DAYS:
            age_penalty = AGE_PENALTY_SEVERE
        elif resource_age_days >= AGE_PENALTY_THRESHOLD_DAYS:
            age_penalty = AGE_PENALTY_MODERATE

    advisor_capped = max(advisor_score_delta, -35)
    ai_capped = max(-30, min(10, ai_score_adjustment))

    final = max(0.0, min(100.0, base + trend_mod + advisor_capped + ai_capped + idle_penalty + age_penalty))

    # ── S18: Peak burst hard blocker ──────────────────────────────────────────
    # If a resource spiked above 60% at any point in 30 days it is a scheduled job
    # or event-driven workload — never classify as "Not Used" regardless of avg util.
    if peak_util_pct is not None and peak_util_pct > 60.0 and final < 40.0:
        final = 40.0

    # ── Guard 1: tag-based protection ─────────────────────────────────────────
    # Resources tagged as production/critical/owned must not auto-label as "Not Used".
    # Floor at 40 (bottom of "Rarely Used") — still actionable but not a false alarm.
    if _has_protection_tag(tags) and final < 40.0:
        final = 40.0

    # ── Guard 2: no-metrics floor ─────────────────────────────────────────────
    # Without utilisation metrics we have no evidence of waste.
    # Floor at 35 ("Rarely Used") so the resource is flagged for attention
    # but never condemned as "Not Used" based on missing data alone.
    # Genuine orphans bypass this — they are confirmed waste by structure, not metrics.
    if util_pct is None and not is_orphan and final < 35.0:
        final = 35.0

    # ── Guard 3: low-cost uncertainty floor ───────────────────────────────────
    if (
        cost_current < LOW_COST_FLOOR_USD
        and data_confidence not in ("high",)
        and not is_orphan
        and final < NOT_USED_FLOOR_SCORE
    ):
        final = NOT_USED_FLOOR_SCORE

    # ── S17: Intent signal protection floor ───────────────────────────────────
    # Resources with intent/protection signals (RBAC, private endpoint, RI, backup)
    # should never be labeled "Not Used" — someone has made a conscious decision
    # about this resource. But we do NOT boost the utilization score artificially.
    # Floor just above "Not Used" (26) so it shows as "Rarely Used" at worst.
    if is_protected and not is_orphan and final < 26.0:
        final = 26.0

    # ── Inherited lock floor ───────────────────────────────────────────────────
    # A resource group lock means the admin has deliberately protected the entire RG.
    # Resources in that RG should never appear as "Likely Waste" (Rarely Used).
    # Floor at 51 (bottom of "Likely Used") — still shows cost optimisation context
    # but not alarming as waste. Direct resource locks use the has_lock fast-return (60).
    if has_inherited_lock and not is_orphan and final < 51.0:
        final = 51.0

    # ── S21: Dual inactivity signal requirement ───────────────────────────────
    # Before labeling "Not Used" (score ≤ 25), require at least 2 independent
    # inactivity signals. Orphans bypass — they are structurally confirmed waste.
    if not is_orphan and final <= 25.0:
        inactivity_count = 0
        if util_pct is None or util_pct < 3.0:
            inactivity_count += 1
        if days_since_active is None or days_since_active > 30:
            inactivity_count += 1
        if cost_current < 2.0:
            inactivity_count += 1
        if inactivity_count < 2:
            final = 26.0  # floor at just above "Not Used"

    label = _score_to_label(final)
    # When there are no utilisation metrics AND no confirmed activity, a RARELY_USED
    # label is unreliable — it was produced by the neutral 50-point default, not real data.
    # Override to UNKNOWN so users aren't misled into thinking we detected low usage.
    # Exception: if has_any_activity is True (e.g. Transactions, Ingress, Egress > 0),
    # the resource IS confirmed active — keep the score-based label, don't show Unknown.
    if (util_pct is None
            and not has_any_activity
            and label == ScoreLabel.RARELY_USED
            and not is_orphan
            and not is_infrastructure
            and not vm_is_deallocated
            and not has_lock):
        label = ScoreLabel.UNKNOWN
    return base, final, trend_mod, trend, label


def _score_to_label(score: float) -> ScoreLabel:
    if score <= 25:  return ScoreLabel.NOT_USED
    if score <= 50:  return ScoreLabel.RARELY_USED
    if score <= 75:  return ScoreLabel.ACTIVELY_USED
    return ScoreLabel.FULLY_USED


# ── Savings estimation ─────────────────────────────────────────────────────────

def estimate_savings(
    cost_current: float,
    score: float,
    is_orphan: bool,
    advisor_savings: float = 0.0,
    has_metrics: bool = True,
) -> tuple[float, str]:
    """
    Returns (estimated_monthly_savings_usd, recommendation_text).
    Uses the higher of rule-based estimate vs Advisor-provided savings.
    When has_metrics=False, only surfaces Advisor savings — no invented estimates.
    """
    if is_orphan:
        return cost_current, "Delete orphaned resource to eliminate all costs."

    # Without metrics we have no evidence of under-utilisation.
    # Only surface what Azure Advisor has confirmed — never invent a savings figure.
    if not has_metrics:
        if advisor_savings > 0:
            return min(advisor_savings, cost_current), "Azure Advisor has identified a saving opportunity for this resource."
        return 0.0, "No utilisation metrics available. Enable Azure Monitor diagnostics to assess this resource."

    if score <= 25:
        rule_pct, rec = 0.80, "Resource appears severely under-utilised. Consider deletion or downsizing to the smallest available SKU."
    elif score <= 50:
        rule_pct, rec = 0.50, "Resource is under-utilised. Right-size to a smaller tier, enable auto-scaling, or consolidate workloads."
    elif score <= 75:
        rule_pct, rec = 0.20, "Minor optimisation opportunity. Evaluate reserved pricing, auto-shutdown schedules, or consolidation."
    else:
        rule_pct, rec = 0.0, "Resource appears well-utilised. No immediate action required."

    rule_savings = round(cost_current * rule_pct, 2)
    final_savings = min(max(rule_savings, advisor_savings), cost_current)
    return final_savings, rec


# ── Safe action steps ──────────────────────────────────────────────────────────

def get_safe_action_steps(
    resource_type: str,
    score_label,          # ScoreLabel enum or string
    is_orphan: bool = False,
    orphan_reason: str = "",
    ai_action: str = "",
) -> list:
    """
    Returns a list of step-by-step action dicts for safely decommissioning
    or right-sizing a resource.

    Philosophy: quarantine before delete.
    1. Restrict access so the resource can't be used
    2. Tag it so the team knows it's pending removal
    3. Wait 2–4 weeks — silence confirms it's safe
    4. Delete once no objections

    Each step: {step, phase, title, detail, portal_path, az_cli (optional)}
    phase: "immediate" | "verify" | "tag" | "wait" | "delete"
    """
    rtype  = resource_type.lower()
    label  = score_label.value if hasattr(score_label, "value") else str(score_label)
    action = (ai_action or "").lower()

    # ── U6: No-data resources get a diagnostics plan, not a delete/downsize plan ─
    # Scoring is unreliable without utilisation metrics — never recommend deletion
    # based on guesswork. Step 1 must always be "enable diagnostics first".
    if label == "Unknown":
        return [
            {
                "step": 1, "phase": "verify",
                "title": "Enable Azure Monitor diagnostic settings",
                "detail": (
                    "This resource has no utilisation metrics. Any delete or right-size "
                    "recommendation would be a guess without real data. Enable diagnostic "
                    "settings to start collecting CPU, memory, network, and request metrics."
                ),
                "portal_path": "Azure Portal → Resource → Diagnostic settings → + Add diagnostic setting",
                "az_cli": 'az monitor diagnostic-settings list --resource "{id}"',
            },
            {
                "step": 2, "phase": "wait",
                "title": "Wait 24–48 hours for metrics to populate",
                "detail": (
                    "Azure Monitor needs time to collect and process initial metrics. "
                    "Return after 24 hours — the resource will show real utilisation data."
                ),
                "portal_path": "Azure Portal → Resource → Metrics → select a metric to confirm data is flowing",
            },
            {
                "step": 3, "phase": "verify",
                "title": "Refresh the scan and review the updated score",
                "detail": (
                    "Once metrics are flowing, this resource will receive an accurate utilisation score "
                    "and a data-backed action plan will replace these steps."
                ),
                "portal_path": "Azure Cost Optimizer → Refresh dashboard",
            },
        ]

    # Determine effective action
    if is_orphan:
        action = "delete"
    elif not action or action in ("monitor", "none"):
        if label == "Not Used":
            action = "delete"
        elif label in ("Fully Used", "Actively Used"):
            action = "none"
        else:
            action = "downsize"

    # No steps needed for well-utilised resources unless AI explicitly flagged them
    if label in ("Fully Used", "Actively Used") and action not in ("delete",) and not is_orphan:
        return []

    # ── Orphaned resources ────────────────────────────────────────────────────
    if is_orphan:
        if "disks" in rtype:
            return [
                {"step": 1, "phase": "verify",
                 "title": "Take a snapshot (optional safety net)",
                 "detail": "Create a snapshot before deleting in case the data needs to be recovered later.",
                 "portal_path": "Azure Portal → Disk → + Create snapshot",
                 "az_cli": 'az snapshot create --name "{name}-backup" --source "{name}" --resource-group "{rg}"'},
                {"step": 2, "phase": "delete",
                 "title": "Delete the unattached disk",
                 "detail": "This disk is not attached to any VM. Deleting it stops billing immediately.",
                 "portal_path": "Azure Portal → Disk → Delete",
                 "az_cli": 'az disk delete --name "{name}" --resource-group "{rg}" --yes'},
            ]
        if "publicipaddresses" in rtype:
            return [
                {"step": 1, "phase": "verify",
                 "title": "Check for DNS records pointing here",
                 "detail": "If any DNS name label is set on this IP, update or remove it before deleting to avoid broken name resolution.",
                 "portal_path": "Azure Portal → Public IP → Configuration → DNS name label"},
                {"step": 2, "phase": "delete",
                 "title": "Delete the public IP",
                 "detail": "This IP is not assigned to any resource. Deleting it stops all billing.",
                 "portal_path": "Azure Portal → Public IP → Delete",
                 "az_cli": 'az network public-ip delete --name "{name}" --resource-group "{rg}"'},
            ]
        if "networkinterfaces" in rtype:
            return [
                {"step": 1, "phase": "delete",
                 "title": "Delete the orphaned NIC",
                 "detail": "This network interface is not attached to any VM or private endpoint. Safe to delete.",
                 "portal_path": "Azure Portal → Network interface → Delete",
                 "az_cli": 'az network nic delete --name "{name}" --resource-group "{rg}"'},
            ]
        if "networksecuritygroups" in rtype:
            return [
                {"step": 1, "phase": "verify",
                 "title": "Note any custom security rules",
                 "detail": "Review and document any custom inbound or outbound rules before deleting, in case they need to be reused elsewhere.",
                 "portal_path": "Azure Portal → NSG → Inbound security rules / Outbound security rules"},
                {"step": 2, "phase": "delete",
                 "title": "Delete the NSG",
                 "detail": "This NSG has no subnet or NIC associations — deleting it has no live network impact.",
                 "portal_path": "Azure Portal → NSG → Delete",
                 "az_cli": 'az network nsg delete --name "{name}" --resource-group "{rg}"'},
            ]
        # Generic orphan
        return [
            {"step": 1, "phase": "verify",
             "title": "Confirm no hidden dependencies",
             "detail": "Search for any references to this resource ID in other resources before deleting.",
             "portal_path": "Azure Portal → Resource → Properties → copy Resource ID → search in subscriptions"},
            {"step": 2, "phase": "delete",
             "title": "Delete the resource",
             "detail": "No active associations detected. Deleting will stop all billing for this resource.",
             "portal_path": "Azure Portal → Resource → Delete"},
        ]

    # ── Virtual Machines ──────────────────────────────────────────────────────
    if "virtualmachines" in rtype:
        if action == "delete" or label == "Not Used":
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Block all inbound network traffic",
                 "detail": "Add a Deny-All rule to the VM's NSG to cut off internet access without deleting anything. This is the safe first move — you can undo it instantly if needed.",
                 "portal_path": "Azure Portal → VM → Networking → Inbound port rules → Add rule: Priority 100 | Protocol: Any | Action: Deny | Source/Dest: Any",
                 "az_cli": 'az network nsg rule create --nsg-name "{nsg}" --resource-group "{rg}" --name DenyAllInbound --priority 100 --access Deny --direction Inbound --protocol "*"'},
                {"step": 2, "phase": "immediate",
                 "title": "Stop and deallocate the VM",
                 "detail": "Deallocating stops compute billing while keeping the OS disk and configuration intact. No need to delete yet.",
                 "portal_path": "Azure Portal → VM → Overview → Stop  (this deallocates — click OK on the prompt)",
                 "az_cli": 'az vm deallocate --name "{name}" --resource-group "{rg}"'},
                {"step": 3, "phase": "tag",
                 "title": "Tag as pending deletion",
                 "detail": "Add tags so the team knows this VM is scheduled for removal and who made the decision.",
                 "portal_path": "Azure Portal → VM → Tags → Add two tags:  status = pending-deletion  |  deletion-date = (today + 30 days)",
                 "az_cli": 'az tag update --resource-id "{id}" --operation Merge --tags status=pending-deletion'},
                {"step": 4, "phase": "wait",
                 "title": "Wait 2–4 weeks and watch for traffic",
                 "detail": "Monitor Network In/Out for any activity. If the VM is truly unused, the graphs will stay flat. No complaints = safe to delete.",
                 "portal_path": "Azure Portal → VM → Metrics → Network In Total / Network Out Total → Last 30 days"},
                {"step": 5, "phase": "delete",
                 "title": "Permanently delete the VM and its resources",
                 "detail": "After the waiting period with no activity or objections, delete the VM along with its OS disk, NIC, and public IP.",
                 "portal_path": "Azure Portal → VM → Overview → Delete → check Delete OS disk, Delete NIC, Delete public IP → Delete",
                 "az_cli": 'az vm delete --name "{name}" --resource-group "{rg}" --yes'},
            ]
        else:  # Rarely Used — right-size
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Right-size to the next smaller VM SKU",
                 "detail": "CPU is consistently low. Dropping one size tier (e.g. D4s_v3 → D2s_v3) saves ~50% compute cost with no performance impact for light workloads.",
                 "portal_path": "Azure Portal → VM → Size → select a smaller SKU → Resize  (VM will restart)",
                 "az_cli": 'az vm resize --name "{name}" --resource-group "{rg}" --size Standard_D2s_v3'},
                {"step": 2, "phase": "immediate",
                 "title": "Enable auto-shutdown for dev/test VMs",
                 "detail": "If this VM is not production, scheduling it to stop outside business hours can save 60–70% of compute cost.",
                 "portal_path": "Azure Portal → VM → Auto-shutdown → Enabled: On → set time (e.g. 7:00 PM) → Save",
                 "az_cli": 'az vm auto-shutdown --name "{name}" --resource-group "{rg}" --time 1900'},
                {"step": 3, "phase": "verify",
                 "title": "Set a CPU alert after resizing",
                 "detail": "Create an alert so you are notified if load spikes above 80% after the resize — your safety net.",
                 "portal_path": "Azure Portal → VM → Monitoring → Alerts → + Create alert rule → Signal: Percentage CPU → Threshold: 80%"},
            ]

    # ── App Services / Function Apps ──────────────────────────────────────────
    if "sites" in rtype:
        if action == "delete" or label == "Not Used":
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Stop the app",
                 "detail": "Stopping halts execution and starts saving compute cost. The app code, config, and deployment slots are preserved — it can be restarted instantly.",
                 "portal_path": "Azure Portal → App Service → Overview → Stop"},
                {"step": 2, "phase": "tag",
                 "title": "Tag as pending deletion",
                 "detail": "Record that this app is scheduled for removal and who approved it.",
                 "portal_path": "Azure Portal → App Service → Tags → Add:  status = pending-deletion"},
                {"step": 3, "phase": "wait",
                 "title": "Wait 2 weeks — watch for error alerts or user reports",
                 "detail": "Monitor support channels for complaints about this app URL being down. Silence after 2 weeks confirms it is safe to delete.",
                 "portal_path": "Azure Portal → App Service → Monitoring → Log stream  (verify no access attempts)"},
                {"step": 4, "phase": "delete",
                 "title": "Delete the App Service",
                 "detail": "After the quiet period with no objections, permanently delete the app and its associated resources.",
                 "portal_path": "Azure Portal → App Service → Overview → Delete",
                 "az_cli": 'az webapp delete --name "{name}" --resource-group "{rg}"'},
            ]
        else:
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Scale down the App Service Plan tier",
                 "detail": "Request volume is low. Move to a smaller compute tier (e.g. P2v3 → P1v3 or B2 → B1) — typically saves 40–50% immediately.",
                 "portal_path": "Azure Portal → App Service → Scale up (App Service plan) → choose a lower tier → Apply"},
                {"step": 2, "phase": "immediate",
                 "title": "Set autoscale rules instead of running oversized",
                 "detail": "Configure scale-out rules so a minimum of 1 instance handles normal load and the plan only scales when traffic demands it.",
                 "portal_path": "Azure Portal → App Service Plan → Scale out (App Service plan) → Custom autoscale → Add a rule"},
            ]

    # ── App Service Plans (Server Farms) ──────────────────────────────────────
    if "serverfarms" in rtype:
        return [
            {"step": 1, "phase": "verify",
             "title": "Check how many apps are running on this plan",
             "detail": "If the plan has no apps, it can be deleted. If it has apps, evaluate whether they could share a cheaper plan.",
             "portal_path": "Azure Portal → App Service Plan → Apps → view the list of hosted apps"},
            {"step": 2, "phase": "immediate",
             "title": "Scale down to a lower pricing tier",
             "detail": "If apps are lightly used, drop to a smaller tier. The B-series is appropriate for dev/test; P-series for production.",
             "portal_path": "Azure Portal → App Service Plan → Scale up → choose a lower tier → Apply"},
        ]

    # ── Storage Accounts ──────────────────────────────────────────────────────
    if "storageaccounts" in rtype:
        if action == "delete" or label == "Not Used":
            return [
                {"step": 1, "phase": "verify",
                 "title": "Enable last access time tracking",
                 "detail": "Turn on blob access tracking so you can confirm whether any data has been read or written recently.",
                 "portal_path": "Azure Portal → Storage → Data management → Lifecycle management → Enable blob last access time tracking"},
                {"step": 2, "phase": "wait",
                 "title": "Wait 30 days and review access metrics",
                 "detail": "If transaction count stays at zero after 30 days, this storage account is confirmed unused.",
                 "portal_path": "Azure Portal → Storage → Monitoring → Insights → Transactions → verify zero read/write activity"},
                {"step": 3, "phase": "delete",
                 "title": "Delete the storage account",
                 "detail": "Once no transactions are confirmed, export any important data and delete the account.",
                 "portal_path": "Azure Portal → Storage → Delete storage account",
                 "az_cli": 'az storage account delete --name "{name}" --resource-group "{rg}" --yes'},
            ]
        else:
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Add a lifecycle management policy",
                 "detail": "Automatically tier cold data to Cool (after 30 days idle) and Archive (after 90 days) — cuts storage cost by up to 80% for rarely accessed data.",
                 "portal_path": "Azure Portal → Storage → Data management → Lifecycle management → + Add a rule → configure tiering"},
                {"step": 2, "phase": "immediate",
                 "title": "Reduce replication tier if this is non-critical data",
                 "detail": "Switching from GRS (geo-redundant) to LRS (local) cuts the storage bill by ~50% for data that doesn't require cross-region redundancy.",
                 "portal_path": "Azure Portal → Storage → Configuration → Replication → change to LRS → Save"},
            ]

    # ── SQL Databases ─────────────────────────────────────────────────────────
    if ("sql" in rtype and "databases" in rtype) or "sqlservers" in rtype:
        if action == "delete" or label == "Not Used":
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Pause the database if serverless (free while paused)",
                 "detail": "Serverless and Hyperscale databases can be paused — billing stops for compute while data is preserved.",
                 "portal_path": "Azure Portal → SQL Database → Overview → Pause  (only visible if serverless tier)"},
                {"step": 2, "phase": "immediate",
                 "title": "Scale down to the minimum tier",
                 "detail": "Drop to Basic or S0 to reduce cost to a few dollars/month while the deletion is being confirmed.",
                 "portal_path": "Azure Portal → SQL Database → Configure → Service tier: Basic → Apply"},
                {"step": 3, "phase": "verify",
                 "title": "Export a BACPAC backup before deleting",
                 "detail": "Export the database to Azure Blob Storage as a safety net. Once deleted, recovery requires the backup.",
                 "portal_path": "Azure Portal → SQL Database → Export → select storage account → OK"},
                {"step": 4, "phase": "delete",
                 "title": "Delete the database",
                 "detail": "After the backup is confirmed and no objections are raised, delete the database.",
                 "portal_path": "Azure Portal → SQL Database → Delete",
                 "az_cli": 'az sql db delete --name "{name}" --server "{server}" --resource-group "{rg}" --yes'},
            ]
        else:
            return [
                {"step": 1, "phase": "immediate",
                 "title": "Scale down the service tier",
                 "detail": "Reduce DTUs or vCores to match actual query load. Most under-used databases can drop 1–2 tiers without any noticeable impact.",
                 "portal_path": "Azure Portal → SQL Database → Configure → Service tier → reduce → Apply"},
                {"step": 2, "phase": "immediate",
                 "title": "Switch to serverless compute tier",
                 "detail": "Serverless SQL pauses automatically when idle, billing only for seconds of actual query execution — ideal for infrequent workloads.",
                 "portal_path": "Azure Portal → SQL Database → Configure → Compute tier: Serverless → set auto-pause delay → Apply"},
            ]

    # ── Redis Cache ───────────────────────────────────────────────────────────
    if "redis" in rtype:
        return [
            {"step": 1, "phase": "verify",
             "title": "Check connected client count over the last 30 days",
             "detail": "If no application is connecting to this cache, the connected client metric will be zero.",
             "portal_path": "Azure Portal → Redis Cache → Monitoring → Metrics → Connected Clients → Last 30 days"},
            {"step": 2, "phase": "immediate",
             "title": "Scale down to the smallest tier (Basic C0)",
             "detail": "Drop to Basic C0 to minimise cost while investigating. You can scale back up instantly if a workload needs it.",
             "portal_path": "Azure Portal → Redis Cache → Scale → Basic C0 → Save"},
            {"step": 3, "phase": "delete",
             "title": "Delete if zero connections for 30 days",
             "detail": "After 30 days of zero connected clients, no application is using this cache. Safe to delete.",
             "portal_path": "Azure Portal → Redis Cache → Delete",
             "az_cli": 'az redis delete --name "{name}" --resource-group "{rg}" --yes'},
        ]

    # ── Managed Disks (attached, rarely used) ────────────────────────────────
    if "disks" in rtype:
        return [
            {"step": 1, "phase": "immediate",
             "title": "Change to a lower storage performance tier",
             "detail": "If the VM this disk is attached to does not need Premium SSD IOPS, switching to Standard SSD or HDD can cut the disk cost by 50–80%.",
             "portal_path": "Azure Portal → Disk → Configuration → Performance tier → Standard SSD or Standard HDD → Save"},
        ]

    # ── Default: generic Not Used ─────────────────────────────────────────────
    if action == "delete" or label == "Not Used":
        return [
            {"step": 1, "phase": "immediate",
             "title": "Restrict or disable public access",
             "detail": "Disable public network access or remove routing so the resource is effectively offline without permanently deleting it.",
             "portal_path": "Azure Portal → Resource → Networking (or Overview) → Disable public network access / Stop"},
            {"step": 2, "phase": "tag",
             "title": "Tag as pending deletion",
             "detail": "Add a tag so the team can see this resource is scheduled for removal and track who approved it.",
             "portal_path": "Azure Portal → Resource → Tags → Add:  status = pending-deletion  |  deletion-date = (today + 30 days)"},
            {"step": 3, "phase": "wait",
             "title": "Wait 2–4 weeks",
             "detail": "Allow time for any stakeholders to raise objections. If no one notices, the resource was truly unused."},
            {"step": 4, "phase": "delete",
             "title": "Delete the resource",
             "detail": "After the waiting period with no objections, permanently delete the resource.",
             "portal_path": "Azure Portal → Resource → Delete"},
        ]

    # Default: Rarely Used — investigate and right-size
    return [
        {"step": 1, "phase": "verify",
         "title": "Review usage patterns in Azure Monitor",
         "detail": "Open the resource's Metrics blade to see actual usage over the past 30 days before making any changes.",
         "portal_path": "Azure Portal → Resource → Monitoring → Metrics → select the primary metric → Last 30 days"},
        {"step": 2, "phase": "immediate",
         "title": "Right-size or reduce the service tier",
         "detail": "Reduce the SKU or pricing tier to one that matches the observed usage level.",
         "portal_path": "Azure Portal → Resource → Configuration or Size → select a lower tier → Save"},
    ]
