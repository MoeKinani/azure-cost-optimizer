import React from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const RADIAN = Math.PI / 180
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-semibold text-white">{d.label}</p>
      <p className="text-gray-300">{d.count} resources</p>
      <p className="text-gray-300">${d.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</p>
    </div>
  )
}

export default function ScoreDonut({ data, onSegmentClick }) {
  if (!data?.length) return null

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Resources by Waste Level
        </h2>
        {onSegmentClick && (
          <span className="text-xs text-gray-600">Click to filter table</span>
        )}
      </div>
      <div className="flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="70%"
              dataKey="count"
              nameKey="label"
              labelLine={false}
              label={renderCustomLabel}
              onClick={onSegmentClick ? (entry) => onSegmentClick(entry.label) : undefined}
              style={onSegmentClick ? { cursor: 'pointer' } : undefined}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-gray-300">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
