import React, { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Layers, Database, Loader, AlertCircle, X, Info } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'

// Collect all subscription IDs under a given MG node (including all descendants)
function collectSubs(mgId, byId, visited = new Set()) {
  if (visited.has(mgId)) return []
  visited.add(mgId)
  const node = byId[mgId]
  if (!node) return []
  const result = node.subscriptions.map(s => s.subscription_id)
  for (const childId of node.child_mg_ids) {
    result.push(...collectSubs(childId, byId, visited))
  }
  return [...new Set(result)]
}

function subCount(mgId, byId) {
  return collectSubs(mgId, byId).length
}

function MgNode({ mg, byId, depth, selectedScopeId, onSelect }) {
  const hasChildren = mg.child_mg_ids.length > 0 || mg.subscriptions.length > 0
  const [expanded, setExpanded] = useState(depth === 0)
  const count = subCount(mg.id, byId)
  const isSelected = selectedScopeId === mg.id

  function handleSelectMg(e) {
    e.stopPropagation()
    const subs = collectSubs(mg.id, byId)
    onSelect({ id: mg.id, name: mg.display_name, subscriptionIds: subs })
  }

  return (
    <div>
      {/* Management group row */}
      <div
        className={clsx(
          'flex items-center gap-1.5 py-1.5 pr-3 rounded-md cursor-pointer text-sm select-none',
          isSelected
            ? 'bg-blue-600/20 text-blue-300'
            : 'hover:bg-gray-700/40 text-gray-300',
        )}
        style={{ paddingLeft: `${10 + depth * 18}px` }}
        onClick={handleSelectMg}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className={clsx(
            'shrink-0 transition-colors',
            hasChildren ? 'text-gray-500 hover:text-gray-300' : 'invisible',
          )}
          onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <Layers size={13} className={clsx('shrink-0', isSelected ? 'text-blue-400' : 'text-indigo-400')} />

        <span className="flex-1 truncate text-xs font-medium">{mg.display_name}</span>

        {count > 0 && (
          <span className="text-xs text-gray-600 shrink-0">
            {count} sub{count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {/* Child management groups */}
          {mg.child_mg_ids.map(childId => {
            const child = byId[childId]
            return child ? (
              <MgNode
                key={childId}
                mg={child}
                byId={byId}
                depth={depth + 1}
                selectedScopeId={selectedScopeId}
                onSelect={onSelect}
              />
            ) : null
          })}

          {/* Direct subscription children */}
          {mg.subscriptions.map(sub => (
            <SubRow
              key={sub.subscription_id}
              sub={sub}
              depth={depth + 1}
              isSelected={selectedScopeId === sub.subscription_id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubRow({ sub, depth, isSelected, onSelect }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 py-1.5 pr-3 rounded-md cursor-pointer text-sm select-none',
        isSelected
          ? 'bg-blue-600/20 text-blue-300'
          : 'hover:bg-gray-700/40 text-gray-400',
      )}
      style={{ paddingLeft: `${10 + depth * 18 + 14}px` }}
      onClick={() => onSelect({ id: sub.subscription_id, name: sub.display_name, subscriptionIds: [sub.subscription_id] })}
    >
      <Database size={12} className={clsx('shrink-0', isSelected ? 'text-blue-400' : 'text-gray-600')} />
      <span className="flex-1 truncate text-xs">{sub.display_name}</span>
      <span className="text-xs text-gray-700 shrink-0 font-mono">{sub.subscription_id.slice(0, 8)}…</span>
    </div>
  )
}

export default function ScopePicker({ selectedScopeId, selectedScopeName, onSelect, authMethod = '' }) {
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [treeData, setTreeData] = useState(null)
  const [mgFallback, setMgFallback] = useState(false) // true = MG access denied, showing flat sub list

  const byId = useMemo(() => {
    if (!treeData) return {}
    return Object.fromEntries(treeData.management_groups.map(mg => [mg.id, mg]))
  }, [treeData])

  // Nodes whose parent is not in the tree = roots (usually just the tenant root)
  const rootIds = useMemo(() => {
    if (!treeData) return []
    const allIds = new Set(treeData.management_groups.map(m => m.id))
    return treeData.management_groups
      .filter(m => !m.parent_id || !allIds.has(m.parent_id))
      .map(m => m.id)
  }, [treeData])

  async function open_picker() {
    setOpen(true)
    if (treeData) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.discoverManagementGroups(authMethod)
      setTreeData(data)
      setMgFallback(false)
    } catch (err) {
      const isAuthError = err.message?.includes('AuthorizationFailed') ||
                          err.message?.includes('authorization') ||
                          err.message?.includes('managementGroups/read')
      if (isAuthError) {
        // SP lacks Management Group Reader — fall back to flat subscription list
        setMgFallback(true)
        try {
          const subs = await api.discoverSubscriptions(authMethod)
          // Build a synthetic single-level tree so the same renderer works
          const synthetic = {
            tenant_root_id: '__subscriptions__',
            management_groups: [{
              id: '__subscriptions__',
              display_name: 'Available Subscriptions',
              parent_id: null,
              child_mg_ids: [],
              subscriptions: subs.subscriptions.map(s => ({
                subscription_id: s.subscription_id,
                display_name: s.display_name,
              })),
            }],
          }
          setTreeData(synthetic)
        } catch (subErr) {
          setError(subErr.message)
        }
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(scope) {
    onSelect(scope)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-400">Subscription Scope</label>

      {/* Selected scope badge */}
      {selectedScopeName ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800/40">
          <Layers size={12} className="text-blue-400 shrink-0" />
          <span className="text-xs text-blue-300 flex-1 truncate">{selectedScopeName}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-gray-600 hover:text-gray-400 shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-600">
          No scope selected — all subscriptions in your configuration will be scanned.
        </p>
      )}

      {/* Picker trigger */}
      <button
        type="button"
        onClick={open_picker}
        className="btn-ghost flex items-center gap-2 text-sm w-full justify-center"
      >
        {loading && <Loader size={14} className="animate-spin" />}
        {!loading && <Layers size={14} />}
        Browse Management Groups
      </button>

      {/* Tree panel */}
      {open && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <span className="text-xs text-gray-500">
              {treeData && !mgFallback
                ? `${treeData.management_groups.length} management group${treeData.management_groups.length !== 1 ? 's' : ''}`
                : treeData && mgFallback
                  ? `${treeData.management_groups[0]?.subscriptions?.length ?? 0} subscriptions`
                  : 'Loading…'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-600 hover:text-gray-400"
            >
              <X size={14} />
            </button>
          </div>

          {mgFallback && treeData && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/20 border-b border-amber-800/30 text-xs text-amber-400">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                Management Group Reader role not assigned to this service principal.
                Showing subscriptions directly. To enable the full hierarchy, assign
                <strong className="text-amber-300"> Management Group Reader</strong> at
                tenant root scope in Azure Portal → Management Groups → IAM.
              </span>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500">
                <Loader size={14} className="animate-spin" />
                Discovering management groups…
              </div>
            )}

            {error && !loading && (
              <div className="flex items-start gap-2 px-3 py-3 text-xs text-red-400">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {treeData && !loading && rootIds.map(rootId => {
              const root = byId[rootId]
              return root ? (
                <MgNode
                  key={rootId}
                  mg={root}
                  byId={byId}
                  depth={0}
                  selectedScopeId={selectedScopeId}
                  onSelect={handleSelect}
                />
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}
