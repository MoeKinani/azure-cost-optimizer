import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Tag, ChevronDown, ChevronUp, ExternalLink, Info,
  CheckCircle, TrendingDown, Zap, BarChart2,
} from 'lucide-react'
import { SCORE_HEX, SCORE_HEX_DEFAULT } from '../scoreColors'

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${Number(n).toFixed(2)}`
}
function fmtFull(n) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── RI metadata by resource type ───────────────────────────────────────────────

const RI_META = {
  // Confirmed available in Azure Portal → Purchase Reservations
  'microsoft.compute/virtualmachines':             { label: 'Virtual Machines',       rate1: 0.37, rate3: 0.57, icon: '🖥️', note: 'Azure VM Reserved Instances offer up to 72% savings over pay-as-you-go. A single RI covers any VM of the same family and size in the same region. To purchase: Azure Portal → Reservations → + Add → Virtual machine.' },
  'microsoft.sql/servers/databases':               { label: 'SQL Database',           rate1: 0.33, rate3: 0.44, icon: '🗄️', note: 'Only vCore-based SQL databases qualify — DTU-based tiers (Basic, Standard, Premium) do not. The reservation applies per vCore. To purchase: Azure Portal → Reservations → + Add → SQL Database and SQL Managed Instance.' },
  'microsoft.sql/managedinstances':                { label: 'SQL Managed Instance',   rate1: 0.33, rate3: 0.55, icon: '🗄️', note: 'General Purpose and Business Critical tiers are both eligible. Reserved capacity is priced per vCore. To purchase: Azure Portal → Reservations → + Add → SQL Database and SQL Managed Instance.' },
  'microsoft.sql/servers/elasticpools':            { label: 'SQL Elastic Pool',       rate1: 0.33, rate3: 0.44, icon: '🗄️', note: 'vCore elastic pools support reserved capacity. DTU-based pools do not. Reserve based on the maximum vCore limit configured for the pool.' },
  'microsoft.web/serverfarms':                     { label: 'App Service Plans',      rate1: 0.35, rate3: 0.55, icon: '🌐', note: 'Premium v2 (P1v2+), Premium v3 (P1v3+), and Isolated tiers support reserved capacity. Basic and Standard tiers are not eligible. To purchase: Azure Portal → Reservations → + Add → App Services.' },
  'microsoft.cache/redis':                         { label: 'Azure Cache for Redis',  rate1: 0.37, rate3: 0.55, icon: '⚡', note: 'Standard and Premium tiers support reserved capacity. Basic tier is not eligible. Reserve by cache size and region. To purchase: Azure Portal → Reservations → + Add → Azure Cache for Redis and Managed Redis.' },
  'microsoft.cache/redisenterprise':               { label: 'Redis Enterprise',       rate1: 0.37, rate3: 0.55, icon: '⚡', note: 'All Redis Enterprise tiers are eligible for reserved capacity. To purchase: Azure Portal → Reservations → + Add → Azure Cache for Redis and Managed Redis.' },
  'microsoft.documentdb/databaseaccounts':         { label: 'Cosmos DB',              rate1: 0.24, rate3: 0.48, icon: '🌍', note: 'Reservations apply to provisioned throughput (RU/s) only. Serverless accounts are not eligible. To purchase: Azure Portal → Reservations → + Add → Azure Cosmos DB.' },
  'microsoft.dbforpostgresql/flexibleservers':     { label: 'PostgreSQL Flexible',    rate1: 0.33, rate3: 0.50, icon: '🐘', note: 'Azure Database for PostgreSQL Flexible Server is eligible for reserved compute capacity. To purchase: Azure Portal → Reservations → + Add → Azure Database for PostgreSQL.' },
  'microsoft.dbformysql/flexibleservers':          { label: 'MySQL Flexible',         rate1: 0.33, rate3: 0.50, icon: '🐬', note: 'Azure Database for MySQL Flexible Server is eligible for reserved compute capacity. To purchase: Azure Portal → Reservations → + Add → Azure Database for MySQL.' },
  'microsoft.databricks/workspaces':               { label: 'Databricks',             rate1: 0.40, rate3: 0.60, icon: '⚙️', note: 'Azure Databricks Pre-Purchase Plan covers DBU usage for job and all-purpose clusters. Applied automatically to matching usage during the commitment period. To purchase: Azure Portal → Reservations → + Add → Azure Databricks Pre-Purchase Plan.' },
  'microsoft.synapse/workspaces':                  { label: 'Synapse Analytics',      rate1: 0.40, rate3: 0.60, icon: '📊', note: 'Dedicated SQL pools (formerly SQL DW) support reserved data warehousing units (DWUs). Serverless and Spark pools are not eligible. To purchase: Azure Portal → Reservations → + Add → Azure Synapse Analytics (data warehousing only).' },
  'microsoft.compute/disks':                       { label: 'Managed Disks',          rate1: 0.20, rate3: 0.38, icon: '💾', note: 'Azure Reserved Disk Storage applies to Premium SSD P20 and larger disks. Smaller disks and Standard HDD/SSD are not eligible. To purchase: Azure Portal → Reservations → + Add → Azure Managed Disks.' },
  'microsoft.kusto/clusters':                      { label: 'Azure Data Explorer',    rate1: 0.22, rate3: 0.42, icon: '🔭', note: 'Azure Data Explorer clusters support reserved capacity. To purchase: Azure Portal → Reservations → + Add → Azure Data Explorer.' },
  'microsoft.compute/dedicatedhosts':              { label: 'Dedicated Hosts',        rate1: 0.30, rate3: 0.45, icon: '🖥️', note: 'Azure Dedicated Hosts support reserved instances per host SKU and region. To purchase: Azure Portal → Reservations → + Add → Azure Dedicated Host.' },
  'microsoft.avs/privateclouds':                   { label: 'Azure VMware Solution',  rate1: 0.28, rate3: 0.46, icon: '☁️', note: 'AVS private clouds support reserved capacity per node. To purchase: Azure Portal → Reservations → + Add → Azure VMware Solution.' },
  'microsoft.netapp/netappaccounts/capacitypools': { label: 'Azure NetApp Files',     rate1: 0.17, rate3: 0.31, icon: '📁', note: 'Azure NetApp Files capacity pools support reserved capacity for Standard, Premium, and Ultra service levels. To purchase: Azure Portal → Reservations → + Add → Azure NetApp Files.' },
  // NOTE: Azure ML *workspaces* are intentionally excluded — the workspace is a management
  // container and is NOT itself reservable. To reduce Azure ML costs, reserve the compute
  // instances and clusters inside the workspace:
  // Azure Portal → Machine Learning → [workspace] → Compute → select instance → Purchase reservation
}

// ── RI type display labels ─────────────────────────────────────────────────────

const RI_TYPE_LABELS = {
  'microsoft.compute/virtualmachines':             'Virtual Machines',
  'microsoft.sql/servers/databases':               'SQL Database',
  'microsoft.sql/managedinstances':                'SQL Managed Instance',
  'microsoft.sql/servers/elasticpools':            'SQL Elastic Pool',
  'microsoft.cache/redis':                         'Redis Cache',
  'microsoft.cache/redisenterprise':               'Redis Enterprise',
  'microsoft.documentdb/databaseaccounts':         'Cosmos DB',
  'microsoft.dbforpostgresql/flexibleservers':     'PostgreSQL Flexible',
  'microsoft.dbformysql/flexibleservers':          'MySQL Flexible',
  'microsoft.web/serverfarms':                     'App Service Plans',
  'microsoft.compute/disks':                       'Managed Disks',
  'microsoft.databricks/workspaces':               'Databricks',
  'microsoft.synapse/workspaces':                  'Synapse Analytics',
  'microsoft.kusto/clusters':                      'Azure Data Explorer',
  'microsoft.compute/dedicatedhosts':              'Dedicated Hosts',
  'microsoft.avs/privateclouds':                   'Azure VMware Solution',
  'microsoft.netapp/netappaccounts/capacitypools': 'Azure NetApp Files',
}

// ── Score label → RI term recommendation ─────────────────────────────────────
// 3yr: high score + stable trend = long-lived workload, max discount worth the commitment
// 1yr: moderate score or any uncertainty = safer commitment, still 37% off
// Verify: low score or unconfirmed usage = check utilization before committing

function termRecommendation(r) {
  if (r.score_label === 'Not Used' || r.score_label === 'Unknown') return 'Verify'
  if (r.final_score >= 75 && (r.trend === 'stable' || r.trend === 'rising')) return '3yr'
  if (r.final_score >= 51) return '1yr'
  return 'Verify'
}

// ── VM SKU display helper ──────────────────────────────────────────────────────
// Azure VM SKUs look like "Standard_D4s_v3" — extract the readable size part

function vmSkuDisplay(sku) {
  if (!sku) return null
  // Strip "Standard_" or "Basic_" prefix for display
  return sku.replace(/^(Standard|Basic)_/i, '')
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-gray-600 hover:text-gray-400 transition-colors"
      >
        <Info size={12} />
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

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon, tooltip }) {
  const border = {
    blue:   'border-l-2 border-l-blue-500/60',
    green:  'border-l-2 border-l-green-500/60',
    purple: 'border-l-2 border-l-purple-500/60',
    amber:  'border-l-2 border-l-amber-500/60',
  }[accent] || ''
  return (
    <div className={clsx('card flex flex-col gap-1 overflow-hidden', border)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        {Icon && <div className="p-1.5 rounded-lg bg-gray-800"><Icon size={13} className="text-gray-400" /></div>}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Explainer card ─────────────────────────────────────────────────────────────

function RiExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="card border-blue-800/30 bg-blue-950/20">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-blue-400 shrink-0" />
          <span className="text-sm font-semibold text-blue-300">How Reserved Instances work — and when to buy</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
          <div className="space-y-1.5">
            <p className="font-semibold text-gray-300 flex items-center gap-1.5">
              <Tag size={12} className="text-blue-400" /> What you're buying
            </p>
            <p>A Reserved Instance is a billing discount, not a resource. You commit to a resource type, SKU, and region for 1 or 3 years — Azure automatically applies the discounted rate to matching usage. No migration, no downtime, no configuration change required.</p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-gray-300 flex items-center gap-1.5">
              <CheckCircle size={12} className="text-green-400" /> Confirmed vs. Verify
            </p>
            <p>Resources with strong utilisation data are marked <strong className="text-white">Confirmed</strong> — safe to commit today. Resources with limited metrics data are marked <strong className="text-amber-400">Verify first</strong> — the spend is real, but validate the workload is long-lived before locking in a 1- or 3-year term.</p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-gray-300 flex items-center gap-1.5">
              <TrendingDown size={12} className="text-amber-400" /> Choosing 1yr vs 3yr
            </p>
            <p>1-year RIs save 24–40% and are the lower-risk starting point for most workloads. 3-year RIs save 44–72% and are best reserved for core, stable infrastructure that will exist for the foreseeable future. Start with 1yr for any workload less than 18 months old.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Type breakdown bar ─────────────────────────────────────────────────────────

function TypeBreakdown({ byType, totalSavings1yr }) {
  const sorted = Object.entries(byType)
    .map(([type, items]) => {
      const meta     = RI_META[type] || { label: type.split('/').pop(), icon: '📦', rate1: 0.35, rate3: 0.55 }
      const spend    = items.reduce((s, r) => s + r.cost_current_month, 0)
      const save1yr  = items.reduce((s, r) => s + r.ri_1yr_monthly_savings, 0)
      const save3yr  = items.reduce((s, r) => s + r.ri_3yr_monthly_savings, 0)
      return { type, meta, items, spend, save1yr, save3yr }
    })
    .sort((a, b) => b.save1yr - a.save1yr)

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <BarChart2 size={15} className="text-gray-400" />
        Savings by Resource Type
      </h3>
      <div className="space-y-3">
        {sorted.map(({ type, meta, items, spend, save1yr, save3yr }) => {
          const barW = totalSavings1yr > 0 ? (save1yr / totalSavings1yr) * 100 : 0
          return (
            <div key={type} className="flex items-center gap-3">
              <span className="text-base w-6 text-center shrink-0">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-300 truncate font-medium">{meta.label}</span>
                  <span className="text-xs text-gray-500 shrink-0 ml-2">{items.length} resource{items.length > 1 ? 's' : ''}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div style={{ width: `${barW}%` }} className="h-full bg-blue-500 rounded-full" />
                </div>
              </div>
              <div className="text-right shrink-0 w-28">
                <p className="text-xs font-semibold text-green-400 tabular-nums">{fmt(save1yr)}<span className="text-gray-600 font-normal">/mo 1yr</span></p>
                <p className="text-xs text-gray-600 tabular-nums">{fmt(save3yr)}/mo 3yr</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Resource table ─────────────────────────────────────────────────────────────

function ResourceTable({ resources, unconfirmedIds = new Set(), coveredIds = new Set() }) {
  const [sortCol, setSortCol] = useState('ri_1yr_monthly_savings')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedType, setExpandedType] = useState(null)

  // Group by resource type
  const byType = useMemo(() => {
    const map = {}
    for (const r of resources) {
      if (!map[r.resource_type]) map[r.resource_type] = []
      map[r.resource_type].push(r)
    }
    return map
  }, [resources])

  const typeOrder = useMemo(() =>
    Object.entries(byType)
      .map(([type, items]) => ({ type, total1yr: items.reduce((s, r) => s + r.ri_1yr_monthly_savings, 0) }))
      .sort((a, b) => b.total1yr - a.total1yr)
      .map(e => e.type)
  , [byType])

  function toggleSort(col) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function sortedItems(items) {
    return [...items].sort((a, b) => {
      const av = a[sortCol] ?? 0
      const bv = b[sortCol] ?? 0
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const Th = ({ col, children }) => (
    <th
      onClick={() => toggleSort(col)}
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
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Tag size={15} className="text-gray-400" />
          RI Candidates
          {coveredIds.size > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/40 text-xs text-blue-300 font-normal">
              + {coveredIds.size} already reserved
            </span>
          )}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          RI-eligible resource types with active spend.{' '}
          <span className="text-amber-400">⚠ Unconfirmed</span> rows need diagnostics enabled before committing.
          {coveredIds.size > 0 && <span className="text-blue-400"> · <span className="text-blue-300">Reserved</span> rows are already covered — shown for reference only.</span>}
        </p>
      </div>

      <div className="space-y-2">
        {typeOrder.map(type => {
          const items = byType[type]
          const meta  = RI_META[type] || { label: type.split('/').pop(), icon: '📦', note: '' }
          const total1yr = items.reduce((s, r) => s + r.ri_1yr_monthly_savings, 0)
          const total3yr = items.reduce((s, r) => s + r.ri_3yr_monthly_savings, 0)
          const isOpen   = expandedType === type

          return (
            <div key={type} className="rounded-xl border border-gray-800/80 overflow-hidden">

              {/* Type header row */}
              <button
                onClick={() => setExpandedType(isOpen ? null : type)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800/80 transition-colors text-left"
              >
                <span className="text-base shrink-0">{meta.icon}</span>
                <span className="font-semibold text-gray-200 text-sm flex-1">{meta.label}</span>
                <span className="text-xs text-gray-500">{items.length} resource{items.length > 1 ? 's' : ''}</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400 tabular-nums">{fmt(total1yr)}<span className="text-xs text-gray-500 font-normal">/mo saved (1yr)</span></p>
                  <p className="text-xs text-gray-600 tabular-nums">{fmt(total3yr)}/mo saved (3yr) · {fmt(total1yr * 12)} annual</p>
                </div>
                {isOpen ? <ChevronUp size={14} className="text-gray-500 shrink-0" /> : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
              </button>

              {/* Expanded table */}
              {isOpen && (
                <div className="border-t border-gray-800/60">
                  {/* Eligibility note */}
                  {meta.note && (
                    <div className="px-4 py-2.5 bg-blue-950/20 border-b border-gray-800/40 text-xs text-blue-300/80">
                      <Info size={11} className="inline mr-1.5 mb-0.5" />{meta.note}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs" style={{ minWidth: 700 }}>
                      <thead>
                        <tr className="bg-gray-900/40 border-b border-gray-800/60">
                          <Th col="resource_name">Resource</Th>
                          <Th col="location">Region</Th>
                          <Th col="sku">SKU / Tier</Th>
                          <Th col="cost_current_month">On-Demand / Mo</Th>
                          <Th col="ri_1yr_monthly_savings">1-yr Savings / Mo</Th>
                          <Th col="ri_3yr_monthly_savings">3-yr Savings / Mo</Th>
                          <Th col="final_score">Score</Th>
                          <th className="px-3 py-2">Rec.</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/40">
                        {sortedItems(items).map(r => {
                          const term          = termRecommendation(r)
                          const isUnconfirmed = unconfirmedIds.has(r.resource_id)
                          const isCovered     = coveredIds.has(r.resource_id)
                          const isVerify      = term === 'Verify' || isCovered
                          const savingsToUse  = term === '3yr' ? r.ri_3yr_monthly_savings : r.ri_1yr_monthly_savings
                          const afterRI       = r.cost_current_month - savingsToUse
                          const skuDisplay    = vmSkuDisplay(r.sku) || r.sku?.split('/').pop() || '—'
                          return (
                            <tr key={r.resource_id} className={clsx(
                              'hover:bg-gray-800/20 transition-colors',
                              isUnconfirmed && !isCovered && 'bg-amber-950/10',
                              isCovered     && 'bg-blue-950/10 opacity-70',
                            )}>
                              {/* Resource name */}
                              <td className="px-3 py-3">
                                <p className="font-medium text-white truncate max-w-[180px]" title={r.resource_name}>{r.resource_name}</p>
                                <p className="text-gray-600 text-xs">{r.resource_group}</p>
                                {isCovered && (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-400 mt-0.5">
                                    <CheckCircle size={10} /> Already reserved
                                  </span>
                                )}
                                {isUnconfirmed && !isCovered && (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-500 mt-0.5">
                                    ⚠ Check usage before committing
                                  </span>
                                )}
                              </td>

                              {/* Region */}
                              <td className="px-3 py-3 text-gray-400 text-xs capitalize">{r.location || '—'}</td>

                              {/* SKU / size — what to select when buying the RI */}
                              <td className="px-3 py-3">
                                <p className="font-mono text-gray-200 text-xs font-semibold">{skuDisplay}</p>
                                <p className="text-gray-600 text-xs mt-0.5">select this SKU in portal</p>
                              </td>

                              {/* On-demand cost + after-RI projection */}
                              <td className="px-3 py-3 tabular-nums">
                                <p className="font-semibold text-white text-xs">{fmtFull(r.cost_current_month)}</p>
                                {!isVerify && <p className="text-blue-400 text-xs mt-0.5">→ {fmt(afterRI)}/mo after RI</p>}
                              </td>

                              {/* 1yr savings */}
                              <td className="px-3 py-3 tabular-nums">
                                <p className="font-semibold text-green-400 text-xs">{fmt(r.ri_1yr_monthly_savings)}/mo</p>
                                <p className="text-gray-600 text-xs">{fmt(r.ri_1yr_monthly_savings * 12)}/yr · {(meta.rate1 * 100).toFixed(0)}% off</p>
                              </td>

                              {/* 3yr savings */}
                              <td className="px-3 py-3 tabular-nums">
                                <p className="font-semibold text-green-500 text-xs">{fmt(r.ri_3yr_monthly_savings)}/mo</p>
                                <p className="text-gray-600 text-xs">{fmt(r.ri_3yr_monthly_savings * 12)}/yr · {(meta.rate3 * 100).toFixed(0)}% off</p>
                              </td>

                              {/* Score bar */}
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden w-12">
                                    <div style={{ width: `${r.final_score}%`, backgroundColor: SCORE_HEX[r.score_label] ?? SCORE_HEX_DEFAULT }}
                                      className="h-full rounded-full" />
                                  </div>
                                  <span className="tabular-nums text-gray-400 text-xs w-6 text-right">{r.final_score?.toFixed(0)}</span>
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: SCORE_HEX[r.score_label] ?? SCORE_HEX_DEFAULT }}>{r.score_label}</p>
                              </td>

                              {/* Term recommendation */}
                              <td className="px-3 py-3">
                                {isCovered ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border bg-blue-900/30 text-blue-300 border-blue-700/40 whitespace-nowrap">
                                    <CheckCircle size={10} /> Covered
                                  </span>
                                ) : (
                                  <span className={clsx(
                                    'inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap',
                                    term === '3yr'    && 'bg-purple-900/40 text-purple-300 border-purple-700/50',
                                    term === '1yr'    && 'bg-blue-900/40 text-blue-300 border-blue-700/50',
                                    term === 'Verify' && 'bg-amber-900/40 text-amber-400 border-amber-700/50',
                                  )}>
                                    {term === 'Verify' ? '⚠ Verify first' : `✓ ${term}`}
                                  </span>
                                )}
                              </td>

                              {/* Portal link */}
                              <td className="px-3 py-3">
                                {r.portal_url && (
                                  <a href={r.portal_url} target="_blank" rel="noreferrer"
                                    className="text-gray-600 hover:text-blue-400 transition-colors" title="Open resource in Azure Portal">
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
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysToExpiry(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function fmtExpiry(dateStr) {
  if (!dateStr) return '—'
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return dateStr }
}

function expiryColor(days) {
  if (days == null) return 'text-gray-500'
  if (days < 0)  return 'text-red-500'
  if (days <= 30) return 'text-red-400'
  if (days <= 90) return 'text-amber-400'
  return 'text-gray-400'
}

function fmtMoney(n) {
  if (n == null || n === 0) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function fmtTimeLeft(days) {
  if (days == null) return null
  if (days < 0)   return 'Expired'
  if (days === 0) return 'Today'
  if (days < 31)  return `${days}d left`
  if (days < 365) return `${Math.round(days / 30.5)}mo left`
  const yrs = Math.floor(days / 365)
  const mos = Math.round((days % 365) / 30.5)
  return mos > 0 ? `${yrs}yr ${mos}mo left` : `${yrs}yr left`
}

// ── F10 Over-commitment banner ─────────────────────────────────────────────────

function OverCommitmentBanner({ reservations, totalWasted }) {
  const underutilized = reservations.filter(r => r.utilization_pct != null && r.utilization_pct < 70)
  const totalCovered  = reservations.reduce((s, r) => s + (r.covered_cost || 0), 0)
  const totalUtilized = totalCovered  // covered_cost IS the utilized portion

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 flex gap-4 items-start">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-900/40 border border-amber-700/40 flex items-center justify-center mt-0.5">
        <Zap size={15} className="text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300">Reservation Over-Commitment Detected</p>
        <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">
          {underutilized.length} reservation{underutilized.length !== 1 ? 's are' : ' is'} below 70% utilization.
          You have approximately <span className="font-semibold text-amber-300">{fmtMoney(totalCovered)}/mo</span> in active
          reservations but only <span className="font-semibold text-white">{fmtMoney(totalUtilized)}/mo</span> is being
          matched — an estimated <span className="font-semibold text-amber-300">{fmtMoney(totalWasted)}/mo</span> in
          committed capacity going unused. An underutilized reservation costs more than pay-as-you-go on the unused slots.
        </p>
        <p className="text-xs text-amber-600 mt-1.5">
          Consider resizing, exchanging, or cancelling commitments with sustained utilization below 70%.
          Azure Portal → Reservations → select reservation → Exchange or Return.
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl font-black text-amber-400 tabular-nums">{fmtMoney(totalWasted)}</p>
        <p className="text-xs text-amber-600">wasted /mo</p>
      </div>
    </div>
  )
}

// ── Section 1: Already Reserved ───────────────────────────────────────────────

function AlreadyReservedSection({ reservations }) {
  const fromBilling    = reservations.some(r => r.from_billing)
  const underutilized  = reservations.filter(r => r.utilization_pct != null && r.utilization_pct < 70)
  const totalCovered   = reservations.reduce((s, r) => s + (r.covered_cost || 0), 0)
  const totalWasted    = reservations.reduce((s, r) => s + (r.over_commitment_usd || 0), 0)
  const totalResources = fromBilling ? reservations.reduce((s, r) => s + (r.quantity || 0), 0) : reservations.length

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-green-400" />
          <h3 className="text-base font-bold text-white">Already Reserved</h3>
          <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400">
            {fromBilling ? `${totalResources} resource${totalResources !== 1 ? 's' : ''}` : reservations.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {underutilized.length > 0 && !fromBilling && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {underutilized.length} underutilized
            </span>
          )}
          {totalCovered > 0 && (
            <span className="text-gray-500">{fmtMoney(totalCovered)}/mo reserved spend</span>
          )}
        </div>
      </div>

      {/* Billing-data note */}
      {fromBilling && (
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-4 py-2.5 flex items-start gap-2 text-xs text-blue-300/80">
          <Info size={13} className="shrink-0 mt-0.5 text-blue-400" />
          <span>
            Detected from billing data (AmortizedCost · PricingModel = Reservation).
            Term, expiry, and utilization details require the{' '}
            <strong className="text-blue-200">Reservations Reader</strong> role on{' '}
            <code className="text-blue-300">/providers/Microsoft.Capacity</code>.
          </span>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" style={{ minWidth: 740 }}>
            <thead>
              <tr className="bg-gray-900/60 border-b border-gray-800/60">
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reservation</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type / SKU</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Region</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Term</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Utilization</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Est. RI Spend</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Over-Commitment</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reserved Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {reservations.map((res, i) => {
                const util    = res.utilization_pct
                const wasted  = res.over_commitment_usd || 0
                const covered = res.covered_cost || 0
                const days    = res.days_to_expiry ?? daysToExpiry(res.expiry_date)
                const typeLabel = RI_TYPE_LABELS[res.resource_type] || res.resource_type?.split('/').pop() || '—'
                const isUnderutil = util != null && util < 70
                const isLowUtil   = util != null && util < 50

                if (res.from_billing) {
                  // Billing-detected coverage — individual resource row, no reservation API details
                  const billingTypeLabel = res.type_label || typeLabel
                  return (
                    <tr key={res.reservation_id || i} className="hover:bg-gray-800/20 transition-colors bg-blue-950/5">
                      <td className="px-3 py-3">
                        <p className="font-medium text-white truncate max-w-[160px]" title={res.display_name}>
                          {res.display_name || '—'}
                        </p>
                        <p className="text-blue-400/60 text-xs mt-0.5">Billing-detected</p>
                      </td>
                      <td className="px-3 py-3 text-gray-400">{billingTypeLabel}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs truncate max-w-[80px]" title={res.location}>
                        {res.location || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-900/30 text-blue-400">
                          Reserved
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-300 tabular-nums font-semibold">1</td>
                      <td className="px-3 py-3 text-gray-600">—</td>
                      <td className="px-3 py-3 tabular-nums">
                        {covered > 0
                          ? <span className="text-gray-300 font-semibold">{fmtMoney(covered)}<span className="text-gray-600 font-normal">/mo</span></span>
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-gray-600">—</td>
                      <td className="px-3 py-3 text-gray-600 text-xs italic">No Reader role</td>
                    </tr>
                  )
                }

                return (
                  <tr key={res.reservation_id || i} className={clsx(
                    'hover:bg-gray-800/20 transition-colors',
                    isLowUtil   && 'bg-red-950/10',
                    !isLowUtil && isUnderutil && 'bg-amber-950/10',
                  )}>
                    {/* Name */}
                    <td className="px-3 py-3">
                      <p className="font-medium text-white truncate max-w-[160px]" title={res.display_name}>
                        {res.display_name || res.name || '—'}
                      </p>
                      {isUnderutil && (
                        <span className={clsx('inline-flex items-center gap-1 text-xs mt-0.5', isLowUtil ? 'text-red-400' : 'text-amber-400')}>
                          ⚠ {isLowUtil ? 'Critically low utilization' : 'Below 70% threshold'}
                        </span>
                      )}
                    </td>

                    {/* Type / SKU */}
                    <td className="px-3 py-3">
                      <p className="text-gray-300">{typeLabel}</p>
                      {res.sku && <p className="font-mono text-gray-500 text-xs mt-0.5">{res.sku}</p>}
                    </td>

                    {/* Region */}
                    <td className="px-3 py-3 text-gray-400 capitalize">{res.location || '—'}</td>

                    {/* Term */}
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-xs font-semibold',
                        res.term?.includes('3') ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300',
                      )}>{res.term || '—'}</span>
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-3 text-gray-400 tabular-nums">{res.quantity ?? '—'}</td>

                    {/* Utilization bar */}
                    <td className="px-3 py-3">
                      {util != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden shrink-0">
                            <div
                              style={{ width: `${Math.min(100, util)}%` }}
                              className={clsx('h-full rounded-full',
                                util < 50 ? 'bg-red-500' : util < 70 ? 'bg-amber-500' : 'bg-green-500'
                              )}
                            />
                          </div>
                          <span className={clsx('tabular-nums font-semibold text-xs',
                            util < 50 ? 'text-red-400' : util < 70 ? 'text-amber-400' : 'text-green-400'
                          )}>
                            {util.toFixed(0)}%
                          </span>
                        </div>
                      ) : <span className="text-gray-600">—</span>}
                    </td>

                    {/* Estimated RI spend (covered portion) */}
                    <td className="px-3 py-3 tabular-nums">
                      {covered > 0
                        ? <span className="text-gray-300 font-semibold">{fmtMoney(covered)}<span className="text-gray-600 font-normal">/mo</span></span>
                        : <span className="text-gray-600">—</span>
                      }
                    </td>

                    {/* Over-commitment estimate */}
                    <td className="px-3 py-3 tabular-nums">
                      {wasted > 0
                        ? <span className={clsx('font-semibold', wasted > 100 ? 'text-red-400' : 'text-amber-400')}>{fmtMoney(wasted)}<span className="text-gray-600 font-normal">/mo est.</span></span>
                        : <span className="text-green-500 text-xs">None</span>
                      }
                    </td>

                    {/* Reserved Period */}
                    <td className="px-3 py-3">
                      {res.effective_date && (
                        <p className="text-gray-500 text-xs">Since {fmtExpiry(res.effective_date)}</p>
                      )}
                      <p className={clsx('font-medium tabular-nums', expiryColor(days))}>
                        {fmtExpiry(res.expiry_date)}
                      </p>
                      {days != null && (
                        <p className={clsx('text-xs', expiryColor(days))}>{fmtTimeLeft(days)}</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals footer */}
        {(totalCovered > 0 || totalWasted > 0) && (
          <div className="border-t border-gray-800/60 px-4 py-2.5 flex items-center justify-between bg-gray-900/30">
            <span className="text-xs text-gray-500">Totals (estimated from covered resources)</span>
            <div className="flex items-center gap-6 text-xs">
              {totalCovered > 0 && (
                <span className="text-gray-400">
                  Committed: <span className="font-semibold text-white">{fmtMoney(totalCovered)}/mo</span>
                </span>
              )}
              {totalWasted > 0 && (
                <span className="text-amber-500">
                  Over-committed: <span className="font-semibold text-amber-400">{fmtMoney(totalWasted)}/mo</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section 3: Expiring Soon ──────────────────────────────────────────────────

function ExpiringSoonSection({ reservations }) {
  const expiring = reservations
    .map(r => ({ ...r, _days: r.days_to_expiry ?? daysToExpiry(r.expiry_date) }))
    .filter(r => r._days != null && r._days >= 0 && r._days <= 90)
    .sort((a, b) => a._days - b._days)

  if (!expiring.length) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <h3 className="text-base font-bold text-white">Expiring Soon</h3>
        <span className="px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/40 text-xs text-amber-400">
          {expiring.length} within 90 days
        </span>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 bg-amber-950/20 border-b border-amber-800/30">
          <p className="text-xs text-amber-400/80">
            Reservations that expire without renewal fall back to pay-as-you-go rates — potentially a 37–72% cost increase on the next billing cycle. Review and renew at least 30 days before expiry to avoid pricing gaps.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" style={{ minWidth: 580 }}>
            <thead>
              <tr className="bg-gray-900/60 border-b border-gray-800/60">
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reservation</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Term</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Expiry Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Days Left</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Est. Monthly Spend</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {expiring.map((res, i) => {
                const days      = res._days
                const covered   = res.covered_cost || 0
                const typeLabel = RI_TYPE_LABELS[res.resource_type] || res.resource_type?.split('/').pop() || '—'
                const urgency   = days <= 30 ? 'critical' : 'warning'
                return (
                  <tr key={res.reservation_id || i} className={clsx(
                    'hover:bg-gray-800/20 transition-colors',
                    urgency === 'critical' && 'bg-red-950/15',
                  )}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-white truncate max-w-[160px]" title={res.display_name}>
                        {res.display_name || res.name || '—'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-gray-400">{typeLabel}</td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-xs font-semibold',
                        res.term?.includes('3') ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300',
                      )}>{res.term || '—'}</span>
                    </td>
                    <td className={clsx('px-3 py-3 font-semibold tabular-nums', urgency === 'critical' ? 'text-red-400' : 'text-amber-400')}>
                      {fmtExpiry(res.expiry_date)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                        urgency === 'critical' ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/40 text-amber-300',
                      )}>
                        {days}d
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-gray-300 font-semibold">
                      {covered > 0 ? `${fmtMoney(covered)}/mo` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        urgency === 'critical' ? 'text-red-400' : 'text-amber-400',
                      )}>
                        {urgency === 'critical' ? '🔴 Renew now' : '⚠ Renew soon'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReservationsPanel({ resources = [], activeReservations = [], overCommitmentUsd = 0, reservationRecommendations = [] }) {
  const RI_TYPES = useMemo(() => new Set(Object.keys(RI_META)), [])

  // Detect Azure ML workspaces — they aren't directly reservable but are worth flagging
  const mlWorkspaces = useMemo(() =>
    resources.filter(r =>
      r.resource_type === 'microsoft.machinelearningservices/workspaces' &&
      r.cost_current_month >= 50
    )
  , [resources])

  // Net-new opportunities — not yet covered by any reservation
  const eligible = useMemo(() =>
    resources.filter(r =>
      RI_TYPES.has(r.resource_type) &&
      r.cost_current_month >= 10 &&
      !r.ri_covered
    )
  , [resources, RI_TYPES])

  const confirmedEligible = useMemo(() =>
    eligible.filter(r => r.ri_eligible && r.ri_1yr_monthly_savings > 0)
  , [eligible])

  const unconfirmedEligible = useMemo(() =>
    eligible.filter(r => !r.ri_eligible || r.ri_1yr_monthly_savings === 0)
  , [eligible])

  const unconfirmedWithSavings = useMemo(() =>
    unconfirmedEligible.map(r => {
      const meta = RI_META[r.resource_type]
      if (!meta) return r
      return {
        ...r,
        ri_1yr_monthly_savings: r.ri_1yr_monthly_savings || Math.round(r.cost_current_month * meta.rate1 * 100) / 100,
        ri_3yr_monthly_savings: r.ri_3yr_monthly_savings || Math.round(r.cost_current_month * meta.rate3 * 100) / 100,
      }
    })
  , [unconfirmedEligible])

  const netNew      = useMemo(() => [...confirmedEligible, ...unconfirmedWithSavings], [confirmedEligible, unconfirmedWithSavings])
  const byType      = useMemo(() => {
    const map = {}
    for (const r of netNew) {
      if (!map[r.resource_type]) map[r.resource_type] = []
      map[r.resource_type].push(r)
    }
    return map
  }, [netNew])

  const totalSpend = netNew.reduce((s, r) => s + r.cost_current_month, 0)
  const total1yr   = netNew.reduce((s, r) => s + (r.ri_1yr_monthly_savings || 0), 0)
  const total3yr   = netNew.reduce((s, r) => s + (r.ri_3yr_monthly_savings || 0), 0)

  const hasRecommendations   = reservationRecommendations.length > 0
  const hasGaps              = netNew.length > 0
  const hasActiveReservations = activeReservations.length > 0
  const showOverCommitment   = overCommitmentUsd > 0

  if (!hasGaps && !hasActiveReservations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white">Reservations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Commit to predictable workloads to unlock 24–60% discounts.</p>
        </div>
        <RiExplainer />
        <div className="card flex flex-col items-center py-16 text-center gap-3">
          <div className="p-4 rounded-full bg-gray-800"><Tag size={28} className="text-gray-600" /></div>
          <p className="text-gray-400 font-semibold">No reservations or RI candidates found</p>
          <p className="text-gray-600 text-sm max-w-sm">
            No RI-eligible resource types with active spend were found in this subscription.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold text-white">Reservations</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Commit to predictable workloads to unlock 24–60% discounts vs on-demand pricing.
        </p>
      </div>

      {/* F10 Over-commitment banner */}
      {showOverCommitment && (
        <OverCommitmentBanner reservations={activeReservations} totalWasted={overCommitmentUsd} />
      )}

      {/* ── Section 1: Already Reserved ─────────────────────────────────── */}
      {hasActiveReservations && (
        <AlreadyReservedSection reservations={activeReservations} />
      )}

      {/* ── Section 2: Reservation Gaps ─────────────────────────────────── */}
      {hasGaps && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-blue-400" />
            <h3 className="text-base font-bold text-white">Reservation Gaps</h3>
            <span className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-xs text-blue-400">
              {netNew.length} net-new {netNew.length === 1 ? 'opportunity' : 'opportunities'}
            </span>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Resources with no reservation coverage and consistent spend. These are the only rows with a Buy recommendation.
          </p>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="RI Candidates"
              value={netNew.length}
              sub={`${confirmedEligible.length} confirmed · ${unconfirmedWithSavings.length} need verification`}
              accent="blue" icon={Zap}
              tooltip="Confirmed: Actively/Fully Used with ≥$50/mo. Unconfirmed: spend on an RI-eligible type but insufficient metrics — verify usage before committing."
            />
            <KpiCard
              label="Eligible Monthly Spend"
              value={fmt(totalSpend)}
              sub="on-demand pricing today"
              accent="amber"
              tooltip="Total monthly cost of all net-new RI-eligible resources at current on-demand rates."
            />
            <KpiCard
              label="1-Year RI Savings"
              value={fmt(total1yr) + '/mo'}
              sub={`${fmt(total1yr * 12)}/yr — no upfront required`}
              accent="green" icon={TrendingDown}
              tooltip="Estimated monthly savings if all eligible resources switch to 1-year Reserved Instances."
            />
            <KpiCard
              label="3-Year RI Savings"
              value={fmt(total3yr) + '/mo'}
              sub={`${fmt(total3yr * 12)}/yr — maximum discount`}
              accent="purple" icon={TrendingDown}
              tooltip="Only recommended for core stable workloads. 3-year term = maximum discount, minimum flexibility."
            />
          </div>

          <RiExplainer />

          {/* Azure ML notice */}
          {mlWorkspaces.length > 0 && (
            <div className="rounded-xl border border-sky-800/50 bg-sky-950/20 px-4 py-3 flex gap-3">
              <span className="text-xl shrink-0 mt-0.5">🤖</span>
              <div>
                <p className="text-sm font-semibold text-sky-300">
                  Azure ML workspace{mlWorkspaces.length > 1 ? 's' : ''} detected ({mlWorkspaces.map(r => r.resource_name).join(', ')})
                </p>
                <p className="text-xs text-sky-400/70 mt-1 leading-relaxed">
                  ML <em>workspaces</em> are not reservable. To reduce ML costs, reserve the <strong>compute instances and
                  clusters</strong> inside the workspace: Azure Portal → Machine Learning → [workspace] → Compute → Purchase reservation.
                </p>
              </div>
            </div>
          )}

          {/* Microsoft recommendations callout */}
          {hasRecommendations && (
            <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/15 px-4 py-3 flex gap-3">
              <span className="text-xl shrink-0">💡</span>
              <div>
                <p className="text-sm font-semibold text-indigo-300">
                  Microsoft Advisor agrees — {reservationRecommendations.length} additional recommendation{reservationRecommendations.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-indigo-400/70 mt-0.5">
                  Azure's own Consumption Advisor independently recommends reservations for{' '}
                  {[...new Set(reservationRecommendations.map(r => RI_TYPE_LABELS[r.resource_type] || r.resource_type?.split('/').pop()))].join(', ')}.
                  Total Microsoft-estimated net savings:{' '}
                  <span className="font-semibold text-indigo-300">
                    {fmt(reservationRecommendations.reduce((s, r) => s + (r.net_savings_monthly || 0), 0))}/mo
                  </span>
                </p>
              </div>
            </div>
          )}

          <TypeBreakdown byType={byType} totalSavings1yr={total1yr} />
          <ResourceTable
            resources={netNew}
            unconfirmedIds={new Set(unconfirmedWithSavings.map(r => r.resource_id))}
          />
        </div>
      )}

      {/* ── Section 3: Expiring Soon ─────────────────────────────────────── */}
      <ExpiringSoonSection reservations={activeReservations} />

    </div>
  )
}

// ── Active Reservations table ─────────────────────────────────────────────────

function ActiveReservations({ reservations }) {
  if (!reservations.length) return null

  const now         = new Date()
  const expirySoon  = reservations.filter(r => {
    if (!r.expiry_date) return false
    const d = new Date(r.expiry_date)
    const days = (d - now) / 86400000
    return days > 0 && days <= 90
  })

  function expiryColor(dateStr) {
    if (!dateStr) return 'text-gray-500'
    const days = (new Date(dateStr) - now) / 86400000
    if (days < 0)  return 'text-red-500'
    if (days <= 30) return 'text-red-400'
    if (days <= 90) return 'text-amber-400'
    return 'text-gray-400'
  }

  function fmtExpiry(dateStr) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return dateStr }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CheckCircle size={15} className="text-green-400" />
            Active Reservations
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{reservations.length} active commitment{reservations.length !== 1 ? 's' : ''}{expirySoon.length > 0 && ` · ${expirySoon.length} expiring within 90 days`}</p>
        </div>
        {expirySoon.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-400">
            ⚠ {expirySoon.length} expiring soon
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-gray-900/40 border-b border-gray-800/60">
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Resource Type</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">SKU</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Region</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Term</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Utilization</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {reservations.map((res, i) => {
              const util = res.utilization_pct
              const typeLabel = RI_TYPE_LABELS[res.resource_type] || res.resource_type?.split('/').pop() || '—'
              return (
                <tr key={res.reservation_id || i} className={clsx(
                  'hover:bg-gray-800/20 transition-colors',
                  (() => { const d = (new Date(res.expiry_date) - now) / 86400000; return d > 0 && d <= 30 })() && 'bg-red-950/10',
                )}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-white truncate max-w-[180px]" title={res.display_name}>{res.display_name || res.name || '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-gray-400">{typeLabel}</td>
                  <td className="px-3 py-3 font-mono text-gray-300">{res.sku || '—'}</td>
                  <td className="px-3 py-3 text-gray-400 capitalize">{res.location || '—'}</td>
                  <td className="px-3 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-semibold',
                      res.term?.includes('3') ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300',
                    )}>{res.term || '—'}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-400 tabular-nums">{res.quantity ?? '—'}</td>
                  <td className="px-3 py-3">
                    {util != null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden w-16">
                          <div
                            style={{ width: `${Math.min(100, util)}%` }}
                            className={clsx('h-full rounded-full', util < 50 ? 'bg-red-500' : util < 80 ? 'bg-amber-500' : 'bg-green-500')}
                          />
                        </div>
                        <span className={clsx('tabular-nums text-xs', util < 50 ? 'text-red-400' : util < 80 ? 'text-amber-400' : 'text-green-400')}>
                          {util.toFixed(0)}%
                        </span>
                      </div>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={clsx('px-3 py-3 tabular-nums font-medium', expiryColor(res.expiry_date))}>
                    {fmtExpiry(res.expiry_date)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

