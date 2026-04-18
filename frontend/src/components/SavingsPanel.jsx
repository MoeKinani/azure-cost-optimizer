import React, { useState } from 'react'
import { TrendingDown, ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

function fmtShort(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function fmtFull(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const PRIORITY_STYLE = {
  High:   { badge: 'bg-red-900/40 text-red-400 border-red-800/50',    bar: 'bg-red-500'    },
  Medium: { badge: 'bg-orange-900/40 text-orange-400 border-orange-800/50', bar: 'bg-orange-500' },
  Low:    { badge: 'bg-blue-900/40 text-blue-400 border-blue-800/50',  bar: 'bg-blue-500'   },
}

export default function SavingsPanel({ recommendations }) {
  const [expanded, setExpanded] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState('')

  if (!recommendations?.length) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={15} className="text-green-400" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Savings Opportunities
          </h2>
        </div>
        <p className="text-green-400 text-sm">No savings opportunities found.</p>
      </div>
    )
  }

  const filtered = priorityFilter
    ? recommendations.filter((r) => r.priority === priorityFilter)
    : recommendations

  const totalSavings = filtered.reduce((s, r) => s + r.estimated_monthly_savings, 0)
  const maxSavings   = Math.max(...filtered.map(r => r.estimated_monthly_savings), 0.01)

  const priorityCounts = {
    High:   recommendations.filter(r => r.priority === 'High').length,
    Medium: recommendations.filter(r => r.priority === 'Medium').length,
    Low:    recommendations.filter(r => r.priority === 'Low').length,
  }

  return (
    <div className="card">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between mb-3"
      >
        <div className="flex items-center gap-2">
          <TrendingDown size={15} className="text-green-400" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Savings Opportunities
          </h2>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-green-900/50 text-green-400 font-semibold">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-base font-bold text-green-400 tabular-nums">{fmtShort(totalSavings)}</span>
            <span className="text-xs text-gray-600 ml-1">/mo</span>
          </div>
          {expanded
            ? <ChevronDown size={15} className="text-gray-600" />
            : <ChevronRight size={15} className="text-gray-600" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* Priority filter tabs */}
          <div className="flex gap-1.5 mb-3">
            {[['', 'All', recommendations.length], ['High', 'High', priorityCounts.High], ['Medium', 'Medium', priorityCounts.Medium], ['Low', 'Low', priorityCounts.Low]].map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setPriorityFilter(val)}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  priorityFilter === val
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                )}
              >
                {label}
                {count > 0 && (
                  <span className={clsx('text-[10px] tabular-nums', priorityFilter === val ? 'text-blue-200' : 'text-gray-600')}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtered.map((r) => {
              const ps = PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.Low
              const barWidth = maxSavings > 0 ? (r.estimated_monthly_savings / maxSavings) * 100 : 0
              return (
                <div
                  key={r.resource_id}
                  className="p-3 bg-gray-800/70 rounded-lg border border-gray-700/60 hover:border-gray-600 transition-colors"
                >
                  {/* Top row: name + savings */}
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate" title={r.resource_name}>
                        {r.resource_name}
                      </p>
                      <p className="text-xs text-gray-300 mt-0.5 truncate">
                        {r.resource_type.split('/').pop()} · {r.resource_group}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-400 tabular-nums">
                        {fmtShort(r.estimated_monthly_savings)}<span className="text-xs text-green-700">/mo</span>
                      </p>
                      <p className="text-xs text-gray-500 tabular-nums">{fmtFull(r.current_monthly_cost)} now</p>
                    </div>
                  </div>

                  {/* Recommendation text — full width under resource name */}
                  <p className="text-sm text-white leading-relaxed mt-1.5" title={r.recommendation}>
                    {r.recommendation}
                  </p>

                  {/* Savings bar */}
                  <div className="my-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600 rounded-full" style={{ width: `${barWidth}%` }} />
                  </div>

                  {/* Bottom row: priority + savings % */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={clsx('shrink-0 text-xs px-1.5 py-0.5 rounded border font-medium', ps.badge)}>
                      {r.priority}
                    </span>
                    <span className="shrink-0 text-xs text-green-500 tabular-nums font-semibold">
                      -{r.savings_pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer total */}
          <div className="mt-3 pt-2.5 border-t border-gray-800/60 flex items-center justify-between text-xs">
            <span className="text-gray-600">{filtered.length} opportunities</span>
            <span className="text-gray-500">
              Total: <span className="text-green-400 font-semibold tabular-nums">{fmtShort(totalSavings)}/mo</span>
              <span className="text-gray-700 ml-1">· {fmtShort(totalSavings * 12)}/yr</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
