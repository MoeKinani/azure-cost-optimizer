import React from 'react'
import { Cloud, CheckCircle, Loader } from 'lucide-react'
import clsx from 'clsx'

const STEP_LABELS = {
  resources: 'Listing resources',
  costs:     'Fetching cost data',
  activity:  'Reading activity logs',
  orphans:   'Detecting orphans',
  metrics:   'Pulling utilisation metrics',
  scoring:   'Scoring resources',
  ai:        'Running AI analysis',
  assemble:  'Assembling dashboard',
}

export default function ProgressOverlay({ steps = [], currentPct = 0, currentMessage = '' }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-sm">
      <div className="w-full max-w-md px-6 space-y-8">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-azure-500/10 rounded-2xl border border-azure-500/20">
            <Cloud size={32} className="text-azure-500 animate-pulse" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Loading Azure Data</h2>
            <p className="text-sm text-gray-500 mt-1">Connecting to Cost Management &amp; Monitor APIs</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{currentMessage || 'Initialising…'}</span>
            <span>{currentPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-azure-500 rounded-full transition-all duration-500"
              style={{ width: `${currentPct}%` }}
            />
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-2">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
            const done    = steps.includes(key)
            const active  = !done && currentMessage.toLowerCase().includes(label.toLowerCase().split(' ')[0])
            return (
              <div key={key} className={clsx(
                'flex items-center gap-3 text-sm transition-colors',
                done   && 'text-gray-400',
                active && 'text-white',
                !done && !active && 'text-gray-700',
              )}>
                {done ? (
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                ) : active ? (
                  <Loader size={14} className="text-azure-400 shrink-0 animate-spin" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-gray-700 shrink-0" />
                )}
                <span>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
