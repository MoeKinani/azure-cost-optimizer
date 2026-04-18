import React, { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowRight, Cpu } from 'lucide-react'
import clsx from 'clsx'

function fmt(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function RightSizePanel({ opportunities = [] }) {
  const [expanded, setExpanded] = useState(true)

  if (!opportunities?.length) return null

  const totalSavings = opportunities.reduce((s, r) => s + r.estimated_savings, 0)

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between mb-3"
      >
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Right-Sizing Opportunities
          </h2>
          <span className="badge bg-blue-900/50 text-blue-400">{opportunities.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Est. <span className="text-green-400 font-semibold">{fmt(totalSavings)}/mo</span>
          </span>
          {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {opportunities.map(r => (
            <div
              key={r.resource_id}
              className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white text-sm truncate">{r.resource_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.resource_type.split('/').pop()} · {r.resource_group}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="badge bg-gray-700 text-gray-300 font-mono">{r.current_sku}</span>
                    <ArrowRight size={12} className="text-gray-600 shrink-0" />
                    <span className="badge bg-blue-900/50 text-blue-400 font-mono">{r.suggested_sku}</span>
                  </div>
                  {r.cpu_pct != null && (
                    <p className="text-xs text-gray-600 mt-1">Avg CPU: {r.cpu_pct.toFixed(1)}%</p>
                  )}
                  {r.reason && (
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.reason}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-400">{fmt(r.estimated_savings)}</p>
                  <p className="text-xs text-gray-500">{r.savings_pct.toFixed(0)}% savings</p>
                  <p className="text-xs text-gray-600 mt-0.5">was {fmt(r.current_cost)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
