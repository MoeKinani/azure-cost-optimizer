import React, { useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Label,
} from 'recharts'

import { SCORE_HEX as SCORE_COLOR } from '../scoreColors'

function CustomDot(props) {
  const { cx, cy, payload, onDotClick } = props
  const color = SCORE_COLOR[payload.score_label] ?? '#6b7280'
  const r = Math.max(4, Math.min(12, Math.sqrt(payload.cost) * 0.8))
  return (
    <circle
      cx={cx} cy={cy} r={r}
      fill={color} fillOpacity={0.7}
      stroke={color} strokeWidth={1}
      style={onDotClick ? { cursor: 'pointer' } : undefined}
      onClick={onDotClick ? (e) => { e.stopPropagation(); onDotClick(payload) } : undefined}
    />
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl max-w-[220px]">
      <p className="font-semibold text-white truncate">{d.name}</p>
      <p className="text-gray-400 mt-0.5">{d.type}</p>
      <div className="mt-2 space-y-0.5">
        <p className="text-gray-300">Cost: <span className="text-white">${d.cost.toFixed(2)}/mo</span></p>
        <p className="text-gray-300">Util: <span className="text-white">{d.util != null ? d.util.toFixed(1) + '%' : '—'}</span></p>
        <p className="text-gray-300">Score: <span style={{ color: SCORE_COLOR[d.score_label] }}>{d.score_label}</span></p>
      </div>
    </div>
  )
}

export default function WasteQuadrant({ resources = [], onResourceClick }) {
  const [hoveredQuad, setHoveredQuad] = useState(null)  // eslint-disable-line

  const data = resources
    .filter(r => r.cost_current_month > 0)
    .map(r => ({
      resource_id: r.resource_id,
      name:        r.resource_name,
      type:        r.resource_type.split('/').pop(),
      cost:        r.cost_current_month,
      util:        r.primary_utilization_pct ?? 0,
      score_label: r.score_label,
    }))

  if (!data.length) return null

  const maxCost = Math.max(...data.map(d => d.cost)) * 1.1
  const MID_UTIL = 30  // X split: low vs high utilisation
  const MID_COST = maxCost / 2

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Waste Quadrant</h2>
          <p className="text-xs text-gray-600 mt-0.5">High cost + low utilisation = immediate action</p>
        </div>
        <div className="flex gap-3 text-xs">
          {Object.entries(SCORE_COLOR).map(([label, color]) => (  // eslint-disable-line
            <span key={label} className="flex items-center gap-1 text-gray-500">
              <span style={{ background: color }} className="w-2 h-2 rounded-full inline-block" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

          <XAxis
            type="number" dataKey="util" name="Utilisation" domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false}
          >
            <Label value="Utilisation %" position="insideBottom" offset={-15} fill="#4b5563" fontSize={11} />
          </XAxis>

          <YAxis
            type="number" dataKey="cost" name="Cost" domain={[0, maxCost]}
            tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false}
            tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
          >
            <Label value="Cost/mo" angle={-90} position="insideLeft" offset={15} fill="#4b5563" fontSize={11} />
          </YAxis>

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#374151' }} />

          {/* Quadrant lines */}
          <ReferenceLine x={MID_UTIL} stroke="#374151" strokeDasharray="4 4" />
          <ReferenceLine y={MID_COST} stroke="#374151" strokeDasharray="4 4" />

          <Scatter
            data={data}
            shape={(props) => <CustomDot {...props} onDotClick={onResourceClick} />}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Quadrant labels */}
      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
        <div className="p-2 rounded bg-red-900/20 border border-red-900/30 text-center">
          <p className="text-red-400 font-semibold">Top-Left: Waste Zone</p>
          <p className="text-gray-600">High cost, low utilisation</p>
        </div>
        <div className="p-2 rounded bg-green-900/20 border border-green-900/30 text-center">
          <p className="text-green-400 font-semibold">Top-Right: Efficient</p>
          <p className="text-gray-600">High cost, high utilisation</p>
        </div>
        <div className="p-2 rounded bg-blue-900/20 border border-blue-900/30 text-center">
          <p className="text-blue-400 font-semibold">Bottom-Left: Candidate</p>
          <p className="text-gray-600">Low cost, low utilisation</p>
        </div>
        <div className="p-2 rounded bg-gray-800/60 border border-gray-700 text-center">
          <p className="text-gray-400 font-semibold">Bottom-Right: Fine</p>
          <p className="text-gray-600">Low cost, well-used</p>
        </div>
      </div>
    </div>
  )
}
