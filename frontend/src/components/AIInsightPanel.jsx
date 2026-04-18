import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import clsx from 'clsx'

const PROVIDER_LABEL = {
  claude:       'Claude AI',
  azure_openai: 'Azure OpenAI',
}

export default function AIInsightPanel({ narrative, provider, aiEnabled }) {
  const [collapsed, setCollapsed] = useState(false)

  if (!aiEnabled || !narrative) return null

  return (
    <div className={clsx(
      'rounded-xl border bg-gradient-to-r from-indigo-950/60 to-purple-950/40',
      'border-indigo-800/40 p-4 transition-all',
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="p-1.5 rounded-lg bg-indigo-900/60 border border-indigo-700/40">
            <Brain size={15} className="text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                AI Summary
              </span>
              <span className="flex items-center gap-1 text-xs text-indigo-500">
                <Sparkles size={10} />
                {PROVIDER_LABEL[provider] || 'AI'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-indigo-600 hover:text-indigo-400 transition-colors shrink-0 mt-0.5"
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <p className="mt-3 text-sm text-indigo-100/80 leading-relaxed">
          {narrative}
        </p>
      )}
    </div>
  )
}
