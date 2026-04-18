import React from 'react'
import { Layers, FolderOpen, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

function RGSelect({ value, onChange, options }) {
  return (
    <div className="relative flex items-center">
      <FolderOpen size={13} className="absolute left-2.5 text-gray-500 pointer-events-none" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'appearance-none pl-7 pr-7 py-1.5 rounded-lg text-xs font-medium',
          'bg-gray-800/80 border border-gray-700/60 text-gray-300',
          'hover:border-gray-600 focus:outline-none focus:border-blue-500/60',
          'transition-colors cursor-pointer',
          value && 'border-blue-500/50 text-white bg-blue-900/20',
        )}
      >
        <option value="">All resource groups</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 text-gray-500 pointer-events-none" />
    </div>
  )
}

function SubBadge({ sub }) {
  const name = sub.subscription_name || null
  const shortId = sub.subscription_id
    ? `${sub.subscription_id.slice(0, 8)}…${sub.subscription_id.slice(-4)}`
    : ''

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50">
      <Layers size={13} className="text-blue-400 shrink-0" />
      <div className="flex flex-col leading-tight">
        {name
          ? <span className="text-xs font-semibold text-white">{name}</span>
          : <span className="text-xs font-semibold text-gray-300 font-mono">{shortId}</span>
        }
        <div className="flex items-center gap-1.5">
          {name && <span className="text-[10px] text-gray-500 font-mono">{shortId}</span>}
          {name && <span className="text-gray-700">·</span>}
          <span className="text-[10px] text-green-500 font-medium">${sub.cost_current?.toFixed(2)}/mo</span>
          <span className="text-gray-700">·</span>
          <span className="text-[10px] text-gray-500">{sub.resource_count} resources</span>
        </div>
      </div>
    </div>
  )
}

function SubSelect({ value, onChange, subscriptions }) {
  const options = subscriptions.map(s => {
    const name = s.subscription_name || s.subscription_id.slice(0, 8) + '…'
    const shortId = s.subscription_id.slice(0, 8) + '…'
    return {
      value: s.subscription_id,
      label: `${name}  ·  ${shortId}  ·  $${s.cost_current.toFixed(2)}/mo`,
    }
  })

  return (
    <div className="relative flex items-center">
      <Layers size={13} className="absolute left-2.5 text-blue-400 pointer-events-none" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'appearance-none pl-7 pr-7 py-1.5 rounded-lg text-xs font-medium',
          'bg-gray-800/80 border border-gray-700/60 text-gray-300',
          'hover:border-gray-600 focus:outline-none focus:border-blue-500/60',
          'transition-colors cursor-pointer',
          value && 'border-blue-500/50 text-white bg-blue-900/20',
        )}
      >
        <option value="">All {subscriptions.length} subscriptions</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 text-gray-500 pointer-events-none" />
    </div>
  )
}

export default function FilterBar({
  subscriptions = [],
  resourceGroups = [],
  selectedSubscription,
  selectedResourceGroup,
  onSubscriptionChange,
  onResourceGroupChange,
}) {
  if (!subscriptions.length && !resourceGroups.length) return null

  const rgOptions = resourceGroups.map(rg => ({ value: rg, label: rg }))
  const hasFilter = selectedSubscription || selectedResourceGroup

  return (
    <div className="border-b border-gray-800/60 bg-gray-900/40 px-6 py-2">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-600 font-medium uppercase tracking-wider">Filter:</span>

        {subscriptions.length === 1 && (
          <SubBadge sub={subscriptions[0]} />
        )}

        {subscriptions.length > 1 && (
          <SubSelect
            value={selectedSubscription || ''}
            onChange={onSubscriptionChange}
            subscriptions={subscriptions}
          />
        )}

        {resourceGroups.length > 0 && (
          <RGSelect
            value={selectedResourceGroup || ''}
            onChange={onResourceGroupChange}
            options={rgOptions}
          />
        )}

        {hasFilter && (
          <button
            onClick={() => {
              onSubscriptionChange('')
              onResourceGroupChange('')
            }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-gray-600">
          {subscriptions.length > 1 && (
            <span>
              {subscriptions.reduce((s, x) => s + x.resource_count, 0)} total resources ·{' '}
              <span className="text-gray-400">
                ${subscriptions.reduce((s, x) => s + x.cost_current, 0).toFixed(2)}/mo
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
