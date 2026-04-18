import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import {
  X, ExternalLink, Terminal, ZoomIn, ZoomOut, Maximize2,
  AlertTriangle, Info,
} from 'lucide-react'

import { SCORE_HEX, SCORE_HEX_DEFAULT } from '../scoreColors'

// ── Score colours ──────────────────────────────────────────────────────────────

const SCORE_COLOR  = SCORE_HEX
const DEFAULT_COLOR = SCORE_HEX_DEFAULT

// ── Connection inference ───────────────────────────────────────────────────────

function commonPrefixLen(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function inferConnections(resources) {
  const edges = []
  const seen  = new Set()

  function addEdge(srcId, tgtId, type) {
    const key = [srcId, tgtId].sort().join('||')
    if (!seen.has(key)) {
      seen.add(key)
      edges.push({ source: srcId, target: tgtId, type })
    }
  }

  const byRG = {}
  for (const r of resources) {
    const g = r.resource_group
    if (!byRG[g]) byRG[g] = []
    byRG[g].push(r)
  }

  for (const [, rgResources] of Object.entries(byRG)) {
    const t = (r) => r.resource_type.toLowerCase()

    const plans    = rgResources.filter(r => t(r).includes('serverfarms'))
    const sites    = rgResources.filter(r => t(r).includes('/sites'))
    const vnets    = rgResources.filter(r => t(r).includes('virtualnetworks'))
    const vms      = rgResources.filter(r => t(r).includes('virtualmachines'))
    const nsgs     = rgResources.filter(r => t(r).includes('networksecuritygroups'))
    const storage  = rgResources.filter(r => t(r).includes('storageaccounts'))
    const kv       = rgResources.filter(r => t(r).includes('vaults'))
    const aks      = rgResources.filter(r => t(r).includes('managedclusters'))

    // App Service Plan → Web Apps / Functions
    for (const plan of plans) {
      for (const site of sites) addEdge(plan.resource_id, site.resource_id, 'hosts')
    }

    // VNet → VMs
    for (const vnet of vnets) {
      for (const vm of vms)   addEdge(vnet.resource_id, vm.resource_id, 'network')
      for (const nsg of nsgs) addEdge(vnet.resource_id, nsg.resource_id, 'network')
      for (const ak of aks)   addEdge(vnet.resource_id, ak.resource_id, 'network')
    }

    // Storage → Functions (same RG, common for Azure Functions)
    if (storage.length && sites.length) {
      const funcs = sites.filter(s =>
        s.resource_name.toLowerCase().includes('func') ||
        s.resource_name.toLowerCase().includes('fn-') ||
        s.resource_name.toLowerCase().includes('-fn')
      )
      for (const store of storage) {
        for (const fn of funcs) addEdge(store.resource_id, fn.resource_id, 'storage')
      }
    }

    // Key Vault → any resource with same name prefix
    for (const vault of kv) {
      const vaultBase = vault.resource_name.toLowerCase().replace(/[-_]?(kv|keyvault|vault)[-_]?/g, '').replace(/[-_]/g, '')
      for (const r of rgResources) {
        if (r.resource_id === vault.resource_id) continue
        const rBase = r.resource_name.toLowerCase().replace(/[-_]/g, '')
        if (vaultBase.length >= 3 && rBase.includes(vaultBase)) {
          addEdge(vault.resource_id, r.resource_id, 'dependency')
        }
      }
    }

    // Same name prefix (≥ 4 chars after stripping separators)
    for (let i = 0; i < rgResources.length; i++) {
      for (let j = i + 1; j < rgResources.length; j++) {
        const a = rgResources[i].resource_name.toLowerCase().replace(/[-_]/g, '')
        const b = rgResources[j].resource_name.toLowerCase().replace(/[-_]/g, '')
        if (commonPrefixLen(a, b) >= 4) {
          addEdge(rgResources[i].resource_id, rgResources[j].resource_id, 'app')
        }
      }
    }
  }

  return edges
}

// ── Force layout ───────────────────────────────────────────────────────────────

function computeLayout(nodes, edges, W, H) {
  if (!nodes.length) return {}

  const groups   = [...new Set(nodes.map(n => n.group))]
  const gCount   = groups.length
  const cx = W / 2, cy = H / 2
  const orbitR = Math.min(W, H) * (gCount === 1 ? 0 : 0.32)

  const clusterPos = {}
  groups.forEach((g, i) => {
    const angle = (i / gCount) * Math.PI * 2 - Math.PI / 2
    clusterPos[g] = {
      x: cx + orbitR * Math.cos(angle),
      y: cy + orbitR * Math.sin(angle),
    }
  })

  const pos = {}
  for (const n of nodes) {
    const cp = clusterPos[n.group]
    pos[n.id] = {
      x: cp.x + (Math.random() - 0.5) * 120,
      y: cp.y + (Math.random() - 0.5) * 120,
      vx: 0, vy: 0,
    }
  }

  const edgeMap = {}
  for (const e of edges) {
    if (!edgeMap[e.source]) edgeMap[e.source] = []
    if (!edgeMap[e.target]) edgeMap[e.target] = []
    edgeMap[e.source].push(e.target)
    edgeMap[e.target].push(e.source)
  }

  const ITERS   = 160
  const REPULSE = 1800
  const SPRING  = 0.06
  const GRAVITY = 0.025
  const DAMP    = 0.72

  for (let iter = 0; iter < ITERS; iter++) {
    const alpha = 1 - iter / ITERS

    // Repulsion
    const ids = Object.keys(pos)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]]
        const dx = b.x - a.x, dy = b.y - a.y
        const d2 = dx * dx + dy * dy || 0.01
        const d  = Math.sqrt(d2)
        const f  = REPULSE / d2
        a.vx -= f * dx / d; a.vy -= f * dy / d
        b.vx += f * dx / d; b.vy += f * dy / d
      }
    }

    // Spring (edges)
    for (const e of edges) {
      const a = pos[e.source], b = pos[e.target]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d  = Math.sqrt(dx * dx + dy * dy) || 1
      const f  = (d - 130) * SPRING
      a.vx += f * dx / d; a.vy += f * dy / d
      b.vx -= f * dx / d; b.vy -= f * dy / d
    }

    // Cluster gravity
    for (const n of nodes) {
      const p = pos[n.id], cp = clusterPos[n.group]
      p.vx += (cp.x - p.x) * GRAVITY
      p.vy += (cp.y - p.y) * GRAVITY
    }

    // Integrate
    for (const n of nodes) {
      const p = pos[n.id]
      p.vx *= DAMP; p.vy *= DAMP
      p.x = Math.max(n.r + 8, Math.min(W - n.r - 8, p.x + p.vx * alpha))
      p.y = Math.max(n.r + 8, Math.min(H - n.r - 8, p.y + p.vy * alpha))
    }
  }

  return pos
}

// ── Edge type style ───────────────────────────────────────────────────────────

const EDGE_STYLE = {
  hosts:      { stroke: '#60a5fa', dasharray: '' },
  network:    { stroke: '#34d399', dasharray: '' },
  storage:    { stroke: '#fb923c', dasharray: '4 2' },
  dependency: { stroke: '#a78bfa', dasharray: '2 3' },
  app:        { stroke: '#94a3b8', dasharray: '3 3' },
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ resource, connectedResources, onClose }) {
  if (!resource) return null
  const color = SCORE_COLOR[resource.score_label] ?? DEFAULT_COLOR
  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-gray-900/95 border-l border-gray-800 flex flex-col shadow-2xl z-20 animate-slide-in-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <p className="text-sm font-semibold text-white truncate pr-2">{resource.resource_name}</p>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs">

        {/* Score */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-medium" style={{ color }}>{resource.score_label}</span>
          <span className="text-gray-500 ml-auto">Score {resource.final_score?.toFixed(0)}</span>
        </div>

        {/* Meta */}
        <div className="space-y-1.5 text-gray-400">
          <div><span className="text-gray-600">Type: </span>{resource.resource_type.split('/').pop()}</div>
          <div><span className="text-gray-600">Group: </span>{resource.resource_group}</div>
          {resource.location && <div><span className="text-gray-600">Region: </span>{resource.location}</div>}
          {resource.sku      && <div><span className="text-gray-600">SKU: </span>{resource.sku}</div>}
        </div>

        {/* Cost */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">This month</span>
            <span className="text-white font-semibold">${resource.cost_current_month?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Last month</span>
            <span className="text-gray-400">${resource.cost_previous_month?.toFixed(2)}</span>
          </div>
          {resource.estimated_monthly_savings > 0 && (
            <div className="flex justify-between border-t border-gray-700/60 pt-1.5">
              <span className="text-green-600">Est. savings</span>
              <span className="text-green-400 font-semibold">${resource.estimated_monthly_savings?.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* AI explanation */}
        {resource.ai_explanation && (
          <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-lg p-3">
            <p className="text-indigo-400 font-medium mb-1">AI Analysis</p>
            <p className="text-gray-300 leading-relaxed">{resource.ai_explanation}</p>
          </div>
        )}

        {/* Recommendation */}
        {resource.recommendation && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-3">
            <p className="text-gray-400 leading-relaxed">{resource.recommendation}</p>
          </div>
        )}

        {/* Connected resources */}
        {connectedResources.length > 0 && (
          <div>
            <p className="text-gray-500 font-medium uppercase tracking-wider mb-2">Connected Resources</p>
            <div className="space-y-1.5">
              {connectedResources.map(cr => (
                <div key={cr.resource_id} className="flex items-center gap-2 bg-gray-800/40 rounded-lg px-2.5 py-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SCORE_COLOR[cr.score_label] ?? DEFAULT_COLOR }} />
                  <span className="text-gray-300 truncate flex-1">{cr.resource_name}</span>
                  <span className="text-gray-600 shrink-0">{cr.resource_type.split('/').pop()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orphan warning */}
        {resource.is_orphan && (
          <div className="flex items-start gap-2 bg-orange-950/30 border border-orange-800/40 rounded-lg p-3">
            <AlertTriangle size={13} className="text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-orange-300 font-medium">Orphaned</p>
              <p className="text-orange-400/80 mt-0.5">{resource.orphan_reason}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {resource.portal_url && (
        <div className="px-4 py-3 border-t border-gray-800">
          <a href={resource.portal_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink size={12} /> Open in Azure Portal
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const MAX_NODES   = 80
const SVG_W       = 1100
const SVG_H       = 700
const MIN_RADIUS  = 8
const MAX_RADIUS  = 32

export default function ResourceMap({ resources = [] }) {
  const svgRef       = useRef(null)
  const [selected,   setSelected]   = useState(null)
  const [hovered,    setHovered]    = useState(null)
  const [filterRG,   setFilterRG]   = useState('')
  const [zoom,       setZoom]       = useState(1)
  const [pan,        setPan]        = useState({ x: 0, y: 0 })
  const dragging     = useRef(false)
  const lastPan      = useRef({ x: 0, y: 0 })

  const resourceGroups = useMemo(
    () => [...new Set(resources.map(r => r.resource_group))].sort(),
    [resources],
  )

  // Cap nodes by cost; apply RG filter
  const topResources = useMemo(() => {
    let rs = filterRG ? resources.filter(r => r.resource_group === filterRG) : resources
    return [...rs]
      .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))
      .slice(0, MAX_NODES)
  }, [resources, filterRG])

  // Max cost for radius scaling
  const maxCost = useMemo(
    () => Math.max(...topResources.map(r => r.cost_current_month || 0), 1),
    [topResources],
  )

  const nodes = useMemo(() => topResources.map(r => ({
    id:    r.resource_id,
    label: r.resource_name,
    group: r.resource_group,
    color: SCORE_COLOR[r.score_label] ?? DEFAULT_COLOR,
    r:     MIN_RADIUS + Math.sqrt((r.cost_current_month || 0) / maxCost) * (MAX_RADIUS - MIN_RADIUS),
    data:  r,
  })), [topResources, maxCost])

  const edges = useMemo(() => inferConnections(topResources), [topResources])

  const layout = useMemo(() => {
    if (!nodes.length) return {}
    // Use a stable random seed per resource set
    return computeLayout(nodes, edges, SVG_W, SVG_H)
  }, [nodes, edges])  // eslint-disable-line

  // Connected resources for selected node
  const connectedResources = useMemo(() => {
    if (!selected) return []
    const connIds = new Set()
    for (const e of edges) {
      if (e.source === selected.resource_id) connIds.add(e.target)
      if (e.target === selected.resource_id) connIds.add(e.source)
    }
    return topResources.filter(r => connIds.has(r.resource_id))
  }, [selected, edges, topResources])

  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }) }

  function onWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)))
  }

  function onMouseDown(e) {
    if (e.target.closest('.map-node')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  function onMouseMove(e) {
    if (!dragging.current) return
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }
  function onMouseUp() { dragging.current = false }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (!resources.length) {
    return (
      <div className="card flex items-center justify-center py-20">
        <p className="text-gray-600 text-sm">No resource data available.</p>
      </div>
    )
  }

  const transform = `translate(${pan.x},${pan.y}) scale(${zoom})`

  return (
    <div className="card p-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Resource Map</h3>

        <select value={filterRG} onChange={e => setFilterRG(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-600 ml-2">
          <option value="">All resource groups</option>
          {resourceGroups.map(rg => <option key={rg} value={rg}>{rg}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 mr-3 text-xs text-gray-600">
            {Object.entries(SCORE_COLOR).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="btn-ghost p-1.5"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} className="btn-ghost p-1.5"><ZoomOut size={14} /></button>
          <button onClick={resetView} className="btn-ghost p-1.5" title="Reset view"><Maximize2 size={14} /></button>
        </div>

        <p className="w-full text-xs text-gray-700 -mt-1">
          {topResources.length} resources shown{resources.length > MAX_NODES ? ` (top ${MAX_NODES} by cost)` : ''} · {edges.length} connections inferred · drag to pan, scroll to zoom · click node for details
        </p>
      </div>

      {/* Map canvas */}
      <div className="relative" style={{ height: SVG_H }}>
        <svg
          ref={svgRef}
          width="100%" height={SVG_H}
          className="cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <g transform={transform}>
            {/* Resource group labels */}
            {[...new Set(nodes.map(n => n.group))].map(group => {
              const groupNodes = nodes.filter(n => n.group === group)
              const xs = groupNodes.map(n => layout[n.id]?.x).filter(Boolean)
              const ys = groupNodes.map(n => layout[n.id]?.y).filter(Boolean)
              if (!xs.length) return null
              const cx = xs.reduce((a, b) => a + b, 0) / xs.length
              const cy = ys.reduce((a, b) => a + b, 0) / ys.length - 28
              return (
                <text key={group} x={cx} y={cy}
                  textAnchor="middle" fontSize={11} fill="#4b5563"
                  fontFamily="ui-monospace, monospace">
                  {group}
                </text>
              )
            })}

            {/* Edges */}
            {edges.map((e, i) => {
              const a = layout[e.source], b = layout[e.target]
              if (!a || !b) return null
              const style = EDGE_STYLE[e.type] ?? EDGE_STYLE.app
              const isHighlighted = hovered === e.source || hovered === e.target ||
                                    selected?.resource_id === e.source || selected?.resource_id === e.target
              const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15
              const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15
              return (
                <path
                  key={i}
                  d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={isHighlighted ? 1.5 : 0.7}
                  strokeDasharray={style.dasharray}
                  opacity={isHighlighted ? 0.8 : 0.2}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const p = layout[n.id]
              if (!p) return null
              const isSelected  = selected?.resource_id === n.id
              const isHovered   = hovered === n.id
              const isConnected = selected && connectedResources.some(c => c.resource_id === n.id)
              const dim = selected && !isSelected && !isConnected

              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="map-node cursor-pointer"
                  onClick={() => setSelected(isSelected ? null : n.data)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Glow ring on selected/hovered */}
                  {(isSelected || isHovered) && (
                    <circle r={n.r + 5} fill="none" stroke={n.color} strokeWidth={1.5} opacity={0.4} />
                  )}
                  {isSelected && (
                    <circle r={n.r + 9} fill="none" stroke={n.color} strokeWidth={1} opacity={0.2} />
                  )}

                  <circle
                    r={n.r}
                    fill={n.color}
                    fillOpacity={dim ? 0.15 : isSelected ? 0.9 : 0.65}
                    stroke={n.color}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={dim ? 0.2 : 0.8}
                  />

                  {/* Orphan indicator */}
                  {n.data.is_orphan && (
                    <circle r={4} cx={n.r - 3} cy={-(n.r - 3)} fill="#f97316" />
                  )}

                  {/* Label */}
                  {(isHovered || isSelected || n.r >= 18) && (
                    <text
                      y={n.r + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill={dim ? '#374151' : '#e5e7eb'}
                      fontFamily="ui-sans-serif, sans-serif"
                      style={{ pointerEvents: 'none' }}
                    >
                      {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* Detail panel */}
        {selected && (
          <DetailPanel
            resource={selected}
            connectedResources={connectedResources}
            onClose={() => setSelected(null)}
          />
        )}

        {/* Empty state for filtered view */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-600 text-sm">No resources in this resource group.</p>
          </div>
        )}
      </div>

      {/* Edge legend */}
      <div className="px-4 py-2 border-t border-gray-800/60 flex flex-wrap gap-4 text-xs text-gray-600">
        {Object.entries(EDGE_STYLE).map(([type, style]) => (
          <span key={type} className="flex items-center gap-1.5">
            <svg width={24} height={8}>
              <line x1={0} y1={4} x2={24} y2={4}
                stroke={style.stroke} strokeWidth={1.5}
                strokeDasharray={style.dasharray} />
            </svg>
            {type}
          </span>
        ))}
      </div>
    </div>
  )
}
