import React, { useMemo, useState, useCallback } from 'react'
import clsx from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Brain, TrendingUp, TrendingDown, Minus, ExternalLink, AlertTriangle,
  Zap, AlertCircle, ChevronDown, ChevronUp, Tag,
} from 'lucide-react'
import { SCORE_STYLE } from '../scoreColors'

// ── AI resource type detection ─────────────────────────────────────────────────

const AI_TYPE_MAP = {
  'microsoft.cognitiveservices/accounts':           'Cognitive Services / OpenAI',
  'microsoft.machinelearningservices/workspaces':   'ML Workspace',
  'microsoft.search/searchservices':                'AI Search',
  'microsoft.botservice/botservices':               'Bot Service',
  'microsoft.documentintelligence/accounts':        'Document Intelligence',
  'microsoft.healthbot/healthbots':                 'Health Bot',
  'microsoft.synapse/workspaces':                   'Synapse',
  'microsoft.databricks/workspaces':                'Databricks',
}

const AI_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#818cf8', '#93c5fd', '#67e8f9', '#5eead4',
]

function isAIResource(resourceType) {
  const t = resourceType.toLowerCase()
  return Object.keys(AI_TYPE_MAP).some(p => t.startsWith(p))
}

function aiServiceLabel(resourceType) {
  const t = resourceType.toLowerCase()
  for (const [prefix, label] of Object.entries(AI_TYPE_MAP)) {
    if (t.startsWith(prefix)) return label
  }
  return resourceType.split('/').pop()
}

function fmt(n) {
  if (!n) return '$0'
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtDec(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtTokens(n) {
  if (n == null || n === 0) return null
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}
function fmtCalls(n) {
  if (n == null || n === 0) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, trend, accent = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-900/40 to-indigo-900/10 border-indigo-800/50',
    violet: 'from-violet-900/40 to-violet-900/10 border-violet-800/50',
    blue:   'from-blue-900/40   to-blue-900/10   border-blue-800/50',
    green:  'from-green-900/40  to-green-900/10  border-green-800/50',
  }
  return (
    <div className={clsx('rounded-xl border bg-gradient-to-br p-4', colors[accent])}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up'   && <TrendingUp   size={11} className="text-red-400" />}
          {trend === 'down' && <TrendingDown  size={11} className="text-green-400" />}
          {trend === 'flat' && <Minus         size={11} className="text-gray-500" />}
          <span className="text-xs text-gray-500">{sub}</span>
        </div>
      )}
    </div>
  )
}

// ── Bar chart tooltip ──────────────────────────────────────────────────────────

function BarTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">{d.name}</p>
      <p className="text-indigo-300">{fmtDec(d.cost)}/mo</p>
      <p className="text-gray-500">{d.count} resource{d.count !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Recommendations panel ──────────────────────────────────────────────────────

function RecommendationsPanel({ idleResources, throttledResources, commitmentCandidates }) {
  const [open, setOpen] = useState(true)
  const items = []

  idleResources.forEach(r => {
    items.push({
      icon:    <AlertCircle size={13} className="text-red-400 shrink-0" />,
      color:   'border-red-800/40 bg-red-900/10',
      title:   `Delete or pause "${r.resource_name}"`,
      body:    `${fmtDec(r.cost_current_month)}/mo with zero activity in 30 days. ${r.billing_type === 'ptu' ? 'PTU capacity is reserved — you pay even with no usage.' : 'No calls or tokens recorded.'}`,
      savings: r.cost_current_month,
    })
  })

  throttledResources.forEach(r => {
    const pct = ((r.blocked_calls / r.total_calls) * 100).toFixed(1)
    items.push({
      icon:    <Zap size={13} className="text-orange-400 shrink-0" />,
      color:   'border-orange-800/40 bg-orange-900/10',
      title:   `Increase quota for "${r.resource_name}"`,
      body:    `${pct}% of API calls are being throttled. Upgrade to a higher tier or request a quota increase in Azure Portal to prevent dropped requests.`,
      savings: null,
    })
  })

  commitmentCandidates.forEach(r => {
    items.push({
      icon:    <Tag size={13} className="text-blue-400 shrink-0" />,
      color:   'border-blue-800/40 bg-blue-900/10',
      title:   `Consider commitment tier for "${r.resource_name}"`,
      body:    `Spending ${fmtDec(r.cost_current_month)}/mo consistently on ${aiServiceLabel(r.resource_type)}. Commitment tiers (available for OpenAI, Speech, Language, Vision) can reduce cost by up to 40% vs pay-as-you-go.`,
      savings: r.cost_current_month * 0.35,
    })
  })

  if (items.length === 0) return null

  const totalSavings = items.reduce((s, i) => s + (i.savings || 0), 0)

  return (
    <div className="card">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-900/40">
            <Brain size={14} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Cost Recommendations</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {items.length} action{items.length !== 1 ? 's' : ''} identified
              {totalSavings > 0 && <span className="text-green-400 ml-1">· {fmt(totalSavings)}/mo potential savings</span>}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {items.map((item, i) => (
            <div key={i} className={clsx('rounded-lg border p-3 flex gap-3', item.color)}>
              <div className="mt-0.5">{item.icon}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.body}</p>
                {item.savings > 0 && (
                  <p className="text-xs text-green-400 font-semibold mt-1">
                    Est. savings: {fmtDec(item.savings)}/mo
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AIResourcesPanel({ resources = [], onResourceClick }) {
  const [sortCol, setSortCol] = useState('cost_current_month')
  const [expandedRows, setExpandedRows] = useState({})   // resource_id → true/false
  const [deployments,  setDeployments]  = useState({})   // resource_id → [] | null (null = loading)

  const isCogSvcAccount = r => r.resource_type.toLowerCase().startsWith('microsoft.cognitiveservices/accounts')

  const toggleExpand = useCallback(async (r) => {
    const id = r.resource_id
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
    if (!deployments[id] && !expandedRows[id]) {
      setDeployments(prev => ({ ...prev, [id]: null }))
      try {
        const params = new URLSearchParams({
          subscription_id: r.subscription_id,
          resource_group:  r.resource_group,
          account_name:    r.resource_name,
        })
        const res  = await fetch(`/api/openai-deployments?${params}`)
        const data = await res.json()
        setDeployments(prev => ({ ...prev, [id]: data }))
      } catch {
        setDeployments(prev => ({ ...prev, [id]: [] }))
      }
    }
  }, [deployments, expandedRows])
  const [sortDir, setSortDir] = useState('desc')

  const aiResources = useMemo(
    () => resources.filter(r => isAIResource(r.resource_type)),
    [resources],
  )

  const totalCurrent  = useMemo(() => aiResources.reduce((s, r) => s + (r.cost_current_month  || 0), 0), [aiResources])
  const totalPrevious = useMemo(() => aiResources.reduce((s, r) => s + (r.cost_previous_month || 0), 0), [aiResources])
  const momDelta      = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0
  const totalSavings  = useMemo(() => aiResources.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0), [aiResources])
  const totalTokens   = useMemo(() => {
    const sum = aiResources.reduce((s, r) => s + (r.total_tokens || 0), 0)
    return sum > 0 ? sum : null
  }, [aiResources])

  // Idle: has cost AND metrics were actually fetched (not null) AND both show zero activity
  const idleResources = useMemo(() =>
    aiResources.filter(r =>
      (r.cost_current_month || 0) > 5 &&
      r.total_calls  != null && r.total_calls  === 0 &&
      r.total_tokens != null && r.total_tokens === 0
    ), [aiResources])

  // Throttled: has blocked calls
  const throttledResources = useMemo(() =>
    aiResources.filter(r => (r.blocked_calls || 0) > 0),
    [aiResources])

  // Commitment candidates: consistent spend >$50/mo on pay-as-you-go (not PTU)
  const commitmentCandidates = useMemo(() =>
    aiResources.filter(r =>
      r.billing_type !== 'ptu' &&
      (r.cost_current_month || 0) >= 50 &&
      (r.cost_previous_month || 0) >= 50
    ), [aiResources])

  const byService = useMemo(() => {
    const map = {}
    for (const r of aiResources) {
      const label = aiServiceLabel(r.resource_type)
      if (!map[label]) map[label] = { name: label, cost: 0, count: 0 }
      map[label].cost  += r.cost_current_month  || 0
      map[label].count += 1
    }
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [aiResources])

  const sorted = useMemo(() => {
    return [...aiResources].sort((a, b) => {
      const av = a[sortCol] ?? 0
      const bv = b[sortCol] ?? 0
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [aiResources, sortCol, sortDir])

  function toggleSort(col) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  if (aiResources.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-indigo-900/30 flex items-center justify-center">
          <Brain size={22} className="text-indigo-400" />
        </div>
        <p className="text-gray-400 font-medium">No AI resources found</p>
        <p className="text-xs text-gray-500 max-w-xs">
          Azure AI resources (Cognitive Services, OpenAI, ML Workspaces, AI Search, etc.) will appear here once detected.
        </p>
      </div>
    )
  }

  const trendDir = momDelta > 5 ? 'up' : momDelta < -5 ? 'down' : 'flat'

  return (
    <div className="space-y-5">

      {/* ── Recommendations ── */}
      <RecommendationsPanel
        idleResources={idleResources}
        throttledResources={throttledResources}
        commitmentCandidates={commitmentCandidates}
      />

      {/* ── Hero KPI card ── */}
      <div className="rounded-2xl border border-indigo-700/40 bg-gradient-to-br from-indigo-950/60 to-gray-900 p-6 flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-indigo-900/60 border border-indigo-700/50 flex items-center justify-center shrink-0">
          <Brain size={26} className="text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Azure AI Spend This Month</p>
          <p className="text-4xl font-bold text-white tabular-nums">{fmt(totalCurrent)}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {trendDir === 'up'   && <TrendingUp   size={13} className="text-red-400" />}
            {trendDir === 'down' && <TrendingDown  size={13} className="text-green-400" />}
            {trendDir === 'flat' && <Minus         size={13} className="text-gray-500" />}
            <span className={clsx('text-sm font-medium', trendDir === 'up' ? 'text-red-400' : trendDir === 'down' ? 'text-green-400' : 'text-gray-500')}>
              {momDelta >= 0 ? '+' : ''}{momDelta.toFixed(1)}% vs last month
            </span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-500 text-xs">{fmt(totalCurrent * 12)} projected annually</span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-500 text-xs">{aiResources.length} resource{aiResources.length !== 1 ? 's' : ''} across {byService.length} service{byService.length !== 1 ? 's' : ''}</span>
            {idleResources.length > 0 && (
              <>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-red-400 text-xs font-medium">{idleResources.length} idle</span>
              </>
            )}
          </div>
        </div>
        {totalSavings > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500 mb-0.5">Potential savings</p>
            <p className="text-xl font-bold text-green-400">{fmt(totalSavings)}<span className="text-sm font-normal text-gray-500">/mo</span></p>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI
          label="AI Spend / Month"
          value={fmt(totalCurrent)}
          sub={`${momDelta >= 0 ? '+' : ''}${momDelta.toFixed(1)}% vs last month`}
          trend={trendDir}
          accent="indigo"
        />
        <KPI
          label="Projected Annual"
          value={fmt(totalCurrent * 12)}
          sub="at current rate"
          accent="violet"
        />
        <KPI
          label="Tokens (30 days)"
          value={totalTokens ? fmtTokens(totalTokens) : '—'}
          sub={totalTokens ? 'prompt + completion' : 'no token data'}
          accent="blue"
        />
        <KPI
          label="Idle Resources"
          value={idleResources.length || '—'}
          sub={idleResources.length > 0 ? `${fmt(idleResources.reduce((s,r) => s+(r.cost_current_month||0),0))}/mo wasted` : 'none detected'}
          trend={idleResources.length > 0 ? 'up' : 'flat'}
          accent={idleResources.length > 0 ? 'indigo' : 'blue'}
        />
      </div>

      {/* Spend by service */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
          Spend by Service Type
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byService} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 11 }} axisLine={false} tickLine={false} width={160} />
            <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {byService.map((_, i) => (
                <Cell key={i} fill={AI_COLORS[i % AI_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resource table */}
      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
          AI Resource Breakdown
        </h3>
        <table className="w-full text-left" style={{ minWidth: '900px' }}>
          <thead>
            <tr className="border-b border-gray-800">
              {[
                { key: 'resource_name',             label: 'Resource'      },
                { key: 'resource_type',             label: 'Service'       },
                { key: 'resource_group',            label: 'Group'         },
                { key: 'cost_current_month',        label: 'Cost / Mo'     },
                { key: 'total_tokens',              label: 'Tokens (30d)'  },
                { key: 'total_calls',               label: 'Calls (30d)'   },
                { key: 'estimated_monthly_savings', label: 'Est. Savings'  },
                { key: 'score_label',               label: 'Status'        },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
                >
                  {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {sorted.map(r => {
              const isIdle       = idleResources.includes(r)
              const isCommitment = commitmentCandidates.includes(r)
              const isCogSvc     = r.resource_type.toLowerCase().startsWith('microsoft.cognitiveservices/accounts')
              const isExpanded   = !!expandedRows[r.resource_id]
              const deps         = deployments[r.resource_id]
              const momPct = r.cost_previous_month > 0
                ? ((r.cost_current_month - r.cost_previous_month) / r.cost_previous_month) * 100
                : null
              const costPer1kTokens = (isCogSvc && r.total_tokens > 0)
                ? (r.cost_current_month / r.total_tokens) * 1000 : null
              const throttlePct = (isCogSvc && r.total_calls > 0 && r.blocked_calls > 0)
                ? (r.blocked_calls / r.total_calls) * 100 : null

              return (
                <React.Fragment key={r.resource_id}>
                  <tr onClick={() => onResourceClick?.(r)} className={clsx('transition-colors', isIdle && 'bg-red-950/10', onResourceClick ? 'cursor-pointer hover:bg-gray-700/40' : 'hover:bg-gray-800/30')}>
                    {/* Resource name */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {isCogSvc && (
                          <button onClick={e => { e.stopPropagation(); toggleExpand(r) }}
                            className="text-gray-500 hover:text-indigo-400 transition-colors shrink-0">
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                        {isIdle && <AlertCircle size={11} className="text-red-400 shrink-0" title="Idle — no activity in 30 days" />}
                        {!isIdle && r.is_anomaly && <AlertTriangle size={11} className="text-orange-400 shrink-0" />}
                        <span className="text-sm font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {r.sku && <p className="text-xs text-gray-600">{r.sku}</p>}
                        {r.billing_type === 'ptu' && <span className="text-xs px-1 py-0 rounded bg-violet-900/40 text-violet-300 border border-violet-800/40 font-medium">PTU</span>}
                        {isIdle && <span className="text-xs px-1 py-0 rounded bg-red-900/40 text-red-400 border border-red-800/40 font-medium">Idle</span>}
                        {isCommitment && <span className="text-xs px-1 py-0 rounded bg-blue-900/40 text-blue-300 border border-blue-800/40 font-medium">Commitment tier available</span>}
                      </div>
                    </td>
                    {/* Service type */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-800/40 px-2 py-0.5 rounded-md">
                        {aiServiceLabel(r.resource_type)}
                      </span>
                    </td>
                    {/* Resource group */}
                    <td className="px-3 py-3 text-xs text-gray-400 truncate max-w-[120px]">{r.resource_group}</td>
                    {/* Cost */}
                    <td className="px-3 py-3">
                      <p className="text-sm font-semibold text-white tabular-nums">{fmtDec(r.cost_current_month)}</p>
                      {momPct !== null && <p className={clsx('text-xs tabular-nums', momPct > 0 ? 'text-red-400' : 'text-green-400')}>{momPct >= 0 ? '+' : ''}{momPct.toFixed(1)}%</p>}
                      {costPer1kTokens != null && <p className="text-xs text-gray-500 tabular-nums">${costPer1kTokens.toFixed(4)}/1K tok</p>}
                    </td>
                    {/* Tokens */}
                    <td className="px-3 py-3">
                      {fmtTokens(r.total_tokens) ? (
                        <div>
                          <p className="text-sm font-semibold text-white tabular-nums">{fmtTokens(r.total_tokens)}</p>
                          {r.prompt_tokens != null && r.completion_tokens != null && (
                            <p className="text-xs text-gray-500 tabular-nums">{fmtTokens(r.prompt_tokens)}↑ {fmtTokens(r.completion_tokens)}↓</p>
                          )}
                        </div>
                      ) : <span className="text-gray-600 text-sm">—</span>}
                    </td>
                    {/* Calls */}
                    <td className="px-3 py-3">
                      {fmtCalls(r.total_calls) ? (
                        <div>
                          <p className="text-sm text-white tabular-nums">{fmtCalls(r.total_calls)}</p>
                          {throttlePct !== null && <p className="text-xs text-orange-400 flex items-center gap-0.5"><Zap size={9} className="shrink-0" />{throttlePct.toFixed(1)}% throttled</p>}
                        </div>
                      ) : <span className="text-gray-600 text-sm">—</span>}
                    </td>
                    {/* Savings */}
                    <td className="px-3 py-3">
                      {r.estimated_monthly_savings > 0
                        ? <span className="text-sm font-semibold text-green-400 tabular-nums">{fmtDec(r.estimated_monthly_savings)}</span>
                        : <span className="text-gray-700 text-sm">—</span>}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-3">
                      {(() => { const s = SCORE_STYLE[r.score_label] ?? SCORE_STYLE['Unknown']; return <span className={clsx('text-xs px-2 py-0.5 rounded-md border font-medium', s.bg, s.text, s.border)}>{r.score_label}</span> })()}
                    </td>
                    {/* Portal */}
                    <td className="px-3 py-3">
                      {r.portal_url && <a href={r.portal_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-600 hover:text-blue-400 transition-colors"><ExternalLink size={13} /></a>}
                    </td>
                  </tr>

                  {/* ── Deployment sub-rows ── */}
                  {isExpanded && (
                    <tr className="bg-indigo-950/40 border-l-2 border-indigo-500/50">
                      <td colSpan={9} className="px-6 py-4">
                        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
                          Deployments on {r.resource_name}
                        </p>
                        {deps === null ? (
                          <p className="text-xs text-gray-500">Loading deployments…</p>
                        ) : deps.length === 0 ? (
                          <p className="text-xs text-gray-500">No deployments found for this account.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 uppercase tracking-wider border-b border-indigo-800/40">
                                <th className="pb-2 pr-4 text-left font-semibold">Deployment</th>
                                <th className="pb-2 pr-4 text-left font-semibold">Model</th>
                                <th className="pb-2 pr-4 text-left font-semibold">Version</th>
                                <th className="pb-2 pr-4 text-left font-semibold">SKU</th>
                                <th className="pb-2 pr-4 text-left font-semibold">Capacity (K TPM)</th>
                                <th className="pb-2 text-left font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-indigo-900/30">
                              {deps.map(d => (
                                <tr key={d.name} className="hover:bg-indigo-900/20 transition-colors">
                                  <td className="py-2 pr-4 font-semibold text-white">{d.name}</td>
                                  <td className="py-2 pr-4 text-indigo-300 font-medium">{d.model || '—'}</td>
                                  <td className="py-2 pr-4 text-gray-400 font-mono">{d.version || '—'}</td>
                                  <td className="py-2 pr-4 text-gray-300">{d.sku || '—'}</td>
                                  <td className="py-2 pr-4 tabular-nums text-gray-300">{d.capacity != null ? d.capacity.toLocaleString() : '—'}</td>
                                  <td className="py-2">
                                    <span className={clsx('px-2 py-0.5 rounded text-xs border font-medium',
                                      d.state === 'Succeeded' ? 'bg-green-900/30 border-green-700/40 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'
                                    )}>{d.state || '—'}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
