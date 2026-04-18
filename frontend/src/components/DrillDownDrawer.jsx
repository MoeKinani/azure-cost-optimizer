import React, { useMemo, useState } from 'react'
import {
  X, ExternalLink, Copy, Check, Flame, DollarSign, Brain,
  Lightbulb, Leaf, Tag, Target, TrendingDown, AlertTriangle,
  Filter, Download, Cpu, HardDrive, Database, Shield, Server,
  ChevronDown, ChevronRight, Terminal, Navigation, Lock,
} from 'lucide-react'
import clsx from 'clsx'
import { SCORE_HEX, SCORE_TEXT_CLASS } from '../scoreColors'

// ── Shared constants ──────────────────────────────────────────────────────────

const CATEGORY_STYLE = {
  compute:        { bg: 'bg-blue-900/40',   text: 'text-blue-300',   border: 'border-blue-800/50',   icon: Cpu       },
  storage:        { bg: 'bg-amber-900/40',  text: 'text-amber-300',  border: 'border-amber-800/50',  icon: HardDrive },
  data:           { bg: 'bg-purple-900/40', text: 'text-purple-300', border: 'border-purple-800/50', icon: Database  },
  ai:             { bg: 'bg-indigo-900/40', text: 'text-indigo-300', border: 'border-indigo-800/50', icon: Brain     },
  infrastructure: { bg: 'bg-slate-800/60',  text: 'text-slate-400',  border: 'border-slate-700/50',  icon: Shield    },
  other:          { bg: 'bg-gray-800/60',   text: 'text-gray-400',   border: 'border-gray-700/50',   icon: Server    },
}

const DISPLAY_LABEL = {
  'Not Used':    'Confirmed Waste',
  'Rarely Used': 'Likely Waste',
}

const SCORE_COLOR = SCORE_TEXT_CLASS
const SCORE_DOT   = SCORE_HEX

// ── Drill type configuration ──────────────────────────────────────────────────

const DRILL_TYPES = {
  waste: {
    title:    'Waste Resources',
    subtitle: 'Running but not being used — immediate action candidates',
    icon:     Flame,
    color:    'text-orange-400',
    accent:   'border-orange-700/40',
    filter:   r => r.score_label === 'Not Used' || r.is_orphan,
    sort:     (a, b) => b.cost_current_month - a.cost_current_month,
    keyCol:   r => ({ label: 'Cost/mo', value: `$${r.cost_current_month.toFixed(2)}`, cls: 'text-orange-300 font-bold' }),
    subCol:   r => r.is_orphan ? { label: 'Orphaned', cls: 'text-orange-500' } : { label: DISPLAY_LABEL[r.score_label] ?? r.score_label, cls: 'text-red-400' },
  },
  savings: {
    title:    'Savings Opportunities',
    subtitle: 'Resources with confirmed savings potential',
    icon:     TrendingDown,
    color:    'text-green-400',
    accent:   'border-green-700/40',
    filter:   r => (r.estimated_monthly_savings ?? 0) > 0,
    sort:     (a, b) => b.estimated_monthly_savings - a.estimated_monthly_savings,
    keyCol:   r => ({ label: 'Save/mo', value: `$${r.estimated_monthly_savings.toFixed(2)}`, cls: 'text-green-400 font-bold' }),
    subCol:   r => ({ label: r.recommendation || r.ai_action || '', cls: 'text-gray-500' }),
  },
  advisor: {
    title:    'Azure Advisor Alerts',
    subtitle: 'Resources with open Advisor recommendations',
    icon:     Lightbulb,
    color:    'text-yellow-400',
    accent:   'border-yellow-700/40',
    filter:   r => r.advisor_recommendations?.length > 0,
    sort:     (a, b) => b.advisor_recommendations.length - a.advisor_recommendations.length,
    keyCol:   r => ({ label: 'Alerts', value: r.advisor_recommendations.length, cls: 'text-yellow-400 font-bold' }),
    subCol:   r => {
      const high = r.advisor_recommendations.filter(a => a.impact === 'High').length
      return high > 0 ? { label: `${high} High impact`, cls: 'text-red-400' } : { label: 'Medium/Low', cls: 'text-gray-500' }
    },
  },
  ai: {
    title:    'AI-Reviewed Resources',
    subtitle: 'Resources with AI analysis and recommendations',
    icon:     Brain,
    color:    'text-indigo-400',
    accent:   'border-indigo-700/40',
    filter:   r => !!r.ai_explanation,
    sort:     (a, b) => (b.estimated_monthly_savings ?? 0) - (a.estimated_monthly_savings ?? 0),
    keyCol:   r => ({ label: 'AI action', value: r.ai_action || 'monitor', cls: 'text-indigo-300 font-medium' }),
    subCol:   r => ({ label: r.ai_confidence ? `${r.ai_confidence} confidence` : '', cls: r.ai_confidence === 'high' ? 'text-indigo-400' : 'text-gray-500' }),
  },
  untagged: {
    title:    'Untagged Resources',
    subtitle: 'Resources missing required tags — cost allocation blind spots',
    icon:     Tag,
    color:    'text-amber-400',
    accent:   'border-amber-700/40',
    filter:   r => r.missing_tags?.length > 0,
    sort:     (a, b) => b.cost_current_month - a.cost_current_month,
    keyCol:   r => ({ label: 'Missing', value: r.missing_tags.length + ' tags', cls: 'text-amber-400 font-bold' }),
    subCol:   r => ({ label: r.missing_tags.slice(0, 3).join(', '), cls: 'text-gray-500' }),
  },
  carbon: {
    title:    'Carbon Footprint',
    subtitle: 'Resources ranked by estimated CO₂ emissions',
    icon:     Leaf,
    color:    'text-green-500',
    accent:   'border-green-700/40',
    filter:   r => (r.carbon_kg_per_month ?? 0) > 0,
    sort:     (a, b) => b.carbon_kg_per_month - a.carbon_kg_per_month,
    keyCol:   r => ({ label: 'CO₂/mo', value: `${r.carbon_kg_per_month.toFixed(1)} kg`, cls: 'text-green-400 font-bold' }),
    subCol:   r => ({ label: `≈${(r.carbon_kg_per_month / 21).toFixed(2)} trees/yr`, cls: 'text-gray-500' }),
  },
  grade: {
    title:    'Resource Health',
    subtitle: 'All resources sorted by efficiency score',
    icon:     Target,
    color:    'text-purple-400',
    accent:   'border-purple-700/40',
    filter:   r => !r.is_infrastructure,
    sort:     (a, b) => a.final_score - b.final_score,
    keyCol:   r => ({ label: 'Score', value: r.final_score.toFixed(0), cls: SCORE_COLOR[r.score_label] + ' font-bold' }),
    subCol:   r => ({ label: DISPLAY_LABEL[r.score_label] ?? r.score_label, cls: SCORE_COLOR[r.score_label] }),
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(n) {
  if (!n) return '$0'
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function TypeBadge({ resourceType, category }) {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other
  const Icon  = style.icon
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-medium shrink-0',
      style.bg, style.text, style.border,
    )} title={resourceType}>
      <Icon size={9} className="shrink-0" />
      {resourceType.split('/').pop()}
    </span>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-700 transition-colors"
      title="Copy CLI command">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  )
}

function ScoreBar({ score, label }) {
  const color = SCORE_DOT[label] ?? '#6b7280'
  return (
    <div className="flex items-center gap-1.5 w-20">
      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div style={{ width: `${score}%`, backgroundColor: color }} className="h-full rounded-full" />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-5 text-right">{score.toFixed(0)}</span>
    </div>
  )
}

// ── Resource row ──────────────────────────────────────────────────────────────

function ResourceRow({ resource, config, expanded, onToggle, showStepCount }) {
  const key = config.keyCol(resource)
  const sub = config.subCol(resource)
  const hasSteps = resource.safe_action_steps?.length > 0

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/40 transition-colors group',
        hasSteps ? 'cursor-pointer hover:bg-gray-800/60' : 'hover:bg-gray-800/40',
        expanded && 'bg-gray-800/50 border-b-0',
      )}
      onClick={hasSteps ? onToggle : undefined}
    >
      {/* Expand chevron */}
      {hasSteps ? (
        <div className="shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors">
          {expanded
            ? <ChevronDown size={13} />
            : <ChevronRight size={13} />}
        </div>
      ) : (
        <div className="w-3.5 shrink-0" />
      )}

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-200 truncate" title={resource.resource_name}>
          {resource.resource_name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <TypeBadge resourceType={resource.resource_type} category={resource.resource_category || 'other'} />
          {resource.has_lock && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs bg-sky-900/40 text-sky-300 border-sky-800/50 shrink-0"
              title="Resource lock — intentionally protected, not flagged as unused">
              <Lock size={9} />Protected
            </span>
          )}
          <span className="text-xs text-gray-700 truncate">{resource.resource_group}</span>
          {showStepCount && hasSteps && !expanded && (
            <span className="text-xs text-blue-600 hover:text-blue-400 transition-colors ml-1">
              {resource.safe_action_steps.length}-step plan
            </span>
          )}
        </div>
      </div>

      {/* Key metric */}
      <div className="text-right shrink-0 max-w-[160px]">
        <p className={clsx('text-xs tabular-nums', key.cls)}>{key.value}</p>
        <p className={clsx('text-xs mt-0.5 truncate', sub.cls)} title={sub.label}>{sub.label}</p>
      </div>

      {/* Score bar */}
      {!resource.is_infrastructure && (
        <ScoreBar score={resource.final_score} label={resource.score_label} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}>
        {resource.cli_delete_cmd && <CopyButton text={resource.cli_delete_cmd} />}
        {resource.portal_url && (
          <a href={resource.portal_url} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-gray-700 transition-colors"
            title="Open in Azure Portal">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}

// ── AI explanation expand ─────────────────────────────────────────────────────

function AIRow({ resource }) {
  if (!resource.ai_explanation) return null
  return (
    <div className="px-4 pb-2.5 -mt-1">
      <p className="text-xs text-indigo-400/80 bg-indigo-900/20 border border-indigo-800/30 rounded-md px-2.5 py-1.5 leading-relaxed">
        {resource.ai_explanation}
      </p>
    </div>
  )
}

// ── Safe action steps panel ───────────────────────────────────────────────────

const PHASE_STYLE = {
  immediate: { bg: 'bg-orange-900/40', text: 'text-orange-300', border: 'border-orange-700/40', dot: 'bg-orange-500', label: 'Act Now' },
  verify:    { bg: 'bg-blue-900/40',   text: 'text-blue-300',   border: 'border-blue-700/40',   dot: 'bg-blue-500',   label: 'Check First' },
  tag:       { bg: 'bg-purple-900/40', text: 'text-purple-300', border: 'border-purple-700/40', dot: 'bg-purple-500', label: 'Tag It' },
  wait:      { bg: 'bg-amber-900/40',  text: 'text-amber-300',  border: 'border-amber-700/40',  dot: 'bg-amber-500',  label: 'Wait' },
  delete:    { bg: 'bg-red-900/40',    text: 'text-red-300',    border: 'border-red-700/40',    dot: 'bg-red-500',    label: 'Delete' },
}

function StepCopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors shrink-0"
      title="Copy">
      {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ActionStepsPanel({ steps }) {
  if (!steps || steps.length === 0) return null
  return (
    <div className="mx-4 mb-3 rounded-lg border border-gray-700/50 overflow-hidden bg-gray-900/60">
      <div className="px-3 py-2 border-b border-gray-700/40 flex items-center gap-1.5">
        <Navigation size={11} className="text-blue-400" />
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Recommended Action Plan</span>
      </div>
      <div className="divide-y divide-gray-800/60">
        {steps.map((step) => {
          const ph = PHASE_STYLE[step.phase] ?? PHASE_STYLE.immediate
          return (
            <div key={step.step} className="px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                {/* Step number + phase badge stacked */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                    ph.bg, ph.text, `border ${ph.border}`,
                  )}>
                    {step.step}
                  </div>
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border whitespace-nowrap',
                    ph.bg, ph.text, ph.border,
                  )}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', ph.dot)} />
                    {ph.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.detail}</p>
                  {step.portal_path && (
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <Navigation size={9} className="text-blue-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-blue-400/80 font-mono leading-relaxed flex-1">{step.portal_path}</span>
                      <StepCopyButton text={step.portal_path} />
                    </div>
                  )}
                  {step.az_cli && (
                    <div className="mt-1 flex items-start gap-1.5 bg-gray-950/60 rounded px-2 py-1">
                      <Terminal size={9} className="text-green-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-green-400/80 font-mono leading-relaxed flex-1 break-all">{step.az_cli}</span>
                      <StepCopyButton text={step.az_cli} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportCSV(resources, title) {
  const cols = ['resource_name', 'resource_type', 'resource_group', 'location',
                'score_label', 'final_score', 'cost_current_month',
                'estimated_monthly_savings', 'ai_action', 'recommendation']
  const rows = [cols.join(',')]
  for (const r of resources) {
    rows.push(cols.map(c => {
      const v = r[c]
      if (v === null || v === undefined) return ''
      if (typeof v === 'string' && v.includes(',')) return `"${v}"`
      return v
    }).join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export default function DrillDownDrawer({
  type,           // drill type key, or null to close
  resources = [],
  savingsRecs = [],
  onClose,
  onApplyTableFilter,   // ({ field, value, label }) => void
}) {
  const cfg = DRILL_TYPES[type]
  const [expandedId, setExpandedId] = useState(null)

  // Reset expanded row when switching drill type
  React.useEffect(() => { setExpandedId(null) }, [type])

  const drillResources = useMemo(() => {
    if (!cfg || !resources.length) return []
    return resources.filter(cfg.filter).sort(cfg.sort)
  }, [resources, type, cfg])

  const totalCost    = useMemo(() => drillResources.reduce((s, r) => s + r.cost_current_month, 0), [drillResources])
  const totalSavings = useMemo(() => drillResources.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0), [drillResources])

  // Which field/value to use for table filter
  const tableFilterMap = {
    waste:    { field: 'score_label', value: 'Not Used',     label: 'Confirmed Waste resources' },
    savings:  null,
    advisor:  null,
    ai:       null,
    untagged: null,
    carbon:   null,
    grade:    null,
  }

  if (!type || !cfg) return null

  const Icon = cfg.icon

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={clsx(
        'fixed right-0 top-0 bottom-0 z-50 w-[480px] max-w-full',
        'bg-gray-950 border-l border-gray-800/60 flex flex-col',
        'shadow-2xl',
        'animate-slide-in-right',
      )}>

        {/* Header */}
        <div className={clsx('border-b border-gray-800/60 px-5 py-4', cfg.accent && `border-l-2 ${cfg.accent}`)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gray-800">
                <Icon size={16} className={cfg.color} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">{cfg.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{cfg.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Summary stats */}
          <div className="flex gap-4 mt-4">
            <div className="flex-1 bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-800/40">
              <p className="text-xs text-gray-500">Resources</p>
              <p className="text-xl font-bold text-white tabular-nums">{drillResources.length}</p>
            </div>
            <div className="flex-1 bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-800/40">
              <p className="text-xs text-gray-500">Total Cost/mo</p>
              <p className="text-xl font-bold text-blue-400 tabular-nums">{fmtShort(totalCost)}</p>
            </div>
            {totalSavings > 0 && (
              <div className="flex-1 bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-800/40">
                <p className="text-xs text-gray-500">Savings/mo</p>
                <p className="text-xl font-bold text-green-400 tabular-nums">{fmtShort(totalSavings)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-800/40 bg-gray-900/30">
          <button
            onClick={() => exportCSV(drillResources, cfg.title)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 transition-colors"
          >
            <Download size={11} />
            Export CSV
          </button>
          {tableFilterMap[type] && onApplyTableFilter && (
            <button
              onClick={() => {
                onApplyTableFilter(tableFilterMap[type])
                onClose()
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-900/40 hover:bg-blue-900/60 text-xs text-blue-400 hover:text-blue-300 border border-blue-800/40 transition-colors"
            >
              <Filter size={11} />
              View in Table
            </button>
          )}
          <span className="ml-auto text-xs text-gray-600">
            {drillResources.length} result{drillResources.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Resource list */}
        <div className="flex-1 overflow-y-auto">
          {drillResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <Icon size={24} className="text-gray-700" />
              <p className="text-sm text-gray-600">No resources found</p>
            </div>
          ) : (
            <>
              {drillResources.map(r => {
                const isExpanded = expandedId === r.resource_id
                const hasSteps   = r.safe_action_steps?.length > 0
                return (
                  <React.Fragment key={r.resource_id}>
                    <ResourceRow
                      resource={r}
                      config={cfg}
                      expanded={isExpanded}
                      showStepCount={hasSteps}
                      onToggle={() => setExpandedId(isExpanded ? null : r.resource_id)}
                    />
                    {type === 'ai' && <AIRow resource={r} />}
                    {hasSteps && isExpanded && (
                      <ActionStepsPanel steps={r.safe_action_steps} />
                    )}
                  </React.Fragment>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800/40 px-5 py-3 text-xs text-gray-700">
          Click a row to expand its step-by-step action plan • Hover for portal link and CLI copy
        </div>
      </div>
    </>
  )
}
