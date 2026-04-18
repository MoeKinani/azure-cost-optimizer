import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  HardDrive, AlertTriangle, CheckCircle, ExternalLink,
  ChevronDown, ChevronUp, Shield, RefreshCw, Archive,
  TrendingDown, Database, XCircle, Info,
} from 'lucide-react'
import { SCORE_STYLE } from '../scoreColors'

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Number(n).toFixed(2)}`
}
function fmtGb(n) {
  if (n === null || n === undefined || n === 0) return '—'
  if (n >= 1024) return `${(n / 1024).toFixed(1)} TB`
  return `${Number(n).toFixed(0)} GB`
}
function fmtDays(n) {
  if (n === null || n === undefined) return '—'
  return `${n}d`
}

// ── Resource type filter ───────────────────────────────────────────────────────

const STORAGE_TYPE = 'microsoft.storage/storageaccounts'
function isStorage(r) { return (r.resource_type || '').toLowerCase() === STORAGE_TYPE }

// ── SKU / redundancy helpers ───────────────────────────────────────────────────

const REDUNDANCY_LABELS = {
  lrs:    { label: 'LRS',     title: 'Locally Redundant',       color: 'text-gray-400'  },
  zrs:    { label: 'ZRS',     title: 'Zone Redundant',          color: 'text-blue-400'  },
  grs:    { label: 'GRS',     title: 'Geo-Redundant',           color: 'text-purple-400'},
  ragrs:  { label: 'RA-GRS',  title: 'Read-Access Geo-Redundant', color: 'text-purple-400'},
  gzrs:   { label: 'GZRS',   title: 'Geo-Zone Redundant',      color: 'text-purple-400'},
  ragzrs: { label: 'RA-GZRS', title: 'Read-Access GZRS',       color: 'text-purple-400'},
}

function parseRedundancy(sku) {
  if (!sku) return null
  const key = sku.toLowerCase().split('_').pop()
  return REDUNDANCY_LABELS[key] || null
}

function isGeoRedundant(sku) {
  if (!sku) return false
  const key = sku.toLowerCase()
  return key.includes('grs') || key.includes('gzrs')
}

// ── Score badge ────────────────────────────────────────────────────────────────

function ScoreBadge({ label }) {
  const s = SCORE_STYLE[label] || SCORE_STYLE['Unknown']
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap',
      s.bg, s.text, s.border,
    )}>
      {label || 'Unknown'}
    </span>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon, tooltip }) {
  const [showTip, setShowTip] = useState(false)
  const border = {
    blue:   'border-l-2 border-l-blue-500/60',
    red:    'border-l-2 border-l-red-500/60',
    green:  'border-l-2 border-l-green-500/60',
    orange: 'border-l-2 border-l-orange-500/60',
    purple: 'border-l-2 border-l-purple-500/60',
    gray:   'border-l-2 border-l-gray-600/60',
  }[accent] || ''
  return (
    <div className={clsx('card flex flex-col gap-1', border)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
          {tooltip && (
            <div className="relative inline-flex">
              <button
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
                className="text-gray-700 hover:text-gray-400 transition-colors"
              >
                <Info size={11} />
              </button>
              {showTip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-2.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 shadow-xl leading-relaxed pointer-events-none">
                  {tooltip}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700" />
                </div>
              )}
            </div>
          )}
        </div>
        {Icon && <div className="p-1.5 rounded-lg bg-gray-800"><Icon size={13} className="text-gray-400" /></div>}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Usage bar ──────────────────────────────────────────────────────────────────

function UsageBar({ pct: value }) {
  const color = value == null ? 'bg-gray-700'
    : value > 70 ? 'bg-green-500'
    : value > 20 ? 'bg-yellow-500'
    : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div style={{ width: `${Math.min(100, value ?? 0)}%` }} className={clsx('h-full rounded-full', color)} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-10 text-right shrink-0">
        {value != null ? `${value.toFixed(0)}%` : '—'}
      </span>
    </div>
  )
}

// ── Idle Confirmed section ─────────────────────────────────────────────────────
// last_access_tracking enabled + idle_confirmed = no reads/writes detected

function IdleConfirmed({ accounts, onResourceClick }) {
  const [showAll, setShowAll] = useState(false)
  const list = accounts
    .filter(r => r.idle_confirmed)
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (list.length === 0) return null
  const shown = showAll ? list : list.slice(0, 8)

  return (
    <div className="card border border-red-900/30">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-red-900/40">
          <XCircle size={15} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Confirmed Idle</h3>
          <p className="text-xs text-gray-500">
            Last-access tracking enabled with zero reads or writes detected — safe delete candidates.
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-red-900/40 border border-red-700/50 text-xs text-red-400 font-semibold shrink-0">
          {list.length} account{list.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left text-xs" style={{ minWidth: 600 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              {['Account', 'Redundancy', 'Days Idle', 'Capacity Used', 'Cost / Mo', 'Savings', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {shown.map(r => {
              const red = parseRedundancy(r.sku)
              return (
                <tr key={r.resource_id} onClick={() => onResourceClick?.(r)} className={clsx('transition-colors', onResourceClick ? 'cursor-pointer hover:bg-gray-700/40' : 'hover:bg-gray-800/30')}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-white truncate max-w-[200px]" title={r.resource_name}>{r.resource_name}</p>
                    <p className="text-gray-600">{r.resource_group}</p>
                  </td>
                  <td className="px-3 py-3">
                    {red
                      ? <span className={clsx('font-mono text-xs font-semibold', red.color)} title={red.title}>{red.label}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    <span className={clsx('font-semibold', (r.days_since_active ?? 0) > 60 ? 'text-red-400' : 'text-orange-400')}>
                      {fmtDays(r.days_since_active)}
                    </span>
                  </td>
                  <td className="px-3 py-3 w-36">
                    <UsageBar pct={r.primary_utilization_pct} />
                  </td>
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
              )
            })}
          </tbody>
        </table>
      </div>

      {list.length > 8 && (
        <button onClick={() => setShowAll(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {list.length} idle accounts</>}
        </button>
      )}
    </div>
  )
}

// ── Rarely Used section ────────────────────────────────────────────────────────
// Rarely Used or Not Used, NOT idle_confirmed (no tracking = suspicious but unconfirmed)

function RarelyUsed({ accounts, onResourceClick }) {
  const [showAll, setShowAll] = useState(false)
  const list = accounts
    .filter(r => !r.idle_confirmed && (r.score_label === 'Not Used' || r.score_label === 'Rarely Used'))
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (list.length === 0) return null
  const shown = showAll ? list : list.slice(0, 8)

  return (
    <div className="card border border-orange-900/30">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-orange-900/40">
          <AlertTriangle size={15} className="text-orange-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Likely / Confirmed Waste</h3>
          <p className="text-xs text-gray-500">
            Low or no activity detected. Enable last-access tracking to confirm before actioning.
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-900/40 border border-orange-700/50 text-xs text-orange-400 font-semibold shrink-0">
          {list.length} account{list.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left text-xs" style={{ minWidth: 680 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              {['Account', 'Score', 'Redundancy', 'Days Since Active', 'Tracking', 'Lifecycle Policy', 'Cost / Mo', 'Savings', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {shown.map(r => {
              const red = parseRedundancy(r.sku)
              return (
                <tr key={r.resource_id} onClick={() => onResourceClick?.(r)} className={clsx('transition-colors', onResourceClick ? 'cursor-pointer hover:bg-gray-700/40' : 'hover:bg-gray-800/30')}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</p>
                    <p className="text-gray-600">{r.resource_group}</p>
                  </td>
                  <td className="px-3 py-3"><ScoreBadge label={r.score_label} /></td>
                  <td className="px-3 py-3">
                    {red
                      ? <span className={clsx('font-mono text-xs font-semibold', red.color)} title={red.title}>{red.label}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {r.days_since_active != null
                      ? <span className={clsx((r.days_since_active ?? 0) > 30 ? 'text-orange-400' : 'text-gray-400')}>
                          {fmtDays(r.days_since_active)}
                        </span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {r.storage_last_access_tracking
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle size={10} /> On</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-gray-600"><XCircle size={10} /> Off</span>}
                  </td>
                  <td className="px-3 py-3">
                    {r.storage_has_lifecycle_policy
                      ? <span className="inline-flex items-center gap-1 text-xs text-sky-400"><CheckCircle size={10} /> Yes</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-gray-600"><XCircle size={10} /> None</span>}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-white">{fmt(r.cost_current_month)}</td>
                  <td className="px-3 py-3 tabular-nums text-green-400 font-semibold">
                    {r.estimated_monthly_savings > 0 ? fmt(r.estimated_monthly_savings) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {r.portal_url && (
                      <a href={r.portal_url} target="_blank" rel="noreferrer"
                        className="text-gray-600 hover:text-blue-400 transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {list.length > 8 && (
        <button onClick={() => setShowAll(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {list.length} accounts</>}
        </button>
      )}

      <div className="mt-3 px-3 py-2.5 rounded-lg bg-orange-950/30 border border-orange-900/40 text-xs text-orange-300/80 leading-relaxed">
        <strong>Next step:</strong> Enable last-access time tracking on these accounts.
        Once enabled, Azure records when each blob was last read — after 30 days of zero reads the account is confirmed unused and safe to delete.
        Portal path: Storage account → Data management → Lifecycle management → Enable blob last access time tracking.
      </div>
    </div>
  )
}

// ── Redundancy Downgrade Opportunities ────────────────────────────────────────
// GRS / RA-GRS accounts that are low activity → downgrade to LRS saves ~50%

function RedundancyDowngrade({ accounts }) {
  const candidates = accounts
    .filter(r => isGeoRedundant(r.sku) && (r.score_label === 'Rarely Used' || r.score_label === 'Not Used' || !r.has_any_activity))
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (candidates.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-purple-900/40">
          <TrendingDown size={15} className="text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Redundancy Downgrade Opportunities</h3>
          <p className="text-xs text-gray-500">
            GRS / RA-GRS accounts with low activity. Switching to LRS cuts storage cost by ~50% for non-critical data.
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-700/50 text-xs text-purple-400 font-semibold shrink-0">
          {candidates.length} account{candidates.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {candidates.map(r => {
          const red = parseRedundancy(r.sku)
          const estimatedSaving = (r.cost_current_month || 0) * 0.5
          return (
            <div key={r.resource_id}
              className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm truncate" title={r.resource_name}>{r.resource_name}</p>
                <p className="text-xs text-gray-600">{r.resource_group}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx('px-2 py-0.5 rounded font-mono text-xs font-semibold', red?.color || 'text-gray-400')}>
                  {red?.label || r.sku}
                </span>
                <span className="text-gray-600 text-xs">→</span>
                <span className="px-2 py-0.5 rounded bg-green-900/40 text-green-400 font-mono text-xs font-semibold">LRS</span>
              </div>
              <ScoreBadge label={r.score_label} />
              <div className="text-right shrink-0">
                <p className="font-semibold text-green-400 text-sm tabular-nums">~{fmt(estimatedSaving)}/mo</p>
                <p className="text-xs text-gray-600">~50% reduction</p>
              </div>
              {r.portal_url && (
                <a href={r.portal_url} target="_blank" rel="noreferrer"
                  className="shrink-0 text-xs text-gray-600 hover:text-blue-400 transition-colors">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 px-3 py-2.5 rounded-lg bg-purple-950/30 border border-purple-900/40 text-xs text-purple-300/80 leading-relaxed">
        <strong>Before downgrading:</strong> Confirm the data does not require cross-region disaster recovery.
        LRS keeps 3 copies within a single datacenter — if a regional outage occurs, data could be lost.
        Only downgrade dev, test, or archival storage where cross-region replication is not a compliance requirement.
      </div>
    </div>
  )
}

// ── No Lifecycle Policy section ────────────────────────────────────────────────

function NoLifecyclePolicy({ accounts }) {
  const [showAll, setShowAll] = useState(false)
  // Only surface accounts that have some cost and are not fully healthy
  const list = accounts
    .filter(r => !r.storage_has_lifecycle_policy && r.cost_current_month > 0 && r.score_label !== 'Fully Used')
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (list.length === 0) return null
  const shown = showAll ? list : list.slice(0, 6)

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-amber-900/40">
          <Archive size={15} className="text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">No Lifecycle Policy</h3>
          <p className="text-xs text-gray-500">
            Accounts without automated tiering rules. Old blobs stay on Hot tier indefinitely — adding a policy can cut storage costs 40–80%.
          </p>
        </div>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/50 text-xs text-amber-400 font-semibold shrink-0">
          {list.length} account{list.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {shown.map(r => {
          const red = parseRedundancy(r.sku)
          return (
            <div key={r.resource_id}
              className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm truncate" title={r.resource_name}>{r.resource_name}</p>
                <p className="text-xs text-gray-600">{r.resource_group}</p>
              </div>
              {red && <span className={clsx('font-mono text-xs font-semibold shrink-0', red.color)}>{red.label}</span>}
              <ScoreBadge label={r.score_label} />
              <p className="text-sm font-semibold text-white tabular-nums shrink-0">{fmt(r.cost_current_month)}/mo</p>
              <a href={`https://portal.azure.com/#resource${r.resource_id}/lifecycleManagement`}
                target="_blank" rel="noreferrer"
                className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-300 transition-colors"
                title="Configure lifecycle policy in Azure Portal">
                <RefreshCw size={10} /> Add policy
              </a>
              {r.portal_url && (
                <a href={r.portal_url} target="_blank" rel="noreferrer"
                  className="shrink-0 text-xs text-gray-600 hover:text-blue-400 transition-colors">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )
        })}
      </div>

      {list.length > 6 && (
        <button onClick={() => setShowAll(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {list.length} accounts</>}
        </button>
      )}

      <div className="mt-3 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-900/40 text-xs text-amber-300/80 leading-relaxed">
        <strong>Recommended policy rules:</strong> Move blobs not accessed in 30 days → Cool tier (saves ~50%).
        Move blobs not accessed in 90 days → Archive tier (saves ~80%). Delete blobs not accessed in 365 days if retention policy allows.
      </div>
    </div>
  )
}

// ── Full inventory table ───────────────────────────────────────────────────────

const SORT_COLS = [
  { key: 'resource_name',        label: 'Account'         },
  { key: 'sku',                  label: 'Redundancy'      },
  { key: 'primary_utilization_pct', label: 'Capacity %'  },
  { key: 'days_since_active',    label: 'Days Since Active'},
  { key: 'cost_current_month',   label: 'Cost / Mo'       },
  { key: 'estimated_monthly_savings', label: 'Savings'   },
  { key: 'score_label',          label: 'Score'           },
]

function AllStorageTable({ accounts, onResourceClick }) {
  const [sortCol, setSortCol] = useState('cost_current_month')
  const [sortDir, setSortDir] = useState('desc')
  const [showAll, setShowAll] = useState(false)

  const sorted = useMemo(() => {
    return [...accounts].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [accounts, sortCol, sortDir])

  const shown = showAll ? sorted : sorted.slice(0, 15)

  function toggleSort(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-gray-800">
          <Database size={15} className="text-gray-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">All Storage Accounts</h3>
          <p className="text-xs text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''} across all subscriptions</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800/80">
        <table className="w-full text-left text-xs" style={{ minWidth: 860 }}>
          <thead>
            <tr className="bg-gray-800/70 border-b border-gray-700/60">
              {SORT_COLS.map(c => (
                <th key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-gray-200 select-none">
                  {c.label}<SortIcon col={c.key} />
                </th>
              ))}
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Signals</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {shown.map(r => {
              const red = parseRedundancy(r.sku)
              return (
                <tr key={r.resource_id} onClick={() => onResourceClick?.(r)} className={clsx('transition-colors', onResourceClick ? 'cursor-pointer hover:bg-gray-700/40' : 'hover:bg-gray-800/30')}>
                  {/* Account */}
                  <td className="px-3 py-3">
                    <p className="font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</p>
                    <p className="text-gray-600">{r.resource_group}</p>
                  </td>

                  {/* Redundancy */}
                  <td className="px-3 py-3">
                    {red
                      ? <span className={clsx('font-mono font-semibold', red.color)} title={red.title}>{red.label}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>

                  {/* Capacity */}
                  <td className="px-3 py-3 w-36">
                    <UsageBar pct={r.primary_utilization_pct} />
                  </td>

                  {/* Days since active */}
                  <td className="px-3 py-3 tabular-nums">
                    {r.days_since_active != null
                      ? <span className={clsx((r.days_since_active ?? 0) > 30 ? 'text-orange-400' : 'text-gray-400')}>
                          {fmtDays(r.days_since_active)}
                        </span>
                      : <span className="text-gray-600">—</span>}
                  </td>

                  {/* Cost */}
                  <td className="px-3 py-3 tabular-nums">
                    <p className="font-semibold text-white">{fmt(r.cost_current_month)}</p>
                    {r.cost_previous_month > 0 && (
                      <p className="text-gray-600">{fmt(r.cost_previous_month)} last mo</p>
                    )}
                  </td>

                  {/* Savings */}
                  <td className="px-3 py-3 tabular-nums">
                    {r.estimated_monthly_savings > 0
                      ? <span className="font-semibold text-green-400">{fmt(r.estimated_monthly_savings)}</span>
                      : <span className="text-gray-700">—</span>}
                  </td>

                  {/* Score */}
                  <td className="px-3 py-3"><ScoreBadge label={r.score_label} /></td>

                  {/* Signals */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      {r.idle_confirmed && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-900/30 text-red-400 border border-red-800/40 whitespace-nowrap">
                          <XCircle size={9} /> Idle confirmed
                        </span>
                      )}
                      {r.storage_has_lifecycle_policy && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-sky-900/30 text-sky-400 border border-sky-800/40 whitespace-nowrap">
                          <Shield size={9} /> Lifecycle policy
                        </span>
                      )}
                      {r.storage_last_access_tracking && !r.idle_confirmed && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-900/30 text-green-400 border border-green-800/40 whitespace-nowrap">
                          <CheckCircle size={9} /> Tracking on
                        </span>
                      )}
                      {!r.storage_last_access_tracking && !r.storage_has_lifecycle_policy && !r.idle_confirmed && (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </div>
                  </td>

                  {/* Portal */}
                  <td className="px-3 py-3">
                    {r.portal_url && (
                      <a href={r.portal_url} target="_blank" rel="noreferrer"
                        className="text-gray-600 hover:text-blue-400 transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > 15 && (
        <button onClick={() => setShowAll(v => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showAll
            ? <><ChevronUp size={12} /> Show less</>
            : <><ChevronDown size={12} /> Show all {sorted.length} accounts</>}
        </button>
      )}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function StoragePanel({ resources, onResourceClick }) {
  const accounts = useMemo(() => resources.filter(isStorage), [resources])

  const totalCost     = accounts.reduce((s, r) => s + (r.cost_current_month || 0), 0)
  const totalSavings  = accounts.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0)
  const idleConfirmed = accounts.filter(r => r.idle_confirmed).length
  const noTracking    = accounts.filter(r => !r.storage_last_access_tracking).length
  const noPolicy      = accounts.filter(r => !r.storage_has_lifecycle_policy && r.cost_current_month > 0).length

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <HardDrive size={40} className="text-gray-700 mb-4" />
        <p className="text-gray-400 font-medium">No storage accounts found</p>
        <p className="text-gray-600 text-sm mt-1">Storage accounts will appear here once a scan completes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Storage Accounts"  value={accounts.length}   sub="across all subscriptions"          accent="blue"   icon={HardDrive}    />
        <KpiCard label="Monthly Cost"      value={fmt(totalCost)}    sub="current billing period"            accent="purple" icon={Database}     />
        <KpiCard label="Idle Confirmed"    value={idleConfirmed}     sub="zero reads — safe delete candidates" accent="red"  icon={XCircle}      />
        <KpiCard label="No Access Tracking" value={noTracking}       sub="blind spots — enable to confirm"   accent="orange" icon={AlertTriangle}
          tooltip="Azure blob last-access tracking is not enabled on these accounts. Without it, the tool cannot confirm whether they are idle or actively used. Enable it under Data Management → Lifecycle Management in the Azure Portal, then rescan to get a confident idle/delete recommendation." />
        <KpiCard label="Potential Savings" value={fmt(totalSavings)} sub={`${fmt(totalSavings * 12)}/yr projected`} accent="green" icon={TrendingDown} />
      </div>

      {/* Actionable sections */}
      <IdleConfirmed    accounts={accounts} onResourceClick={onResourceClick} />
      <RarelyUsed       accounts={accounts} onResourceClick={onResourceClick} />
      <RedundancyDowngrade accounts={accounts} />
      <NoLifecyclePolicy   accounts={accounts} />

      {/* Full inventory */}
      <AllStorageTable accounts={accounts} onResourceClick={onResourceClick} />
    </div>
  )
}
