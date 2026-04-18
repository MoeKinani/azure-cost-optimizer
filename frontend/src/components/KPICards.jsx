import React, { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Brain, Lightbulb,
  Leaf, Zap, Target, AlertTriangle, Flame, Info, BookmarkCheck, ArrowUpRight,
} from 'lucide-react'
import clsx from 'clsx'

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(n, decimals = 0) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals || 2 }).format(n)
}

function fmtShort(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000)    return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex">
      <button onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="text-gray-700 hover:text-gray-500 transition-colors">
        <Info size={11} />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 p-2.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 shadow-xl leading-relaxed pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700" />
        </div>
      )}
    </div>
  )
}

// ── Cost Score grade style ─────────────────────────────────────────────────────

function gradeStyle(grade) {
  if (grade === 'A') return { color: 'text-green-400',  bg: 'bg-green-900/30',  border: 'border-green-700/40',  accent: 'green'  }
  if (grade === 'B') return { color: 'text-blue-400',   bg: 'bg-blue-900/30',   border: 'border-blue-700/40',   accent: 'blue'   }
  if (grade === 'C') return { color: 'text-yellow-400', bg: 'bg-yellow-900/30', border: 'border-yellow-700/40', accent: 'amber'  }
  if (grade === 'D') return { color: 'text-orange-400', bg: 'bg-orange-900/30', border: 'border-orange-700/40', accent: 'orange' }
  return                     { color: 'text-red-400',   bg: 'bg-red-900/30',    border: 'border-red-700/40',    accent: 'red'    }
}

function componentColor(score) {
  if (score >= 80) return { bar: 'bg-green-500',  text: 'text-green-400'  }
  if (score >= 60) return { bar: 'bg-yellow-500', text: 'text-yellow-400' }
  if (score >= 40) return { bar: 'bg-orange-500', text: 'text-orange-400' }
  return                   { bar: 'bg-red-500',   text: 'text-red-400'    }
}

// ── Mini comparison bar ────────────────────────────────────────────────────────

function CompareBar({ current, previous, colorCurrent = '#3b82f6', colorPrevious = '#1e3a5f' }) {
  const max = Math.max(current, previous, 0.01)
  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 w-16 shrink-0">This mo.</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div style={{ width: `${(current / max) * 100}%`, backgroundColor: colorCurrent }}
            className="h-full rounded-full transition-all" />
        </div>
        <span className="text-xs font-semibold text-white w-14 text-right tabular-nums">{fmtShort(current)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 w-16 shrink-0">Last mo.</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div style={{ width: `${(previous / max) * 100}%`, backgroundColor: colorPrevious }}
            className="h-full rounded-full transition-all" />
        </div>
        <span className="text-xs text-gray-500 w-14 text-right tabular-nums">{fmtShort(previous)}</span>
      </div>
    </div>
  )
}

// ── Mini savings breakdown ─────────────────────────────────────────────────────

function SavingsBreakdown({ orphanCost, notUsedCost, advisorSavings }) {
  const items = [
    { label: 'Orphaned',  value: orphanCost,    color: 'bg-orange-500', dot: 'text-orange-400' },
    { label: 'Confirmed Waste', value: notUsedCost,   color: 'bg-red-500',    dot: 'text-red-400'    },
    { label: 'Advisor',   value: advisorSavings, color: 'bg-yellow-500', dot: 'text-yellow-400' },
  ].filter(i => i.value > 0)

  if (!items.length) return null
  const total = items.reduce((s, i) => s + i.value, 0)

  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
        {items.map(item => (
          <div key={item.label} style={{ width: `${(item.value / total) * 100}%` }}
            className={clsx('h-full first:rounded-l-full last:rounded-r-full', item.color)} />
        ))}
      </div>
      <div className="flex gap-3">
        {items.map(item => (
          <span key={item.label} className="flex items-center gap-1 text-xs text-gray-600">
            <span className={clsx('font-semibold', item.dot)}>{fmtShort(item.value)}</span>
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Individual KPI card shells ─────────────────────────────────────────────────

function Card({ className, accent, onClick, children }) {
  const accentClass = {
    red:    'border-l-2 border-l-red-500/70',
    green:  'border-l-2 border-l-green-500/70',
    amber:  'border-l-2 border-l-amber-500/70',
    blue:   'border-l-2 border-l-blue-500/70',
    indigo: 'border-l-2 border-l-indigo-500/70',
    orange: 'border-l-2 border-l-orange-500/70',
  }[accent] || ''
  return (
    <div
      onClick={onClick}
      className={clsx(
        'card flex flex-col gap-0 overflow-hidden transition-colors',
        accentClass,
        onClick && 'cursor-pointer hover:border-gray-600 hover:bg-gray-800/80',
        className,
      )}
    >
      {children}
      {onClick && (
        <div className="mt-auto pt-2 text-xs text-gray-700 hover:text-gray-500 flex items-center gap-1">
          <span>View details →</span>
        </div>
      )}
    </div>
  )
}

function CardHeader({ title, icon: Icon, iconClass, tooltip }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <div className={clsx('p-1.5 rounded-lg', iconClass)}>
        <Icon size={14} />
      </div>
    </div>
  )
}

// ── Main KPI Cards ─────────────────────────────────────────────────────────────

export default function KPICards({ kpi, aiEnabled, totalCarbon = 0, tagCompliancePct = 100, resources = [], savingsRecs = [], onDrillDown }) {
  const topSpender = useMemo(() => {
    if (!resources?.length) return null
    const scored = resources.filter(r => !r.is_infrastructure && r.cost_current_month > 0)
    if (!scored.length) return null
    const top = [...scored].sort((a, b) => b.cost_current_month - a.cost_current_month)[0]
    // Use the backend-computed MTD delta when available — avoids fake drops early in the month
    const momDelta    = top.cost_delta_pct ?? null
    const isMtdDelta  = top.cost_delta_is_mtd ?? false
    const rightsizeCount = resources.filter(r => r.rightsize_sku).length
    return { resource: top, momDelta, isMtdDelta, rightsizeCount }
  }, [resources])
  if (!kpi) return null

  const curr     = kpi.total_cost_current_month  ?? 0
  const prev     = kpi.total_cost_previous_month ?? 0
  const delta    = curr - prev
  const deltaPct = prev > 0 ? ((delta / prev) * 100) : 0
  const dailyRate = curr / new Date().getDate()   // spend per day so far this month
  const forecastNext = prev > 0 ? curr * (1 + deltaPct / 100) : curr

  // AI-derived KPIs from resources array
  const aiKpis = useMemo(() => {
    if (!aiEnabled || !resources.length) return null
    const reviewed    = resources.filter(r => r.ai_explanation)
    const deleteRecs  = reviewed.filter(r => r.ai_action === 'delete')
    const highConf    = reviewed.filter(r => r.ai_confidence === 'high' && (r.ai_score_adjustment ?? 0) < -5)
    const aiSavings   = reviewed.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0)
    const topFinding  = [...reviewed]
      .filter(r => r.ai_explanation && r.ai_action !== 'none' && r.ai_action !== 'monitor')
      .sort((a, b) => (b.estimated_monthly_savings || 0) - (a.estimated_monthly_savings || 0))[0]
    return { reviewed: reviewed.length, deleteRecs: deleteRecs.length, highConf: highConf.length, aiSavings, topFinding }
  }, [resources, aiEnabled])

  // Advisor breakdown by impact
  const advisorBreakdown = useMemo(() => {
    const h = resources.reduce((s, r) => s + r.advisor_recommendations?.filter(a => a.impact === 'High').length, 0)
    const m = resources.reduce((s, r) => s + r.advisor_recommendations?.filter(a => a.impact === 'Medium').length, 0)
    const l = resources.reduce((s, r) => s + r.advisor_recommendations?.filter(a => a.impact === 'Low').length, 0)
    return { high: h, medium: m, low: l }
  }, [resources])

  // Orphan savings
  const orphanSavings = kpi.orphan_cost ?? 0
  // Advisor savings from recs
  const advisorSavings = savingsRecs
    .filter(r => r.advisor_count > 0)
    .reduce((s, r) => s + r.estimated_monthly_savings, 0)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">

      {/* ── 1. Spend: This Month vs Last Month ──────────────────────────── */}
      <Card accent={delta > 0 ? 'red' : delta < 0 ? 'green' : undefined} onClick={onDrillDown ? () => onDrillDown('grade') : undefined}>
        <CardHeader
          title="Monthly Spend"
          icon={DollarSign}
          iconClass="bg-blue-900/50 text-blue-400"
          tooltip="Actual Azure spend billed this calendar month compared to last month."
        />
        <div className="flex items-end justify-between gap-2 mb-1">
          <div>
            <p className="text-3xl font-bold text-white tabular-nums leading-none">{fmtShort(curr)}</p>
            <p className="text-xs text-gray-500 mt-1">this month</p>
          </div>
          <div className="text-right">
            <p className={clsx('text-lg font-bold tabular-nums', delta > 0 ? 'text-red-400' : delta < 0 ? 'text-green-400' : 'text-gray-500')}>
              {delta > 0 ? '+' : ''}{fmtShort(delta)}
            </p>
            <p className={clsx('text-xs font-medium', delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-500' : 'text-gray-600')}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(deltaPct).toFixed(1)}% MoM
            </p>
          </div>
        </div>
        <CompareBar current={curr} previous={prev} />
        <div className="mt-2 pt-2 border-t border-gray-800/60 flex items-center justify-between text-xs text-gray-600">
          <span>${dailyRate.toFixed(2)}/day avg</span>
          <span>Forecast: <span className={clsx('font-semibold', forecastNext > curr ? 'text-red-400' : 'text-green-400')}>{fmtShort(forecastNext)}</span></span>
        </div>
        {prev > 0 && (
          <div className="mt-2 rounded-md bg-gray-800/60 px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-xs text-gray-500">Annual pace</span>
            <span className="text-xs font-bold text-white tabular-nums">{fmtShort(prev * 12)}<span className="text-gray-500 font-normal">/yr</span></span>
          </div>
        )}
      </Card>

      {/* ── 2. Savings Opportunity ──────────────────────────────────────── */}
      {(() => {
        const totalSavings   = kpi.total_potential_savings ?? 0
        const annualSavings  = totalSavings * 12
        const annualBill     = prev * 12
        const annualOptimized = annualBill > 0 ? Math.max(0, annualBill - annualSavings) : 0
        const wastePct = curr > 0 ? ((totalSavings / curr) * 100).toFixed(0) : 0
        const actionableCount = (kpi.not_used_count ?? 0) + (kpi.orphan_count ?? 0)
        const notUsedSavings  = kpi.not_used_cost ?? 0
        const accountedSavings = notUsedSavings + orphanSavings + advisorSavings
        const rightsizeSavings = Math.max(0, totalSavings - accountedSavings)
        const sources = [
          { label: 'Confirmed Waste', value: notUsedSavings,   color: 'bg-red-500',    text: 'text-red-400'    },
          { label: 'Orphaned',        value: orphanSavings,    color: 'bg-orange-500', text: 'text-orange-400' },
          { label: 'Advisor',         value: advisorSavings,   color: 'bg-yellow-500', text: 'text-yellow-400' },
          { label: 'Right-sizing',    value: rightsizeSavings, color: 'bg-blue-500',   text: 'text-blue-400'   },
        ].filter(s => s.value > 0)
        const sourcesTotal = sources.reduce((s, i) => s + i.value, 0)

        return (
          <Card accent="green" onClick={onDrillDown ? () => onDrillDown('savings') : undefined}>
            <CardHeader
              title="Savings Opportunity"
              icon={TrendingDown}
              iconClass="bg-green-900/50 text-green-400"
              tooltip="Total estimated monthly savings if all recommendations are actioned — orphaned resources, confirmed waste, and Azure Advisor findings."
            />

            {/* Annual headline — lead with the big number */}
            <div className="rounded-lg bg-green-950/50 border border-green-800/30 px-3 py-2.5 mb-3">
              <p className="text-2xl font-black text-green-400 tabular-nums leading-none">
                {fmtShort(annualSavings)}
                <span className="text-sm font-semibold text-green-600 ml-1">/yr</span>
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-green-700">{fmtShort(totalSavings)}/mo potential</p>
                {wastePct > 0 && (
                  <span className="text-xs font-semibold text-green-500">{wastePct}% of bill</span>
                )}
              </div>
              {annualBill > 0 && annualSavings > 0 && (
                <div className="mt-2 pt-2 border-t border-green-900/40 flex items-center justify-between text-xs text-green-800">
                  <span>{fmtShort(annualBill)}/yr now</span>
                  <span className="text-green-600">→</span>
                  <span className="text-green-500 font-semibold">{fmtShort(annualOptimized)}/yr optimized</span>
                </div>
              )}
            </div>

            {/* Source breakdown — labeled rows */}
            {sources.length > 0 && (
              <div className="space-y-1.5">
                {sources.map(s => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-500">{s.label}</span>
                      <span className={clsx('font-semibold tabular-nums', s.text)}>{fmtShort(s.value)}</span>
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full', s.color)}
                        style={{ width: `${(s.value / sourcesTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            {actionableCount > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-800/60 text-xs text-gray-600">
                <span className="text-white font-semibold">{actionableCount}</span> resources ready to action
              </div>
            )}
          </Card>
        )
      })()}

      {/* ── 3. Cost Score ────────────────────────────────────────────── */}
      {(() => {
        const score      = kpi.cost_score       ?? 0
        const grade      = kpi.cost_grade       || 'F'
        const scoreLabel = kpi.cost_score_label || 'Critical'
        const components = kpi.cost_score_components || {}
        const gs         = gradeStyle(grade)

        const rows = [
          { key: 'waste',        label: 'Confirmed Waste',  weight: '25%' },
          { key: 'orphans',      label: 'Orphans',          weight: '25%' },
          { key: 'advisor',      label: 'Azure Advisor',    weight: '20%' },
          { key: 'reservations', label: 'Reservations',     weight: '20%' },
          { key: 'health',       label: 'Resource Health',  weight: '10%' },
        ]

        return (
          <Card accent={gs.accent} onClick={onDrillDown ? () => onDrillDown('grade') : undefined}>
            <CardHeader
              title="Cost Score"
              icon={Target}
              iconClass="bg-purple-900/50 text-purple-400"
              tooltip="Composite 0–100 score: orphan waste (25%), confirmed waste (25%), Azure Advisor findings (20%), reservation coverage (20%), resource health (10%)."
            />

            {/* Grade + numeric score */}
            <div className="flex items-center gap-3 mb-4">
              <div className={clsx('w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center shrink-0', gs.bg, gs.border)}>
                <span className={clsx('text-2xl font-black leading-none', gs.color)}>{grade}</span>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white tabular-nums leading-none">{score}</span>
                  <span className="text-sm text-gray-600">/100</span>
                </div>
                <p className={clsx('text-xs font-semibold mt-0.5', gs.color)}>{scoreLabel}</p>
              </div>
            </div>

            {/* Component breakdown bars */}
            <div className="space-y-2">
              {rows.map(row => {
                const s  = components[row.key] ?? 0
                const cc = componentColor(s)
                return (
                  <div key={row.key}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-500">{row.label}</span>
                      <span className={clsx('font-semibold tabular-nums', cc.text)}>{s.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all duration-500', cc.bar)}
                        style={{ width: `${s}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      {/* ── 4. Waste Alert ──────────────────────────────────────────────── */}
      <Card accent={(kpi.not_used_count ?? 0) > 0 || (kpi.orphan_count ?? 0) > 0 ? 'orange' : undefined} onClick={onDrillDown ? () => onDrillDown('waste') : undefined}>
        <CardHeader
          title="Waste Alert"
          icon={Flame}
          iconClass={(kpi.not_used_count ?? 0) > 0 ? 'bg-orange-900/50 text-orange-400' : 'bg-gray-800 text-gray-600'}
          tooltip="Resources that are running but not being used — immediate deletion candidates."
        />
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-3xl font-bold text-white tabular-nums leading-none">
              {(kpi.not_used_count ?? 0) + (kpi.orphan_count ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">resources to act on</p>
          </div>
          {(kpi.not_used_cost ?? 0) + (kpi.orphan_cost ?? 0) > 0 && (
            <div className="text-right">
              <p className="text-base font-bold text-orange-400 tabular-nums">{fmtShort((kpi.not_used_cost ?? 0) + (kpi.orphan_cost ?? 0))}</p>
              <p className="text-xs text-gray-600">wasted/mo</p>
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              Confirmed Waste
            </span>
            <span className="font-semibold text-red-400">{kpi.not_used_count ?? 0} · {fmtShort(kpi.not_used_cost ?? 0)}/mo</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              Orphaned
            </span>
            <span className="font-semibold text-orange-400">{kpi.orphan_count ?? 0} · {fmtShort(kpi.orphan_cost ?? 0)}/mo</span>
          </div>
          {advisorSavings > 0 && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-800/60">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                Advisor savings
              </span>
              <span className="font-semibold text-yellow-400">{fmtShort(advisorSavings)}/mo</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── 5. Azure Advisor ────────────────────────────────────────────── */}
      <Card accent={advisorBreakdown.high > 0 ? 'amber' : undefined} onClick={onDrillDown ? () => onDrillDown('advisor') : undefined}>
        <CardHeader
          title="Azure Advisor"
          icon={Lightbulb}
          iconClass={kpi.advisor_total_recs > 0 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-gray-800 text-gray-600'}
          tooltip="Azure Advisor recommendations across Cost, Security, Reliability, Performance, and Operational Excellence."
        />
        <div className="flex items-end gap-3 mb-3">
          <p className="text-3xl font-bold text-white tabular-nums leading-none">{kpi.advisor_total_recs}</p>
          <p className="text-xs text-gray-500 mb-1">total alerts</p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />High impact
            </span>
            <span className={clsx('font-bold tabular-nums', advisorBreakdown.high > 0 ? 'text-red-400' : 'text-gray-600')}>{advisorBreakdown.high}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />Medium impact
            </span>
            <span className={clsx('font-bold tabular-nums', advisorBreakdown.medium > 0 ? 'text-orange-400' : 'text-gray-600')}>{advisorBreakdown.medium}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />Low impact
            </span>
            <span className={clsx('font-bold tabular-nums', advisorBreakdown.low > 0 ? 'text-blue-400' : 'text-gray-600')}>{advisorBreakdown.low}</span>
          </div>
        </div>
      </Card>

      {/* ── 6. AI Intelligence ─────────────────────────────────────────── */}
      <Card accent={aiEnabled ? 'indigo' : undefined} onClick={aiEnabled && onDrillDown ? () => onDrillDown('ai') : undefined}>
        <CardHeader
          title="AI Intelligence"
          icon={Brain}
          iconClass={aiEnabled ? 'bg-indigo-900/50 text-indigo-400' : 'bg-gray-800 text-gray-600'}
          tooltip="Resources reviewed by AI. AI identifies false positives, explains findings in plain English, and adjusts scores based on context rules can't see."
        />
        {aiEnabled && aiKpis ? (
          <>
            <div className="flex items-end gap-3 mb-3">
              <p className="text-3xl font-bold text-white tabular-nums leading-none">{aiKpis.reviewed}</p>
              <p className="text-xs text-gray-500 mb-1">resources reviewed</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />High confidence issues
                </span>
                <span className={clsx('font-bold tabular-nums', aiKpis.highConf > 0 ? 'text-indigo-400' : 'text-gray-600')}>{aiKpis.highConf}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />Delete recommended
                </span>
                <span className={clsx('font-bold tabular-nums', aiKpis.deleteRecs > 0 ? 'text-red-400' : 'text-gray-600')}>{aiKpis.deleteRecs}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />AI-detected savings
                </span>
                <span className="font-bold tabular-nums text-green-400">{fmtShort(aiKpis.aiSavings)}/mo</span>
              </div>
            </div>
            {aiKpis.topFinding && (
              <div className="mt-2 pt-2 border-t border-gray-800/60 text-xs">
                <p className="text-gray-600 mb-0.5">Top finding</p>
                <p className="text-indigo-300 truncate font-medium" title={aiKpis.topFinding.resource_name}>
                  {aiKpis.topFinding.resource_name}
                </p>
                <p className="text-gray-500 truncate">{aiKpis.topFinding.ai_action} · save {fmtShort(aiKpis.topFinding.estimated_monthly_savings)}/mo</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-bold text-gray-600">Off</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Enable AI in Settings to get plain-English explanations, false positive detection, and confidence-rated recommendations.
            </p>
          </div>
        )}
      </Card>

      {/* ── 7. Top Spending Resource ────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Top Spender"
          icon={ArrowUpRight}
          iconClass="bg-blue-900/50 text-blue-400"
          tooltip="The single highest-cost resource this month, excluding infrastructure. Useful for quickly identifying where the most spend is concentrated."
        />
        {topSpender ? (
          <>
            <div className="mb-3">
              <p className="text-sm font-semibold text-white truncate leading-snug" title={topSpender.resource.resource_name}>
                {topSpender.resource.resource_name}
              </p>
              <p className="text-xs text-gray-600 truncate mt-0.5">
                {topSpender.resource.resource_type?.split('/').pop()} · {topSpender.resource.resource_group}
              </p>
            </div>
            <div className="flex items-end justify-between gap-2 mb-3">
              <div>
                <p className="text-3xl font-bold text-white tabular-nums leading-none">
                  {fmtShort(topSpender.resource.cost_current_month)}
                </p>
                <p className="text-xs text-gray-500 mt-1">this month</p>
              </div>
              {topSpender.momDelta != null && (
                <div className="text-right">
                  <p className={clsx('text-sm font-bold tabular-nums flex items-center gap-1 justify-end',
                    topSpender.momDelta > 5  ? 'text-red-400' :
                    topSpender.momDelta < -5 ? 'text-green-400' : 'text-gray-400'
                  )}>
                    {topSpender.momDelta > 0 ? <TrendingUp size={12} /> : topSpender.momDelta < 0 ? <TrendingDown size={12} /> : null}
                    {topSpender.momDelta > 0 ? '+' : ''}{topSpender.momDelta.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-600"
                     title={topSpender.isMtdDelta ? `vs same ${new Date().getDate()} days last month` : 'vs full last month'}>
                    {topSpender.isMtdDelta ? 'vs last mo. MTD' : 'vs last mo.'}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-700 shrink-0" />
                  {topSpender.isMtdDelta
                    ? `Last mo. MTD (day 1–${new Date().getDate()})`
                    : 'Last month'}
                </span>
                <span className="font-bold text-gray-400 tabular-nums">
                  {topSpender.isMtdDelta && topSpender.resource.cost_previous_month_mtd > 0
                    ? fmtShort(topSpender.resource.cost_previous_month_mtd)
                    : fmtShort(topSpender.resource.cost_previous_month)}
                </span>
              </div>
              {topSpender.rightsizeCount > 0 && (
                <div className="flex items-center justify-between text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-600 shrink-0" />Right-size opps
                  </span>
                  <span className="font-bold text-yellow-400 tabular-nums">{topSpender.rightsizeCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />Score
                </span>
                <span className={clsx('font-bold tabular-nums text-xs', {
                  'text-red-400':    topSpender.resource.score_label === 'Not Used',
                  'text-orange-400': topSpender.resource.score_label === 'Rarely Used',
                  'text-yellow-400': topSpender.resource.score_label === 'Actively Used',
                  'text-green-400':  topSpender.resource.score_label === 'Fully Used',
                  'text-gray-400':   topSpender.resource.score_label === 'Unknown',
                })}>
                  {topSpender.resource.score_label}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-2xl font-bold text-gray-600">—</p>
        )}
      </Card>

      {/* ── 8. Carbon Footprint ────────────────────────────────────────── */}
      <Card onClick={totalCarbon > 0 && onDrillDown ? () => onDrillDown('carbon') : undefined}>
        <CardHeader
          title="Carbon Footprint"
          icon={Leaf}
          iconClass="bg-green-900/50 text-green-500"
          tooltip="Estimated monthly CO₂ equivalent based on resource type and Azure region carbon intensity data."
        />
        {totalCarbon > 0 ? (
          <>
            <div className="flex items-end gap-3 mb-3">
              <p className="text-3xl font-bold text-white tabular-nums leading-none">{Math.round(totalCarbon)}</p>
              <p className="text-xs text-gray-500 mb-1">kg CO₂/month</p>
            </div>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">🌳 Tree equivalent</span>
                <span className="font-semibold text-green-600">{(totalCarbon / 21).toFixed(1)}/yr</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">✈️ Flight equivalent</span>
                <span className="font-semibold text-gray-500">{(totalCarbon / 255).toFixed(2)} LHR→JFK</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">📅 Annual total</span>
                <span className="font-semibold text-gray-400">{Math.round(totalCarbon * 12)} kg</span>
              </div>
            </div>
          </>
        ) : (
          <div>
            <p className="text-2xl font-bold text-gray-600 mb-2">—</p>
            <p className="text-xs text-gray-600">No carbon data available for current resources.</p>
          </div>
        )}
      </Card>

    </div>
  )
}
