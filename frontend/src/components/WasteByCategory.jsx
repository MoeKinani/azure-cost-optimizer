import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtShort(n) {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

const CATEGORY_DISPLAY = {
  compute:        'Compute',
  storage:        'Storage',
  data:           'Databases',
  ai:             'AI / ML',
  infrastructure: 'Networking',
  other:          'Other',
}

const CATEGORY_ORDER = ['compute', 'infrastructure', 'storage', 'data', 'ai', 'other']

// ── Build chart data ───────────────────────────────────────────────────────────

function buildCategoryData(resources) {
  const map = {}

  for (const r of resources) {
    const cat = r.resource_category || 'other'
    if (!map[cat]) {
      map[cat] = { cat, label: CATEGORY_DISPLAY[cat] ?? cat, confirmed: 0, orphaned: 0, likely: 0, count: 0 }
    }
    const d   = map[cat]
    const sav = r.estimated_monthly_savings ?? 0
    if (sav <= 0) continue
    d.count += 1
    if (r.is_orphan) {
      d.orphaned += sav
    } else if (r.score_label === 'Not Used') {
      d.confirmed += sav
    } else if (r.score_label === 'Rarely Used') {
      d.likely += sav
    }
  }

  return CATEGORY_ORDER
    .map(cat => map[cat])
    .filter(Boolean)
    .filter(d => d.confirmed + d.orphaned + d.likely > 0)
    .map(d => ({ ...d, total: d.confirmed + d.orphaned + d.likely }))
    .sort((a, b) => b.total - a.total)
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CatTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl text-xs min-w-[190px]">
      <p className="text-white font-semibold mb-2">{d.label}</p>
      <div className="space-y-1">
        {d.confirmed > 0 && (
          <div className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />Confirmed Waste
            </span>
            <span className="font-semibold text-red-400">{fmtShort(d.confirmed)}/mo</span>
          </div>
        )}
        {d.orphaned > 0 && (
          <div className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />Orphaned
            </span>
            <span className="font-semibold text-orange-400">{fmtShort(d.orphaned)}/mo</span>
          </div>
        )}
        {d.likely > 0 && (
          <div className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />Likely Waste
            </span>
            <span className="font-semibold text-yellow-400">{fmtShort(d.likely)}/mo</span>
          </div>
        )}
        <div className="flex justify-between gap-4 pt-1 border-t border-gray-700/60">
          <span className="text-gray-400">Total · {d.count} resources</span>
          <span className="font-bold text-white">{fmtShort(d.total)}/mo</span>
        </div>
      </div>
      <p className="mt-2 text-gray-600">Click to filter resource table</p>
    </div>
  )
}

function CatTick({ x, y, payload }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#9ca3af" fontSize={11}>
      {payload.value}
    </text>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WasteByCategory({ resources = [], onBarClick }) {
  const [activeCategory, setActiveCategory] = useState(null)

  const chartData = useMemo(() => buildCategoryData(resources), [resources])

  if (!chartData.length) return null

  const totalWaste = chartData.reduce((s, d) => s + d.total, 0)

  function handleClick(entry) {
    if (!onBarClick || !entry?.activePayload?.[0]) return
    const cat = entry.activePayload[0].payload.cat
    if (activeCategory === cat) {
      setActiveCategory(null)
      onBarClick(null)
    } else {
      setActiveCategory(cat)
      onBarClick({ field: 'resource_category', value: cat, label: `Category: ${CATEGORY_DISPLAY[cat] ?? cat}` })
    }
  }

  const chartHeight = Math.max(160, chartData.length * 40)

  return (
    <div className="card flex flex-col">

      {/* Header */}
      <div className="flex items-start justify-between mb-1 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PieIcon size={15} className="text-red-400" />
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Waste by Category
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {onBarClick
              ? activeCategory ? '✓ Filtering table — click again to clear' : 'Click a bar to filter table'
              : 'Where is the waste coming from?'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-red-400 tabular-nums leading-none">{fmtShort(totalWaste)}</p>
          <p className="text-xs text-gray-600 mt-0.5">total/mo</p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 60, left: 100, bottom: 4 }}
            onClick={handleClick}
            style={onBarClick ? { cursor: 'pointer' } : undefined}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={fmtShort}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={<CatTick />}
              axisLine={false}
              tickLine={false}
              width={96}
            />
            <Tooltip content={<CatTooltip />} cursor={{ fill: '#1f2937', opacity: 0.6 }} />

            <Bar dataKey="confirmed" stackId="a" name="Confirmed Waste" fill="#ef4444" radius={[0, 0, 0, 0]}
              fillOpacity={activeCategory ? (d => activeCategory === d.cat ? 0.9 : 0.25) : 0.85}
            />
            <Bar dataKey="orphaned" stackId="a" name="Orphaned" fill="#f97316" radius={[0, 0, 0, 0]}
              fillOpacity={activeCategory ? (d => activeCategory === d.cat ? 0.9 : 0.25) : 0.85}
            />
            <Bar dataKey="likely" stackId="a" name="Likely Waste" fill="#eab308" radius={[0, 4, 4, 0]}
              fillOpacity={activeCategory ? (d => activeCategory === d.cat ? 0.9 : 0.25) : 0.85}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-800/60">
        {[
          { label: 'Confirmed Waste', cls: 'bg-red-900/40 text-red-400 border-red-800/50'       },
          { label: 'Orphaned',        cls: 'bg-orange-900/40 text-orange-400 border-orange-800/50'},
          { label: 'Likely Waste',    cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50'},
        ].map(({ label, cls }) => (
          <span key={label} className={`text-xs px-2 py-0.5 rounded-md border ${cls}`}>
            {label}
          </span>
        ))}
      </div>

    </div>
  )
}
