import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Globe, Zap, TrendingDown, AlertTriangle, ChevronDown, ChevronUp,
  ExternalLink, ArrowRight, Layers, BarChart2, Cpu, MemoryStick,
  Shield, ShieldOff, Activity, Package, Database, GitBranch,
} from 'lucide-react'

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Number(n).toFixed(2)}`
}
function pct(n) {
  if (n === null || n === undefined) return '—'
  return `${Number(n).toFixed(1)}%`
}

// ── Resource type detection ────────────────────────────────────────────────────

const ASP_TYPE  = 'microsoft.web/serverfarms'
const SITE_TYPE = 'microsoft.web/sites'

function isAppServicePlan(r) { return (r.resource_type || '').toLowerCase() === ASP_TYPE }
function isWebApp(r)         { return (r.resource_type || '').toLowerCase().startsWith(SITE_TYPE) }

// ── App Service Plan SKU tier info ─────────────────────────────────────────────

const SKU_TIER = {
  f1: 'Free', d1: 'Shared',
  b1: 'Basic', b2: 'Basic', b3: 'Basic',
  s1: 'Standard', s2: 'Standard', s3: 'Standard',
  p1v2: 'Premium v2', p2v2: 'Premium v2', p3v2: 'Premium v2',
  p1v3: 'Premium v3', p2v3: 'Premium v3', p3v3: 'Premium v3',
  ep1: 'Elastic Premium', ep2: 'Elastic Premium', ep3: 'Elastic Premium',
  i1v2: 'Isolated v2',   i2v2: 'Isolated v2',   i3v2: 'Isolated v2',
}
function skuLabel(sku) {
  if (!sku) return '—'
  const name = sku.split('/').pop() || sku
  const tier = SKU_TIER[name.toLowerCase()] || ''
  return tier ? `${name} (${tier})` : name
}
function skuName(sku) {
  if (!sku) return ''
  return sku.split('/').pop() || sku
}

// ── App type badge (A3) ────────────────────────────────────────────────────────

function AppTypeBadge({ kind }) {
  if (!kind) return null
  const cfg = {
    function: { label: 'Function', cls: 'bg-purple-900/40 text-purple-300 border-purple-700/40', Icon: Zap },
    logic:    { label: 'Logic App', cls: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40', Icon: Activity },
    web:      { label: 'Web App',   cls: 'bg-blue-900/40 text-blue-300 border-blue-700/40',       Icon: Globe },
  }[kind] || { label: kind, cls: 'bg-gray-800 text-gray-400 border-gray-700', Icon: Globe }
  const { label, cls, Icon } = cfg
  return (
    <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium shrink-0', cls)}>
      <Icon size={10} />{label}
    </span>
  )
}

// ── Runtime badge (A1) ─────────────────────────────────────────────────────────

function RuntimeBadge({ runtime }) {
  if (!runtime) return null
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-mono bg-gray-800/80 text-gray-300 border-gray-700/60 shrink-0">
      <Package size={9} />{runtime}
    </span>
  )
}

// ── SSL expiry indicator (A6) ──────────────────────────────────────────────────

function SslExpiry({ dateStr }) {
  if (!dateStr) return null
  const days = (new Date(dateStr) - Date.now()) / 86400000
  if (days < 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium shrink-0">
      <ShieldOff size={10} /> SSL expired
    </span>
  )
  if (days <= 30) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium shrink-0">
      <ShieldOff size={10} /> SSL exp. {Math.round(days)}d
    </span>
  )
  if (days <= 90) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium shrink-0">
      <Shield size={10} /> SSL exp. {Math.round(days)}d
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-500/70 shrink-0">
      <Shield size={10} /> SSL valid
    </span>
  )
}

// ── Last modified date (A2) ────────────────────────────────────────────────────

function lastModifiedLabel(iso) {
  if (!iso) return null
  try {
    const d    = new Date(iso)
    const days = Math.round((Date.now() - d) / 86400000)
    if (days < 1)  return 'Modified today'
    if (days === 1) return 'Modified yesterday'
    if (days < 30)  return `Modified ${days}d ago`
    if (days < 365) return `Modified ${Math.round(days / 30)}mo ago`
    return `Modified ${Math.round(days / 365)}yr ago`
  } catch { return null }
}

// ── Scale-in recommendation logic ──────────────────────────────────────────────

function calcScaleIn(resource) {
  const instances = resource.instance_count
  const cpu       = resource.primary_utilization_pct
  if (!instances || instances <= 1 || cpu == null) return null
  const totalLoad   = instances * cpu
  const needed      = Math.max(1, Math.ceil(totalLoad / 60))
  if (needed >= instances) return null
  const savingFrac  = (instances - needed) / instances
  const monthlySave = (resource.cost_current_month || 0) * savingFrac
  return { needed, savingFrac, monthlySave }
}

// ── Action cell helper ─────────────────────────────────────────────────────────

function ActionCell({ plan }) {
  const scaleIn     = calcScaleIn(plan)
  const hasRightsize = plan.rightsize_sku && plan.rightsize_savings_pct > 0
  const noMetrics   = plan.primary_utilization_pct == null && (plan.cost_current_month || 0) > 10

  if (scaleIn) return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-900/30 border border-orange-700/40 text-orange-400 whitespace-nowrap font-medium">
        ↓ {plan.instance_count} → {scaleIn.needed} instances
      </span>
      <span className="text-xs text-green-400 font-semibold tabular-nums pl-0.5">{fmt(scaleIn.monthlySave)}/mo saved</span>
    </div>
  )

  if (hasRightsize) return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs bg-blue-900/30 border border-blue-700/40 text-blue-300 whitespace-nowrap font-medium">
        <span className="font-mono">{skuName(plan.sku)}</span>
        <ArrowRight size={10} className="text-gray-500" />
        <span className="font-mono">{plan.rightsize_sku}</span>
      </span>
      <span className="text-xs text-green-400 font-semibold tabular-nums pl-0.5">{fmt(plan.estimated_monthly_savings)}/mo saved</span>
    </div>
  )

  if (noMetrics) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="Enable Azure Monitor diagnostics on this plan to get right-size recommendations">
      <AlertTriangle size={10} /> No metrics
    </span>
  )

  return <span className="text-gray-600 text-xs">{plan.score_label || '—'}</span>
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon }) {
  const accentCls = {
    blue:   'border-l-2 border-l-blue-500/60',
    green:  'border-l-2 border-l-green-500/60',
    orange: 'border-l-2 border-l-orange-500/60',
    purple: 'border-l-2 border-l-purple-500/60',
    red:    'border-l-2 border-l-red-500/60',
  }[accent] || ''

  return (
    <div className={clsx('card flex flex-col gap-1 overflow-hidden', accentCls)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
        {Icon && <div className="p-1.5 rounded-lg bg-gray-800"><Icon size={13} className="text-gray-400" /></div>}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function CpuBar({ pct: value, size = 'sm' }) {
  const color = value == null ? 'bg-gray-700'
    : value > 70 ? 'bg-green-500'
    : value > 30 ? 'bg-yellow-500'
    : 'bg-red-500'
  const h = size === 'lg' ? 'h-2' : 'h-1.5'
  return (
    <div className={clsx('flex-1 bg-gray-800 rounded-full overflow-hidden', h)}>
      <div style={{ width: `${Math.min(100, value ?? 0)}%` }} className={clsx('h-full rounded-full transition-all', color)} />
    </div>
  )
}

// ── Scale-In Advisor ───────────────────────────────────────────────────────────

function ScaleInAdvisor({ plans }) {
  const candidates = useMemo(() => {
    return plans
      .map(r => ({ r, rec: calcScaleIn(r) }))
      .filter(({ rec }) => rec !== null)
      .sort((a, b) => b.rec.monthlySave - a.rec.monthlySave)
  }, [plans])

  if (candidates.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-orange-900/40">
          <Layers size={15} className="text-orange-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Scale-In Advisor</h3>
          <p className="text-xs text-gray-500">
            These plans are running more instances than the workload requires — scale down to save immediately.
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-900/40 border border-orange-700/50 text-xs text-orange-400 font-semibold shrink-0">
          {candidates.length} plan{candidates.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left text-xs" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              {['Plan', 'SKU', 'Instances', 'Avg CPU', 'Recommended', 'Monthly Savings', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {candidates.map(({ r, rec }) => (
              <tr key={r.resource_id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-3 py-3">
                  <p className="font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</p>
                  <p className="text-gray-600 text-xs">{r.resource_group}</p>
                </td>
                <td className="px-3 py-3 text-gray-300 font-mono text-xs">{skuName(r.sku)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-900/40 border border-red-700/40 text-red-400 font-bold text-base">
                      {r.instance_count}
                    </span>
                    <span className="text-gray-600 text-xs">instances</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <CpuBar pct={r.primary_utilization_pct} size="lg" />
                    <span className="tabular-nums text-gray-300 w-10 text-right shrink-0">{pct(r.primary_utilization_pct)}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowRight size={12} className="text-gray-600 shrink-0" />
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-900/40 border border-green-700/40 text-green-400 font-bold text-base">
                      {rec.needed}
                    </span>
                    <span className="text-gray-600 text-xs">instance{rec.needed > 1 ? 's' : ''}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-green-400 text-sm tabular-nums">{fmt(rec.monthlySave)}/mo</p>
                  <p className="text-gray-600 text-xs">{fmt(rec.monthlySave * 12)}/yr · {(rec.savingFrac * 100).toFixed(0)}% reduction</p>
                </td>
                <td className="px-3 py-3">
                  {r.portal_url && (
                    <a href={r.portal_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors whitespace-nowrap">
                      <ExternalLink size={11} /> Portal
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 px-3 py-2.5 rounded-lg bg-orange-950/30 border border-orange-900/40 text-xs text-orange-300/80 leading-relaxed">
        <strong>How we calculate:</strong> Total load = current instances × avg CPU.
        Recommended instances = ⌈total load ÷ 60%⌉ — keeping each instance at a safe 60% ceiling.
        Estimated savings assume equal cost per instance.
      </div>
    </div>
  )
}

// ── SKU Right-Size ─────────────────────────────────────────────────────────────

function SkuRightSize({ plans }) {
  const candidates = plans
    .filter(r => r.rightsize_sku && r.rightsize_savings_pct > 0)
    .sort((a, b) => (b.estimated_monthly_savings || 0) - (a.estimated_monthly_savings || 0))

  if (candidates.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-blue-900/40">
          <TrendingDown size={15} className="text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">SKU Right-Size</h3>
          <p className="text-xs text-gray-500">Plans running a higher tier than their CPU utilization warrants.</p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/50 text-xs text-blue-400 font-semibold shrink-0">
          {candidates.length} plan{candidates.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {candidates.map(r => (
          <div key={r.resource_id}
            className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white text-sm truncate" title={r.resource_name}>{r.resource_name}</p>
              <p className="text-xs text-gray-600">{r.resource_group}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-xs">{skuName(r.sku)}</span>
              <ArrowRight size={12} className="text-gray-600" />
              <span className="px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono text-xs">{r.rightsize_sku}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Cpu size={11} className="text-gray-600" />
              <span className="text-xs text-gray-400 tabular-nums">{pct(r.primary_utilization_pct)} CPU</span>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold text-green-400 text-sm tabular-nums">{fmt(r.estimated_monthly_savings)}/mo</p>
              <p className="text-xs text-gray-600">{r.rightsize_savings_pct?.toFixed(0)}% cheaper</p>
            </div>
            {r.portal_url && (
              <a href={r.portal_url} target="_blank" rel="noreferrer"
                className="shrink-0 text-xs text-gray-600 hover:text-blue-400 transition-colors">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Idle Apps ──────────────────────────────────────────────────────────────────

function IdleApps({ apps, onResourceClick }) {
  const [showAll, setShowAll] = useState(false)
  const idle = apps
    .filter(r => r.score_label === 'Not Used' || (r.score_label === 'Rarely Used' && (r.primary_utilization_pct ?? 100) < 3))
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (idle.length === 0) return null
  const displayed = showAll ? idle : idle.slice(0, 5)

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-red-900/40">
          <AlertTriangle size={15} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Idle Web Apps</h3>
          <p className="text-xs text-gray-500">Apps with near-zero traffic — review for deletion or consolidation.</p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-red-900/40 border border-red-700/50 text-xs text-red-400 font-semibold shrink-0">
          {idle.length} app{idle.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left text-xs" style={{ minWidth: 520 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              {['App', 'Status', 'CPU %', 'Cost / Mo', 'Savings', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {displayed.map(r => (
              <tr key={r.resource_id} onClick={() => onResourceClick?.(r)} className={clsx('transition-colors', onResourceClick ? 'cursor-pointer hover:bg-gray-700/40' : 'hover:bg-gray-800/30')}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</p>
                    <AppTypeBadge kind={r.app_kind} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-gray-600">{r.resource_group}</p>
                    {lastModifiedLabel(r.last_modified) && (
                      <span className="text-gray-700 text-xs">{lastModifiedLabel(r.last_modified)}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-medium',
                    r.score_label === 'Not Used'
                      ? 'bg-red-900/40 text-red-400 border-red-800/50'
                      : 'bg-orange-900/40 text-orange-400 border-orange-800/50',
                  )}>
                    {r.score_label}
                  </span>
                </td>
                <td className="px-3 py-3 tabular-nums text-gray-400">{pct(r.primary_utilization_pct)}</td>
                <td className="px-3 py-3 tabular-nums font-semibold text-white">{fmt(r.cost_current_month)}</td>
                <td className="px-3 py-3 tabular-nums text-green-400 font-semibold">{fmt(r.estimated_monthly_savings)}</td>
                <td className="px-3 py-3">
                  {r.portal_url && (
                    <a href={r.portal_url} target="_blank" rel="noreferrer"
                      className="text-gray-600 hover:text-blue-400 transition-colors">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {idle.length > 5 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {idle.length} idle apps</>}
        </button>
      )}
    </div>
  )
}

// ── Empty Plans ────────────────────────────────────────────────────────────────
// Plans with no apps are pure waste — the plan incurs cost with nothing running on it.

function EmptyPlans({ plans, appsByPlan }) {
  const empty = plans
    .filter(p => {
      const apps = appsByPlan[(p.resource_id || '').toLowerCase()] || []
      return apps.length === 0 && (p.cost_current_month || 0) > 0
    })
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (empty.length === 0) return null

  const totalWaste = empty.reduce((s, p) => s + (p.cost_current_month || 0), 0)

  return (
    <div className="card border-red-800/30 bg-red-950/10">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-red-900/40">
          <AlertTriangle size={15} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Empty App Service Plans</h3>
          <p className="text-xs text-gray-500">These plans have no apps deployed — they are running and billing with nothing to show for it.</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(totalWaste)}/mo</p>
          <p className="text-xs text-gray-600">{empty.length} empty plan{empty.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-2">
        {empty.map(p => (
          <div key={p.resource_id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-gray-800/40 border border-red-900/30">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white text-sm truncate">{p.resource_name}</p>
              <p className="text-xs text-gray-600">{p.resource_group} · <span className="font-mono">{skuName(p.sku) || '—'}</span></p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-red-400 tabular-nums">{fmt(p.cost_current_month)}/mo</p>
              <p className="text-xs text-gray-600">{fmt((p.cost_current_month || 0) * 12)}/yr wasted</p>
            </div>
            {p.portal_url && (
              <a href={p.portal_url} target="_blank" rel="noreferrer" title="Open in Azure Portal"
                className="shrink-0 text-gray-600 hover:text-blue-400 transition-colors">
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-600 leading-relaxed">
        <strong className="text-gray-500">Action:</strong> Delete the plan in the Azure Portal if no apps are planned. If you intend to deploy soon, this is fine — but if the plan has been empty for weeks, it is safe to remove.
      </p>
    </div>
  )
}

// ── Consolidation Hints ────────────────────────────────────────────────────────
// Plans running a single low-traffic app could move onto a shared plan, freeing
// up the dedicated plan cost.

function ConsolidationHints({ plans, appsByPlan }) {
  const candidates = plans
    .filter(p => {
      const apps = appsByPlan[(p.resource_id || '').toLowerCase()] || []
      const cpu  = p.primary_utilization_pct
      return (
        apps.length === 1 &&
        cpu != null && cpu < 15 &&
        (p.cost_current_month || 0) > 30 &&
        // Only flag Basic/Standard — Premium is often justified even for 1 app
        ['b', 's'].some(t => (skuName(p.sku) || '').toLowerCase().startsWith(t))
      )
    })
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (candidates.length === 0) return null

  return (
    <div className="card border-indigo-800/30 bg-indigo-950/10">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-indigo-900/40">
          <Layers size={15} className="text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Consolidation Opportunities</h3>
          <p className="text-xs text-gray-500">Single-app plans running below 15% CPU — consider moving these apps onto a shared plan.</p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-900/40 border border-indigo-700/50 text-xs text-indigo-400 font-semibold shrink-0">
          {candidates.length} plan{candidates.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {candidates.map(p => {
          const app = (appsByPlan[(p.resource_id || '').toLowerCase()] || [])[0]
          return (
            <div key={p.resource_id} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg bg-gray-800/40 border border-indigo-900/30">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm truncate">{p.resource_name}</p>
                <p className="text-xs text-gray-600">
                  <span className="font-mono">{skuName(p.sku)}</span>
                  {app && <> · hosting <span className="text-gray-400">{app.resource_name}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Cpu size={11} className="text-gray-600" />
                <span className="text-xs text-gray-400 tabular-nums">{pct(p.primary_utilization_pct)} avg CPU</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white tabular-nums">{fmt(p.cost_current_month)}/mo</p>
              </div>
              {p.portal_url && (
                <a href={p.portal_url} target="_blank" rel="noreferrer"
                  className="shrink-0 text-gray-600 hover:text-blue-400 transition-colors">
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-gray-600 leading-relaxed">
        <strong className="text-gray-500">How to consolidate:</strong> Move the app to an existing plan via Azure Portal → App → Change App Service Plan, then delete the now-empty plan. Verify both apps are compatible (same OS, same region).
      </p>
    </div>
  )
}

// ── Plans Inventory (with nested apps) ─────────────────────────────────────────

function PlanRow({ plan, appsOnPlan }) {
  const [expanded, setExpanded] = useState(false)
  const scaleIn = calcScaleIn(plan)

  return (
    <>
      <tr
        onClick={() => appsOnPlan.length > 0 && setExpanded(v => !v)}
        className={clsx(
          'transition-colors text-xs',
          appsOnPlan.length > 0 ? 'cursor-pointer hover:bg-gray-800/30' : 'hover:bg-gray-800/20',
          expanded && 'bg-gray-800/40',
        )}
      >
        {/* Plan name + expand toggle */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {appsOnPlan.length > 0 ? (
              <span className="shrink-0 text-gray-500">
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            ) : (
              <span className="w-[13px] shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-white text-sm truncate max-w-[160px]" title={plan.resource_name}>
                {plan.resource_name}
              </p>
              <p className="text-gray-600">{plan.resource_group}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-gray-300">{skuName(plan.sku) || '—'}</td>
        <td className="px-3 py-3 tabular-nums">
          {plan.instance_count != null ? (
            <span className={clsx(
              'inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm',
              scaleIn ? 'bg-orange-900/40 border border-orange-700/40 text-orange-400' : 'bg-gray-800 text-gray-300',
            )}>
              {plan.instance_count}
            </span>
          ) : <span className="text-gray-700">—</span>}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <CpuBar pct={plan.primary_utilization_pct} />
            <span className="tabular-nums text-gray-400 w-10 text-right shrink-0">{pct(plan.primary_utilization_pct)}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <CpuBar pct={plan.avg_memory_pct} />
            <span className="tabular-nums text-gray-400 w-10 text-right shrink-0">{pct(plan.avg_memory_pct)}</span>
          </div>
        </td>
        <td className="px-3 py-3 tabular-nums">
          <p className="font-semibold text-white">{fmt(plan.cost_current_month)}</p>
          {appsOnPlan.length > 0 && (
            <p className="text-gray-600">{appsOnPlan.length} app{appsOnPlan.length > 1 ? 's' : ''}</p>
          )}
        </td>
        <td className="px-3 py-3">
          <ActionCell plan={plan} />
        </td>
        <td className="px-3 py-3">
          {plan.portal_url && (
            <a href={plan.portal_url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-600 hover:text-blue-400 transition-colors">
              <ExternalLink size={12} />
            </a>
          )}
        </td>
      </tr>

      {/* ── Nested apps ── */}
      {expanded && appsOnPlan.map(app => (
        <tr key={app.resource_id} className={clsx('text-xs border-l-2', app.app_state === 'stopped' ? 'bg-red-950/20 border-red-800/50' : 'bg-gray-900/60 border-blue-800/40')}>
          <td className="pl-10 pr-3 py-2.5" colSpan={2}>
            {/* Name + type + status badges */}
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="font-medium text-gray-200 truncate max-w-[160px]" title={app.resource_name}>
                {app.resource_name}
              </span>
              <AppTypeBadge kind={app.app_kind} />
              {app.app_state === 'stopped' && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-red-900/40 text-red-400 border border-red-700/50 font-semibold">Stopped — probable waste</span>
              )}
              {app.score_label === 'Not Used' && app.app_state !== 'stopped' && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-red-900/30 text-red-400 border border-red-800/40">Idle</span>
              )}
              {app.score_label === 'Rarely Used' && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-xs bg-orange-900/30 text-orange-400 border border-orange-800/40">Low traffic</span>
              )}
            </div>
            {/* Detail row: runtime, last modified, custom domains, health check, SSL, slots, storage */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RuntimeBadge runtime={app.runtime_stack} />
              {lastModifiedLabel(app.last_modified) && (
                <span className="text-gray-600 text-xs">{lastModifiedLabel(app.last_modified)}</span>
              )}
              {app.custom_domain_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Globe size={9} />{app.custom_domain_count} domain{app.custom_domain_count !== 1 ? 's' : ''}
                </span>
              )}
              {app.slot_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <GitBranch size={9} />{app.slot_count} slot{app.slot_count !== 1 ? 's' : ''}
                </span>
              )}
              {app.has_linked_storage && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Database size={9} /> storage
                </span>
              )}
              {app.health_check_enabled
                ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Activity size={9} /> health check</span>
                : <span className="inline-flex items-center gap-1 text-xs text-gray-700"><Activity size={9} /> no health check</span>
              }
              <SslExpiry dateStr={app.ssl_expiry_date} />
            </div>
          </td>
          <td className="px-3 py-2.5 text-gray-600">—</td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CpuBar pct={app.primary_utilization_pct} />
              <span className="tabular-nums text-gray-500 w-10 text-right shrink-0">{pct(app.primary_utilization_pct)}</span>
            </div>
          </td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CpuBar pct={app.avg_memory_pct} />
              <span className="tabular-nums text-gray-500 w-10 text-right shrink-0">{pct(app.avg_memory_pct)}</span>
            </div>
          </td>
          <td className="px-3 py-2.5 tabular-nums text-gray-400">{fmt(app.cost_current_month)}</td>
          <td className="px-3 py-2.5 text-gray-600">{app.score_label}</td>
          <td className="px-3 py-2.5">
            {app.portal_url && (
              <a href={app.portal_url} target="_blank" rel="noreferrer"
                className="text-gray-600 hover:text-blue-400 transition-colors">
                <ExternalLink size={12} />
              </a>
            )}
          </td>
        </tr>
      ))}
    </>
  )
}

function PlansInventory({ plans, apps, appsByPlan }) {
  const [sortCol, setSortCol] = useState('cost_current_month')
  const [sortDir, setSortDir] = useState('desc')

  // Apps not linked to any plan (server_farm_id missing or plan not in our list)
  const planIds = new Set(plans.map(p => p.resource_id.toLowerCase()))
  const unlinkedApps = apps.filter(app => {
    const pid = (app.server_farm_id || '').toLowerCase()
    return !pid || !planIds.has(pid)
  })

  function toggle(col) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...plans].sort((a, b) => {
      const av = a[sortCol] ?? 0
      const bv = b[sortCol] ?? 0
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [plans, sortCol, sortDir])

  const Th = ({ col, children }) => (
    <th
      onClick={() => toggle(col)}
      className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {children}
        {sortCol === col && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-gray-800">
          <BarChart2 size={15} className="text-gray-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">All App Service Plans</h3>
          <p className="text-xs text-gray-500">Click a plan to expand and see its hosted apps.</p>
        </div>
        <span className="ml-auto text-xs text-gray-600">{plans.length} plan{plans.length !== 1 ? 's' : ''} · {apps.length} app{apps.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              <Th col="resource_name">Plan / App</Th>
              <Th col="sku">SKU</Th>
              <Th col="instance_count">Instances</Th>
              <Th col="primary_utilization_pct">CPU %</Th>
              <Th col="avg_memory_pct">Memory %</Th>
              <Th col="cost_current_month">Cost / Mo</Th>
              <Th col="score_label">Action</Th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {sorted.map(plan => (
              <PlanRow
                key={plan.resource_id}
                plan={plan}
                appsOnPlan={appsByPlan[plan.resource_id.toLowerCase()] ?? []}
              />
            ))}

            {/* Apps with no linked plan */}
            {unlinkedApps.length > 0 && (
              <>
                <tr>
                  <td colSpan={8} className="px-3 py-2 bg-gray-800/30 text-xs text-gray-600 font-semibold uppercase tracking-wider">
                    Apps (plan not in current scope)
                  </td>
                </tr>
                {unlinkedApps.map(app => (
                  <tr key={app.resource_id} className="hover:bg-gray-800/20 transition-colors text-xs">
                    <td className="pl-6 pr-3 py-2.5" colSpan={2}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Globe size={11} className="text-gray-500 shrink-0" />
                        <span className="font-medium text-gray-300 truncate max-w-[200px]" title={app.resource_name}>
                          {app.resource_name}
                        </span>
                        <AppTypeBadge kind={app.app_kind} />
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <p className="text-gray-600 text-xs">{app.resource_group}</p>
                        {lastModifiedLabel(app.last_modified) && (
                          <span className="text-gray-700 text-xs">{lastModifiedLabel(app.last_modified)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">—</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <CpuBar pct={app.primary_utilization_pct} />
                        <span className="tabular-nums text-gray-500 w-10 text-right">{pct(app.primary_utilization_pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <CpuBar pct={app.avg_memory_pct} />
                        <span className="tabular-nums text-gray-500 w-10 text-right">{pct(app.avg_memory_pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-400">{fmt(app.cost_current_month)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{app.score_label}</td>
                    <td className="px-3 py-2.5">
                      {app.portal_url && (
                        <a href={app.portal_url} target="_blank" rel="noreferrer"
                          className="text-gray-600 hover:text-blue-400 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            )}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-600 text-sm">
                  No App Service Plans found in this scan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AppServicePanel({ resources = [], onResourceClick }) {
  const plans = useMemo(() => resources.filter(isAppServicePlan), [resources])
  const apps  = useMemo(() => resources.filter(isWebApp),         [resources])

  const appsByPlan = useMemo(() => {
    const map = {}
    for (const app of apps) {
      const planId = (app.server_farm_id || '').toLowerCase()
      if (!planId) continue
      if (!map[planId]) map[planId] = []
      map[planId].push(app)
    }
    return map
  }, [apps])

  const totalSpend    = plans.reduce((s, r) => s + (r.cost_current_month || 0), 0)
  const appSpend      = apps.reduce((s, r)  => s + (r.cost_current_month || 0), 0)

  const scaleInSavings = useMemo(() =>
    plans.reduce((s, r) => { const rec = calcScaleIn(r); return s + (rec?.monthlySave ?? 0) }, 0)
  , [plans])

  const skuSavings = plans
    .filter(r => r.rightsize_sku)
    .reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0)

  const emptyCount = plans.filter(p => {
    const a = appsByPlan[(p.resource_id || '').toLowerCase()] || []
    return a.length === 0 && (p.cost_current_month || 0) > 0
  }).length

  const idleCount = apps.filter(r =>
    r.score_label === 'Not Used' || (r.score_label === 'Rarely Used' && (r.primary_utilization_pct ?? 100) < 3)
  ).length

  const stoppedApps = apps.filter(r => r.app_state === 'stopped')

  const totalSavings = scaleInSavings + skuSavings

  if (plans.length === 0 && apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="p-4 rounded-full bg-gray-800">
          <Globe size={28} className="text-gray-600" />
        </div>
        <div>
          <p className="text-gray-400 font-semibold">No App Service resources found</p>
          <p className="text-gray-600 text-sm mt-1">
            App Service Plans and Web Apps will appear here once your subscription has some.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">App Service Management</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Right-size plans, scale in over-provisioned instances, and identify idle apps.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KpiCard label="Plan Spend"    value={fmt(totalSpend)}          sub="this month"                  accent="blue"                                    icon={Zap} />
        <KpiCard label="App Spend"     value={fmt(appSpend)}            sub="web apps + functions"        accent="purple"                                  icon={Globe} />
        <KpiCard label="Plans"         value={plans.length}             sub={`${apps.length} apps / functions`} />
        <KpiCard label="Empty Plans"   value={emptyCount}               sub="no apps deployed"            accent={emptyCount > 0 ? 'orange' : undefined}   icon={AlertTriangle} />
        <KpiCard label="Stopped Apps"  value={stoppedApps.length}       sub="probable waste"              accent={stoppedApps.length > 0 ? 'red' : undefined} icon={AlertTriangle} />
        <KpiCard label="Est. Savings"  value={fmt(totalSavings)}        sub="scale-in + SKU right-size"  accent="green"                                   icon={TrendingDown} />
      </div>

      {/* Empty plans — most urgent, pure waste */}
      <EmptyPlans plans={plans} appsByPlan={appsByPlan} />

      {/* Scale-In Advisor */}
      <ScaleInAdvisor plans={plans} />

      {/* SKU Right-Size */}
      <SkuRightSize plans={plans} />

      {/* Consolidation opportunities */}
      <ConsolidationHints plans={plans} appsByPlan={appsByPlan} />

      {/* Idle Apps */}
      <IdleApps apps={apps} onResourceClick={onResourceClick} />

      {/* Full plans inventory with nested apps */}
      <PlansInventory plans={plans} apps={apps} appsByPlan={appsByPlan} />

    </div>
  )
}
