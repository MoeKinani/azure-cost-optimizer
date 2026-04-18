import React from 'react'
import { Tag } from 'lucide-react'

const REQUIRED_TAGS = ['owner', 'environment', 'project', 'cost-center']

// ── Circular compliance gauge (SVG, no recharts dependency) ───────────────────

function ComplianceRing({ pct, size = 100 }) {
  const cx = size / 2
  const cy = size / 2
  const r  = (size / 2) - 9
  const circumference = 2 * Math.PI * r
  const dashOffset    = circumference * (1 - Math.min(pct, 100) / 100)
  const color =
    pct >= 90 ? '#22c55e' :
    pct >= 70 ? '#eab308' :
    pct >= 50 ? '#f97316' : '#ef4444'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={9} />
      {/* Fill */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Centre labels */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="white"
        fontSize={20} fontWeight={700} fontFamily="inherit">
        {pct.toFixed(0)}%
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fill="#6b7280"
        fontSize={9} fontFamily="inherit">
        compliant
      </text>
    </svg>
  )
}

// ── Per-tag bar row ───────────────────────────────────────────────────────────

function TagRow({ tag, pct, missing }) {
  const color =
    pct >= 90 ? '#22c55e' :
    pct >= 70 ? '#eab308' :
    pct >= 50 ? '#f97316' : '#ef4444'

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400 font-mono">{tag}</span>
        <span className="tabular-nums text-gray-500">
          {missing > 0 ? `${missing} missing` : 'all tagged'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs tabular-nums w-9 text-right font-medium" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TagCompliance({ resources = [], tagCompliancePct = 100, totalUntagged = 0 }) {
  const untagged = resources.filter(r => r.missing_tags?.length > 0)

  const tagStats = REQUIRED_TAGS.map(tag => {
    const missing = resources.filter(r => r.missing_tags?.includes(tag)).length
    const pct = resources.length > 0 ? ((resources.length - missing) / resources.length) * 100 : 100
    return { tag, missing, pct }
  })

  return (
    <div className="card flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Tag size={15} className="text-purple-400" />
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex-1">
          Tag Compliance
        </h2>
        {totalUntagged > 0 && (
          <span className="text-xs text-gray-600 bg-gray-800/60 px-2 py-0.5 rounded-full">
            {totalUntagged} untagged
          </span>
        )}
      </div>

      {/* Ring + per-tag bars */}
      <div className="flex gap-5 items-start">

        {/* Gauge */}
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <ComplianceRing pct={tagCompliancePct} />
          <p className="text-xs text-gray-600 text-center leading-tight">
            {resources.length} resources<br />
            {totalUntagged > 0 ? `${totalUntagged} untagged` : 'fully tagged'}
          </p>
        </div>

        {/* Tag bars */}
        <div className="flex-1 space-y-3 pt-1">
          {tagStats.map(({ tag, missing, pct }) => (
            <TagRow key={tag} tag={tag} pct={pct} missing={missing} />
          ))}
        </div>
      </div>

      {/* Violation list */}
      {untagged.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-gray-800/60">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Untagged Resources
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {untagged.slice(0, 10).map(r => (
              <div
                key={r.resource_id}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800/40 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-xs text-gray-300 truncate font-medium">{r.resource_name}</p>
                  <p className="text-xs text-gray-600 truncate">{r.resource_group}</p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end shrink-0">
                  {r.missing_tags?.map(t => (
                    <span
                      key={t}
                      className="text-xs px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {untagged.length > 10 && (
              <p className="text-xs text-gray-600 text-center pt-1">
                +{untagged.length - 10} more
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-green-400 text-sm text-center py-4 mt-4">
          All resources are fully tagged
        </p>
      )}

    </div>
  )
}
