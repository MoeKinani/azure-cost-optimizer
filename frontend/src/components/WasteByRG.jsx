import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Layers } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(n) {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

const DISPLAY_LABEL = {
  'Not Used':    'Confirmed Waste',
  'Rarely Used': 'Likely Waste',
}

// Score label priority for "worst in group" colouring
const LABEL_RANK = { 'Not Used': 0, 'Rarely Used': 1, 'Unknown': 2, 'Actively Used': 3, 'Fully Used': 4 }
const LABEL_COLOR = {
  'Not Used':      '#ef4444',
  'Rarely Used':   '#f97316',
  'Unknown':       '#6b7280',
  'Actively Used': '#eab308',
  'Fully Used':    '#22c55e',
}
const LABEL_BG = {
  'Not Used':      'bg-red-900/40 text-red-400 border-red-800/50',
  'Rarely Used':   'bg-orange-900/40 text-orange-400 border-orange-800/50',
  'Unknown':       'bg-gray-800/60 text-gray-400 border-gray-700/50',
  'Actively Used': 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50',
  'Fully Used':    'bg-green-900/40 text-green-400 border-green-800/50',
}

function buildRGData(resources) {
  const map = {}

  for (const r of resources) {
    const rg = r.resource_group || '(unassigned)'
    if (!map[rg]) {
      map[rg] = { rg, waste: 0, spend: 0, count: 0, worstLabel: 'Fully Used', worstRank: 4 }
    }
    const d = map[rg]
    d.waste += r.estimated_monthly_savings || 0
    d.spend += r.cost_current_month || 0
    d.count += 1
    const rank = LABEL_RANK[r.score_label] ?? 4
    if (rank < d.worstRank) {
      d.worstRank  = rank
      d.worstLabel = r.score_label
    }
  }

  return Object.values(map)
    .filter(d => d.waste > 0)
    .sort((a, b) => b.waste - a.waste)
    .slice(0, 10)
    .map(d => ({
      ...d,
      wastePct: d.spend > 0 ? Math.round((d.waste / d.spend) * 100) : 0,
    }))
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function RGTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl text-xs min-w-[200px]">
      <p className="text-white font-semibold mb-2 truncate">{d.rg}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Potential savings</span>
          <span className="font-bold text-white">{fmtShort(d.waste)}/mo</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Total spend</span>
          <span className="text-gray-300">{fmtShort(d.spend)}/mo</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Waste %</span>
          <span className="text-gray-300">{d.wastePct}% of RG spend</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Resources</span>
          <span className="text-gray-300">{d.count}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-gray-700/60">
          <span className="text-gray-400">Worst status</span>
          <span style={{ color: LABEL_COLOR[d.worstLabel] }} className="font-semibold">{DISPLAY_LABEL[d.worstLabel] ?? d.worstLabel}</span>
        </div>
      </div>
      <p className="mt-2 text-gray-600">Click to filter resource table</p>
    </div>
  )
}

// ── Custom Y axis tick — truncates long RG names ───────────────────────────────

function RGTick({ x, y, payload }) {
  const name = payload.value || ''
  const short = name.length > 22 ? name.slice(0, 20) + '…' : name
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#9ca3af" fontSize={11}>
      {short}
    </text>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WasteByRG({ resources = [], onBarClick }) {
  const [activeRG, setActiveRG] = useState(null)

  const chartData = useMemo(() => buildRGData(resources), [resources])

  if (!chartData.length) return null

  const totalWaste = chartData.reduce((s, d) => s + d.waste, 0)

  function handleClick(entry) {
    if (!onBarClick || !entry?.activePayload?.[0]) return
    const rg = entry.activePayload[0].payload.rg
    if (activeRG === rg) {
      setActiveRG(null)
      onBarClick(null)
    } else {
      setActiveRG(rg)
      onBarClick({ field: 'resource_group', value: rg, label: `RG: ${rg}` })
    }
  }

  return (
    <div className="card flex flex-col">

      {/* Header */}
      <div className="flex items-start justify-between mb-1 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-orange-400" />
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Waste by Resource Group
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {onBarClick
              ? activeRG ? '✓ Filtering table — click again to clear' : 'Click a bar to filter table'
              : `Top ${chartData.length} RGs by potential monthly savings`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-orange-400 tabular-nums leading-none">{fmtShort(totalWaste)}</p>
          <p className="text-xs text-gray-600 mt-0.5">total/mo</p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: Math.max(180, chartData.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 60, left: 140, bottom: 4 }}
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
              dataKey="rg"
              tick={<RGTick />}
              axisLine={false}
              tickLine={false}
              width={136}
            />
            <Tooltip content={<RGTooltip />} cursor={{ fill: '#1f2937', opacity: 0.6 }} />
            <Bar dataKey="waste" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((d) => (
                <Cell
                  key={d.rg}
                  fill={LABEL_COLOR[d.worstLabel] ?? '#6b7280'}
                  fillOpacity={activeRG && activeRG !== d.rg ? 0.3 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — worst status colours */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-800/60">
        {Object.entries(LABEL_COLOR).map(([label, color]) => (
          <span key={label} className={`text-xs px-2 py-0.5 rounded-md border ${LABEL_BG[label]}`}>
            {DISPLAY_LABEL[label] ?? label}
          </span>
        ))}
        <span className="text-xs text-gray-700 ml-1 self-center">= worst resource status in that RG</span>
      </div>

    </div>
  )
}
