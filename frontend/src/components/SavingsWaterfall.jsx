import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const CATEGORY_COLORS = {
  'Orphaned Resources': '#f97316',
  'Right-Sizing':       '#60a5fa',
  'Reserved Instances': '#a78bfa',
  'Idle Resources':     '#ef4444',
  'Advisor':            '#facc15',
  'Other':              '#6b7280',
}

function buildWaterfallData(recommendations = [], resources = []) {
  const buckets = {}

  for (const r of recommendations) {
    let cat = 'Other'
    const rec = (r.recommendation || '').toLowerCase()
    if (r.priority === 'High' && rec.includes('orphan')) cat = 'Orphaned Resources'
    else if (rec.includes('resize') || rec.includes('downsize')) cat = 'Right-Sizing'
    else if (rec.includes('reserve') || rec.includes('commit')) cat = 'Reserved Instances'
    else if (rec.includes('idle') || rec.includes('shut down')) cat = 'Idle Resources'
    else if (r.advisor_count > 0) cat = 'Advisor'
    buckets[cat] = (buckets[cat] ?? 0) + r.estimated_monthly_savings
  }

  // Add RI savings from resources
  const riSavings = resources.reduce((s, r) => s + (r.ri_1yr_monthly_savings ?? 0), 0)
  if (riSavings > 0) {
    buckets['Reserved Instances'] = (buckets['Reserved Instances'] ?? 0) + riSavings
  }

  return Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-white">{d.payload.name}</p>
      <p className="text-green-400 mt-1">${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</p>
    </div>
  )
}

export default function SavingsWaterfall({ recommendations = [], resources = [] }) {
  const data = buildWaterfallData(recommendations, resources)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (!data.length) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Savings by Category</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Total potential: <span className="text-green-400 font-semibold">${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo</span>
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false}
            tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`}
          />
          <YAxis
            type="category" dataKey="name" width={130}
            tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#6b7280'} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={v => `$${v.toFixed(0)}`}
              style={{ fill: '#9ca3af', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
