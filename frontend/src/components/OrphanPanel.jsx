import React, { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

function fmt(n) {
  if (!n) return '$0'
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_ICONS = {
  'microsoft.compute/disks':               '💽',
  'microsoft.network/publicipaddresses':   '🌐',
  'microsoft.network/networkinterfaces':   '🔌',
  'microsoft.network/networksecuritygroups':'🛡️',
  'microsoft.compute/virtualmachines':     '🖥️',
}

export default function OrphanPanel({ orphans }) {
  const [expanded, setExpanded] = useState(true)

  if (!orphans?.length) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Orphaned Resources
        </h2>
        <p className="text-green-400 text-sm flex items-center gap-2">
          <span>✓</span> No orphaned resources detected.
        </p>
      </div>
    )
  }

  const total = orphans.reduce((s, o) => s + (o.monthly_cost || 0), 0)
  const savings = orphans.reduce((s, o) => s + (o.estimated_savings || 0), 0)

  return (
    <div className="card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between mb-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-400" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Orphaned Resources
          </h2>
          <span className="badge bg-orange-900/50 text-orange-400">{orphans.length}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            Wasted: <span className="text-red-400 font-semibold">{fmt(total)}/mo</span>
          </span>
          <span className="text-gray-500">
            Save: <span className="text-green-400 font-semibold">{fmt(savings)}/mo</span>
          </span>
          {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {orphans.map((o) => (
            <div
              key={o.resource_id}
              className="flex items-start justify-between gap-3 p-3 bg-gray-800/50 rounded-lg border border-orange-900/30 hover:border-orange-800/50 transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-base mt-0.5 shrink-0">
                  {TYPE_ICONS[o.resource_type] || '📦'}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate" title={o.resource_name}>
                    {o.resource_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {o.resource_type.split('/').pop()} · {o.resource_group}
                  </p>
                  <p className="text-xs text-orange-400 mt-0.5">{o.orphan_reason}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-red-400">{fmt(o.monthly_cost)}</p>
                <p className="text-xs text-gray-500">per month</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
