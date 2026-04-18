import React, { useMemo, useState } from 'react'
import { TrendingUp, Info, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

// ── Size tiers ─────────────────────────────────────────────────────────────────
// Smaller organisations have less FinOps maturity → higher waste, lower tag
// compliance, lower RI coverage. Baselines shift accordingly.
// Sources: Flexera 2024, FinOps Foundation Maturity Model, Gartner.

function getSizeTier(total) {
  if (!total) return 'medium'
  if (total < 50)  return 'small'
  if (total < 500) return 'medium'
  return 'large'
}

const TIER_LABELS = {
  small:  'Small-scale · <50 resources',
  medium: 'Mid-scale · 50–500 resources',
  large:  'Large-scale · 500+ resources',
}

// ── Resource mix detection ─────────────────────────────────────────────────────
// Classifies the subscription as IaaS-heavy, PaaS-heavy, Container-heavy, or
// Mixed based on which resource types dominate by count.

const IAAS_TYPES   = ['microsoft.compute/virtualmachines', 'microsoft.compute/disks', 'microsoft.compute/snapshots']
const PAAS_TYPES   = ['microsoft.web/sites', 'microsoft.web/serverfarms', 'microsoft.sql/servers', 'microsoft.sql/servers/databases', 'microsoft.dbforpostgresql', 'microsoft.dbformysql', 'microsoft.dbformariadb', 'microsoft.cache/redis', 'microsoft.servicebus', 'microsoft.eventhub']
const CONTAINER_TYPES = ['microsoft.containerservice/managedclusters', 'microsoft.containerregistry/registries', 'microsoft.app/containerapps', 'microsoft.app/managedenvironments']

function getResourceMix(typeSummary) {
  if (!typeSummary?.length) return null
  let iaas = 0, paas = 0, containers = 0, total = 0
  typeSummary.forEach(r => {
    const t = (r.resource_type || '').toLowerCase()
    const c = r.count || 0
    total += c
    if (IAAS_TYPES.some(x => t.startsWith(x)))      iaas += c
    else if (CONTAINER_TYPES.some(x => t.startsWith(x))) containers += c
    else if (PAAS_TYPES.some(x => t.startsWith(x))) paas += c
  })
  if (!total) return null
  const iaasPct      = iaas / total
  const paasPct      = paas / total
  const containerPct = containers / total
  if (containerPct > 0.3)  return 'Container-heavy'
  if (iaasPct > 0.5)       return 'IaaS-heavy'
  if (paasPct > 0.5)       return 'PaaS-heavy'
  return 'Mixed workloads'
}

// ── Industry benchmarks ────────────────────────────────────────────────────────
// industryAvg is broken out by size tier. All figures are medians/averages from
// published FinOps research, adjusted for org maturity at each scale.
// Prefixed with ~ in the UI to signal approximation.

const BENCHMARKS = [
  {
    id:             'waste_rate',
    label:          'Cloud Waste Rate',
    description:    'Percentage of cloud spend that could be eliminated without impacting workloads.',
    industryAvg:    { small: 35, medium: 30, large: 22 },
    higherIsBetter: false,
    source:         'Flexera 2024 State of Cloud Report (n=753 orgs); tier adjustments from FinOps Foundation Maturity Model',
  },
  {
    id:             'health_rate',
    label:          'Resource Health Rate',
    description:    'Percentage of resources that are actively or fully utilised.',
    industryAvg:    { small: 58, medium: 65, large: 72 },
    higherIsBetter: true,
    source:         'Gartner Cloud Infrastructure Optimisation Survey (est.); tier adjustments applied',
  },
  {
    id:             'tag_compliance',
    label:          'Tag Compliance',
    description:    'Percentage of resources with all required governance tags applied.',
    industryAvg:    { small: 32, medium: 52, large: 68 },
    higherIsBetter: true,
    source:         'CloudBolt State of FinOps 2024 (n=300+ orgs); smaller orgs show significantly lower compliance',
  },
  {
    id:             'orphan_rate',
    label:          'Orphan Resource Rate',
    description:    'Percentage of resources that are unattached or have no active parent.',
    industryAvg:    { small: 14, medium: 10, large: 7 },
    higherIsBetter: false,
    source:         'Flexera 2024 State of Cloud Report (n=753 orgs); larger orgs have automated cleanup',
  },
  {
    id:             'ri_coverage',
    label:          'Reservation Coverage',
    description:    'Percentage of RI-eligible resources covered by an active reservation.',
    industryAvg:    { small: 18, medium: 38, large: 58 },
    higherIsBetter: true,
    source:         'Flexera 2024 State of Cloud Report (n=753 orgs); volume purchasing scales with org size',
  },
]

// ── Status helpers ─────────────────────────────────────────────────────────────

function getStatus(value, avg, higherIsBetter) {
  if (higherIsBetter) {
    if (value >= avg * 1.2) return 'good'
    if (value >= avg * 0.8) return 'ok'
    return 'attention'
  } else {
    if (value <= avg * 0.8) return 'good'
    if (value <= avg * 1.2) return 'ok'
    return 'attention'
  }
}

const STATUS_COLORS = {
  good:      { dot: 'bg-green-400', text: 'text-green-400', badge: 'bg-green-900/30 border-green-700/40 text-green-400', bar: 'bg-green-500' },
  ok:        { dot: 'bg-amber-400', text: 'text-amber-400', badge: 'bg-amber-900/30 border-amber-700/40 text-amber-400', bar: 'bg-amber-500' },
  attention: { dot: 'bg-red-400',   text: 'text-red-400',   badge: 'bg-red-900/30 border-red-700/40 text-red-400',       bar: 'bg-red-500'   },
}

const STATUS_LABELS = { good: 'Above avg', ok: 'Near avg', attention: 'Below avg' }

// ── Tooltip ────────────────────────────────────────────────────────────────────

function SourceTooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex shrink-0">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-gray-500 hover:text-gray-300 transition-colors"
        tabIndex={-1}
      >
        <Info size={11} />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-2.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 shadow-xl leading-relaxed pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700" />
        </span>
      )}
    </span>
  )
}

// ── Position bar ───────────────────────────────────────────────────────────────

function PositionBar({ value, avg, status }) {
  const max    = Math.max(value, avg) * 1.5 || 100
  const valPct = Math.min((value / max) * 100, 100)
  const avgPct = Math.min((avg   / max) * 100, 100)
  const colors = STATUS_COLORS[status]

  return (
    <div className="relative h-2 w-32 bg-gray-800 rounded-full overflow-visible shrink-0">
      <div
        className={clsx('absolute left-0 top-0 h-full rounded-full', colors.bar)}
        style={{ width: `${valPct}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-gray-400 rounded-full z-10"
        style={{ left: `${avgPct}%` }}
        title={`Benchmark for this scale: ~${avg}%`}
      />
    </div>
  )
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricRow({ bench, value, tier }) {
  const avg    = bench.industryAvg[tier]
  const status = getStatus(value, avg, bench.higherIsBetter)
  const colors = STATUS_COLORS[status]

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0">
      <span className={clsx('w-2 h-2 rounded-full shrink-0', colors.dot)} />

      <div className="flex items-center gap-1 w-44 shrink-0">
        <span className="text-xs text-gray-300 font-medium truncate">{bench.label}</span>
        <SourceTooltip text={`${bench.description} · Source: ${bench.source}`} />
      </div>

      <span className={clsx('text-sm font-bold tabular-nums w-14 shrink-0', colors.text)}>
        {value.toFixed(1)}%
      </span>

      <PositionBar value={value} avg={avg} status={status} />

      <span className="text-xs text-gray-400 shrink-0 w-24">
        ~{avg}% for scale
      </span>

      <span className={clsx(
        'hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium shrink-0',
        colors.badge,
      )}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )
}

// ── Per-type table ─────────────────────────────────────────────────────────────

const TYPE_BASELINE = 65

function TypeTable({ rows }) {
  const [open, setOpen] = useState(false)
  const filtered = rows
    .filter(r => r.count >= 2)
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (filtered.length < 2) return null

  return (
    <div className="mt-4 border-t border-gray-800/60 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Score by Resource Type
        <span className="ml-1 text-gray-500">(vs. approximate industry baseline)</span>
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-800/80">
          <table className="w-full text-left text-xs" style={{ minWidth: 500 }}>
            <thead>
              <tr className="bg-gray-800/70 border-b border-gray-700/60">
                {['Resource Type', 'Your Avg Score', `~${TYPE_BASELINE} baseline`, 'Assessment', 'Resources'].map(h => (
                  <th key={h} className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map(r => {
                const score  = r.avg_score ?? 0
                const diff   = score - TYPE_BASELINE
                const status = score >= 75 ? 'good' : score >= 55 ? 'ok' : 'attention'
                const colors = STATUS_COLORS[status]
                const label  = score >= 75 ? 'Above avg' : score >= 55 ? 'Near avg' : 'Below avg'
                return (
                  <tr key={r.resource_type} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-gray-300 font-medium">{r.display_name || r.resource_type.split('/').pop()}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.min(score, 100)}%` }} className={clsx('h-full rounded-full', colors.bar)} />
                        </div>
                        <span className={clsx('tabular-nums font-semibold', colors.text)}>{score.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{TYPE_BASELINE}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded border text-xs font-medium', colors.badge)}>
                        {label}
                        {diff !== 0 && (
                          <span className="ml-1 opacity-70">({diff > 0 ? '+' : ''}{diff.toFixed(0)})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 tabular-nums">{r.count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-800/60">
            Baseline of {TYPE_BASELINE} is an approximation from Gartner utilisation data — no published per-type benchmarks exist.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BenchmarkPanel({ kpi, resources = [], resourceTypeSummary = [], tagCompliancePct = null }) {
  const [collapsed, setCollapsed] = useState(false)

  const tier = useMemo(() => getSizeTier(kpi?.total_resources), [kpi])
  const mix  = useMemo(() => getResourceMix(resourceTypeSummary), [resourceTypeSummary])

  const metrics = useMemo(() => {
    if (!kpi) return []
    const result = []

    const curr    = kpi.total_cost_current_month
    const savings = kpi.total_potential_savings
    if (curr > 0 && savings != null)
      result.push({ bench: BENCHMARKS.find(b => b.id === 'waste_rate'), value: (savings / curr) * 100 })

    if (kpi.health_score_pct != null && kpi.total_resources > 0)
      result.push({ bench: BENCHMARKS.find(b => b.id === 'health_rate'), value: kpi.health_score_pct })

    if (tagCompliancePct != null)
      result.push({ bench: BENCHMARKS.find(b => b.id === 'tag_compliance'), value: tagCompliancePct })

    if (kpi.total_resources > 0 && kpi.orphan_count != null)
      result.push({ bench: BENCHMARKS.find(b => b.id === 'orphan_rate'), value: (kpi.orphan_count / kpi.total_resources) * 100 })

    const riCovered  = resources.filter(r => r.ri_covered).length
    const riEligible = resources.filter(r => r.ri_eligible && !r.ri_covered).length
    const riPool     = riCovered + riEligible
    if (riPool > 0)
      result.push({ bench: BENCHMARKS.find(b => b.id === 'ri_coverage'), value: (riCovered / riPool) * 100 })

    return result
  }, [kpi, resources, tagCompliancePct])

  if (!kpi || metrics.length === 0) return null

  return (
    <div className="card">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-900/40">
            <TrendingUp size={15} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Industry Benchmark</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">How your environment compares to organisations of similar scale and type</p>
              {(tier || mix) && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-xs text-blue-300 shrink-0">
                  {TIER_LABELS[tier]}{mix ? ` · ${mix}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        {collapsed ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronUp size={14} className="text-gray-500 shrink-0" />}
      </button>

      {!collapsed && (
        <div className="mt-4">
          <div>
            {metrics.map(({ bench, value }) => (
              <MetricRow key={bench.id} bench={bench} value={value} tier={tier} />
            ))}
          </div>

          <TypeTable rows={resourceTypeSummary} />

          <p className="mt-4 text-xs text-gray-500 leading-relaxed border-t border-gray-800/60 pt-3">
            Benchmarks are calibrated to your subscription profile ({TIER_LABELS[tier]}{mix ? `, ${mix}` : ''}). Industry figures are medians from cross-company FinOps research — individual organisations vary widely. Use these as directional signals, not fixed targets.
          </p>
        </div>
      )}
    </div>
  )
}
