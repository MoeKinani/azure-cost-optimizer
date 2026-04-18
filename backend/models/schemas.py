from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class ScoreLabel(str, Enum):
    NOT_USED      = "Not Used"
    RARELY_USED   = "Rarely Used"
    ACTIVELY_USED = "Actively Used"
    FULLY_USED    = "Fully Used"
    UNKNOWN       = "Unknown"       # no utilisation metrics — cannot assess


class TrendDirection(str, Enum):
    RISING  = "rising"
    STABLE  = "stable"
    FALLING = "falling"
    IDLE    = "idle"


class AdvisorRecommendation(BaseModel):
    category:          str
    impact:            str
    short_description: str
    score_impact:      int
    potential_savings: float = 0.0


class ResourceMetrics(BaseModel):
    resource_id:    str
    resource_name:  str
    resource_type:  str
    resource_group: str
    location:       str
    sku:            Optional[str] = None

    # Cost
    cost_current_month:      float = 0.0
    cost_previous_month:     float = 0.0
    cost_previous_month_mtd: float = 0.0   # last month spend for same elapsed days (MTD-to-MTD delta)
    cost_delta_is_mtd:       bool  = False  # True = delta is MTD-to-MTD, False = full month fallback
    cost_delta_pct:          float = 0.0

    # Utilisation
    avg_cpu_pct:               Optional[float] = None
    avg_memory_pct:            Optional[float] = None
    avg_disk_pct:              Optional[float] = None
    avg_network_pct:           Optional[float] = None
    primary_utilization_pct:   Optional[float] = None
    has_any_activity:          bool = False

    # Scoring breakdown
    base_score:              float = 0.0
    advisor_score_delta:     int   = 0
    trend_modifier:          int   = 0
    ai_score_adjustment:     int   = 0
    final_score:             float = 0.0
    score_label:             ScoreLabel     = ScoreLabel.NOT_USED
    trend:                   TrendDirection = TrendDirection.STABLE

    # Azure Advisor
    advisor_recommendations: List[AdvisorRecommendation] = Field(default_factory=list)

    # AI
    ai_confidence:  Optional[str] = None
    ai_action:      Optional[str] = None
    ai_explanation: Optional[str] = None

    # Activity log
    last_active_date:  Optional[str] = None
    days_since_active: Optional[int] = None
    activity_log_count: int = 0
    idle_confirmed:    bool = False

    # Right-sizing
    rightsize_sku:          Optional[str] = None
    rightsize_savings_pct:  float = 0.0

    # Reserved instance opportunity
    ri_1yr_monthly_savings: float = 0.0
    ri_3yr_monthly_savings: float = 0.0
    ri_eligible:            bool  = False

    # Safe decommission steps — staged action plan for this resource
    safe_action_steps: List[Dict] = Field(default_factory=list)
    steps_source: str = "rules"   # "ai" | "rules" — drives the action plan header label

    # Tag compliance
    missing_tags: List[str] = Field(default_factory=list)

    # Carbon
    carbon_kg_per_month: float = 0.0

    # Links & commands
    portal_url:      str = ""
    cli_delete_cmd:  str = ""
    cli_resize_cmd:  str = ""

    # Cost anomaly
    is_anomaly:          bool = False
    daily_costs:         List[float] = Field(default_factory=list)
    cost_7d_trend_pct:   Optional[float] = None

    # Month-over-month daily spend (for trend chart)
    # daily_costs_cm: day 1 → today of current calendar month
    # daily_costs_pm: day 1 → last day of previous calendar month (full)
    daily_costs_cm:      List[float] = Field(default_factory=list)
    daily_costs_pm:      List[float] = Field(default_factory=list)

    # Savings
    estimated_monthly_savings: float = 0.0
    recommendation:            Optional[str] = None

    # Orphan
    is_orphan:     bool          = False
    orphan_reason: Optional[str] = None

    # Subscription
    subscription_id: str = ""

    # Resource category — drives smarter scoring display
    resource_category: str  = "other"   # "infrastructure" | "compute" | "storage" | "data" | "ai" | "other"
    is_infrastructure: bool = False

    # Observability — how much monitoring data backs this score
    data_confidence:  str = "none"    # "high" | "medium" | "low" | "none"
    telemetry_source: str = "none"    # "monitor" | "activity_only" | "cost_only" | "none"

    # AI / Cognitive Services token metrics (AI1–AI7)
    prompt_tokens:     Optional[float] = None   # AI1: ProcessedPromptTokens (30-day total)
    completion_tokens: Optional[float] = None   # AI1: ProcessedCompletionTokens (30-day total)
    total_tokens:      Optional[float] = None   # AI1: prompt + completion
    total_calls:       Optional[float] = None   # AI3: TotalCalls (for cost-per-request)
    blocked_calls:     Optional[float] = None   # AI4: BlockedCalls (throttle indicator)
    billing_type:      Optional[str]   = None   # AI7: "ptu" | "consumption"

    # Storage-specific signals (storage accounts only)
    storage_last_access_tracking: bool = False   # blob last-access time tracking enabled
    storage_has_lifecycle_policy:  bool = False   # lifecycle tiering/expiry rules configured

    # Resource protection & state
    has_backup:      bool          = False   # resource is protected by an Azure Backup policy
    has_lock:        bool          = False   # resource/RG/sub has a delete or read-only lock
    power_state:     Optional[str] = None    # VMs only: running/deallocated/stopped/unknown
    auto_shutdown:         bool = False   # VM has a DevTest Labs auto-shutdown schedule
    rbac_assignment_count: int  = 0       # direct role assignments scoped to this resource
    ri_covered:            bool = False   # active reservation exists for this resource type + location
    has_private_endpoint:  bool = False   # resource is targeted by a private endpoint
    is_sql_replica:        bool = False   # SQL database is a geo/named replica of a primary
    # A1–A8: App Service detail fields (web/function/logic apps only)
    app_kind:             Optional[str] = None   # "web" | "function" | "logic"
    runtime_stack:        Optional[str] = None   # e.g. "Python 3.11", "Node 20"
    last_modified:        Optional[str] = None   # ISO datetime of last config change
    custom_domain_count:  int  = 0
    health_check_enabled: bool = False
    health_check_path:    Optional[str] = None
    ssl_expiry_date:      Optional[str] = None   # earliest SSL cert expiry (ISO)
    slot_count:           int  = 0               # deployment slots excluding production
    has_linked_storage:   bool = False

    app_state:        Optional[str] = None   # "running" | "stopped"

    # App Service grouping helpers
    instance_count:  Optional[int] = None   # VMSS/App Service Plan instance count
    server_farm_id:  Optional[str] = None   # web apps: parent App Service Plan resource ID

    # 6-month cost history (oldest → newest), populated by get_monthly_cost_history()
    monthly_cost_history: List[float] = Field(default_factory=list)

    tags: Dict[str, str] = Field(default_factory=dict)

    # S17: Intent vs Usage separation
    # Intent/protection signals (locks, RBAC, backup, RI, PE) block deletion but do NOT boost score
    is_protected:       bool      = False
    protection_reasons: List[str] = Field(default_factory=list)

    # S18: Peak and burst detection
    peak_utilization_pct: Optional[float] = None   # maximum utilization seen in 30-day window

    # D2: Waste Age — how long a resource has been idle and how much it has cost
    idle_since_date:      Optional[str]   = None   # ISO date when resource last had meaningful activity
    days_idle:            Optional[int]   = None   # days since idle_since_date
    cumulative_waste_usd: Optional[float] = None   # days_idle × daily_cost_rate

    # S19: Workload pattern classification
    workload_pattern: Optional[str] = None  # "steady_low" | "bursty" | "declining" | "inactive" | "normal"

    # S22: "Why NOT waste" explanation — highest-confidence reason the resource was kept
    protection_reason: Optional[str] = None


class OrphanResource(BaseModel):
    resource_id:    str
    resource_name:  str
    resource_type:  str
    resource_group: str
    orphan_reason:  str
    monthly_cost:   float = 0.0
    estimated_savings: float = 0.0


class SavingsRecommendation(BaseModel):
    resource_id:    str
    resource_name:  str
    resource_type:  str
    resource_group: str
    current_monthly_cost:      float
    estimated_monthly_savings: float
    savings_pct:               float
    recommendation:            str
    ai_explanation:            Optional[str] = None
    ai_action:                 Optional[str] = None
    priority:                  str
    score:                     float
    advisor_count:             int = 0


class KPIData(BaseModel):
    total_cost_current_month:  float
    total_cost_previous_month: float
    mom_cost_delta:            float
    mom_cost_delta_pct:        float
    total_resources:           int
    avg_optimization_score:    float
    total_potential_savings:   float
    orphan_count:              int
    orphan_cost:               float
    advisor_total_recs:        int = 0
    ai_reviewed_count:         int = 0
    # Actionable health metrics
    not_used_count:            int   = 0   # resources scoring <= 25 (excluding infrastructure)
    not_used_cost:             float = 0.0 # monthly cost of "Not Used" resources
    infrastructure_count:      int   = 0   # infrastructure resources (no util metrics by design)
    health_score_pct:          float = 0.0 # % of scorable resources that are Actively/Fully Used
    subscription_count:        int   = 1   # number of subscriptions scanned
    # Billing context — set when the current month has fewer than 7 days of data
    billing_basis:             str   = "current_month"  # "current_month" | "previous_month"
    billing_days_current:      int   = 0   # how many days of the current month have billing data
    # Composite Cost Score — 0–100 across 5 weighted dimensions
    cost_score:            float           = 0.0
    cost_grade:            str             = "—"
    cost_score_label:      str             = ""
    cost_score_components: Dict[str,float] = Field(default_factory=dict)


class ScoreDistribution(BaseModel):
    label:      str
    count:      int
    total_cost: float
    color:      str


class ResourceTypeSummary(BaseModel):
    resource_type:        str
    display_name:         str
    count:                int
    cost_current_month:   float
    cost_previous_month:  float
    avg_score:            float
    advisor_rec_count:    int = 0


class CostAnomaly(BaseModel):
    resource_id:          str
    resource_name:        str
    resource_type:        str
    resource_group:       str
    avg_daily_cost_30d:   float
    latest_daily_cost:    float
    anomaly_factor:       float


class RightSizeOpportunity(BaseModel):
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
    cpu_pct:           Optional[float] = None


class AppSettings(BaseModel):
    azure_client_id:        str = ""
    azure_client_secret:    str = ""   # masked
    azure_tenant_id:        str = ""
    azure_subscription_id:  str = ""
    azure_subscription_ids: str = ""   # comma-separated list of additional subscription IDs
    has_azure_secret:       bool = False
    # AI provider
    ai_provider:           str = "claude"   # "claude" | "azure_openai" | "none"
    # Claude
    has_anthropic_key:     bool = False
    anthropic_api_key:     str = ""   # masked
    # Azure OpenAI
    azure_openai_endpoint:   str = ""
    azure_openai_key:        str = ""  # masked
    azure_openai_deployment: str = "gpt-4o-mini"
    has_azure_openai_key:    bool = False
    # Scoring
    idle_threshold_pct:    float = 3.0
    no_metrics_age_days:   int   = 7
    cost_floor_usd:        float = 1.0
    ai_cost_threshold_usd: float = 20.0
    cache_ttl_seconds:     int   = 1800
    demo_mode:             bool  = False
    # Scan scope — limits what gets scanned (for testing/validation)
    scan_scope_subscription_id: str = ""
    scan_scope_resource_group:  str = ""


class SubscriptionSummary(BaseModel):
    subscription_id:   str
    subscription_name: str   = ""
    resource_count:    int   = 0
    cost_current:      float = 0.0
    cost_previous:     float = 0.0
    orphan_count:      int   = 0
    advisor_rec_count: int   = 0


class DashboardData(BaseModel):
    kpi:                    KPIData
    score_distribution:     List[ScoreDistribution]
    resource_type_summary:  List[ResourceTypeSummary]
    resources:              List[ResourceMetrics]
    orphans:                List[OrphanResource]
    savings_recommendations: List[SavingsRecommendation]
    last_refreshed:         str
    ai_enabled:             bool = False
    ai_provider:            str  = "none"
    ai_narrative:           Optional[str] = None   # AI-generated plain-English summary
    demo_mode:              bool = False
    total_carbon_kg:        float = 0.0
    tag_compliance_pct:     float = 100.0
    total_untagged:         int   = 0
    cost_anomalies:         List[CostAnomaly] = Field(default_factory=list)
    rightsize_opportunities: List[RightSizeOpportunity] = Field(default_factory=list)
    subscriptions:          List[SubscriptionSummary] = Field(default_factory=list)
    resource_groups:        List[str] = Field(default_factory=list)  # distinct RG names for filter
    # Active scan scope (echoes back what was actually applied)
    active_resource_group:    str = ""
    active_subscription_id:   str = ""
    scan_scope_active:        bool = False  # true when a default scope is limiting the scan
    active_reservations:            List[Dict[str, Any]] = Field(default_factory=list)
    reservation_over_commitment_usd: float             = 0.0   # estimated monthly waste from underutilized RIs
    reservation_recommendations:    List[Dict[str, Any]] = Field(default_factory=list)
    cost_data_warning:              Optional[str]      = None   # set when Cost Management API returns no data
    # Aggregated daily totals for the spend-trend chart (not per-resource, no pagination risk)
    total_daily_cm:           List[float] = Field(default_factory=list)  # current month day 1→today
    total_daily_pm:           List[float] = Field(default_factory=list)  # full previous month
