import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-white mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || p.color }} className="text-xs">
          {p.name}: ${Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
      ))}
    </div>
  )
}

function fmtK(v) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

export default function CostByTypeBar({ data, onBarClick }) {
  const [showPrev,     setShowPrev]     = useState(true)
  const [activeBar,    setActiveBar]    = useState(null)

  if (!data?.length) return null

  const chartData = data.slice(0, 12).map((d) => ({
    name:          d.display_name,
    resource_type: d.resource_type,
    'This Month':  d.cost_current_month,
    'Last Month':  d.cost_previous_month,
  }))

  function handleBarClick(entry) {
    if (!onBarClick) return
    const rt = entry?.resource_type
    if (!rt) return
    if (activeBar === rt) {
      setActiveBar(null)
      onBarClick(null)
    } else {
      setActiveBar(rt)
      onBarClick({ field: 'resource_type', value: rt, label: entry.name })
    }
  }

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Cost by Resource Type
          </h2>
          {onBarClick && (
            <p className="text-xs text-gray-600 mt-0.5">
              {activeBar ? '✓ Filtering table — click again to clear' : 'Click a bar to filter table'}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowPrev((v) => !v)}
          className="btn-ghost text-xs"
        >
          {showPrev ? 'Hide' : 'Show'} Last Month
        </button>
      </div>
      {/* U15: billing lag note — current month bars always understate true spend */}
      <p className="text-xs text-amber-600/70 mb-3 flex items-center gap-1.5">
        <span>⏳</span>
        <span>
          <strong className="text-amber-500/80">This Month</strong> bars are partial — Azure billing settles 3-5 days after costs are incurred, so current figures are lower than the final monthly total.
        </span>
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={fmtK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '8px', fontSize: '12px', color: '#9ca3af' }}
            />
            <Bar
              dataKey="This Month"
              radius={[4, 4, 0, 0]}
              onClick={handleBarClick}
              style={onBarClick ? { cursor: 'pointer' } : undefined}
              opacity={0.75}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.resource_type}
                  fill={activeBar === entry.resource_type ? '#38bdf8' : '#0078d4'}
                  fillOpacity={activeBar && activeBar !== entry.resource_type ? 0.4 : 1}
                />
              ))}
            </Bar>
            {showPrev && (
              <Bar dataKey="Last Month" fill="#374151" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
