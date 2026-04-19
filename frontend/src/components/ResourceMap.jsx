import React, { useMemo, useRef, useState, useEffect } from 'react'
import { X, ExternalLink, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from 'lucide-react'
import { SCORE_HEX, SCORE_HEX_DEFAULT } from '../scoreColors'

const SCORE_COLOR  = SCORE_HEX
const DEFAULT_COLOR = SCORE_HEX_DEFAULT

// ── Resource group panel colours ───────────────────────────────────────────────
const RG_COLORS = [
  { fill: 'rgba(59,130,246,0.07)',  stroke: 'rgba(59,130,246,0.22)'  },
  { fill: 'rgba(139,92,246,0.07)', stroke: 'rgba(139,92,246,0.22)'  },
  { fill: 'rgba(20,184,166,0.07)', stroke: 'rgba(20,184,166,0.22)'  },
  { fill: 'rgba(245,158,11,0.07)', stroke: 'rgba(245,158,11,0.22)'  },
  { fill: 'rgba(236,72,153,0.07)', stroke: 'rgba(236,72,153,0.22)'  },
  { fill: 'rgba(16,185,129,0.07)', stroke: 'rgba(16,185,129,0.22)'  },
  { fill: 'rgba(251,146,60,0.07)', stroke: 'rgba(251,146,60,0.22)'  },
]

// ── Type icons ─────────────────────────────────────────────────────────────────
const TYPE_ICON = {
  'virtualmachines': 'VM', 'storageaccounts': 'St', 'sites': 'App',
  'serverfarms': 'Plan', 'virtualnetworks': 'VNet', 'networksecuritygroups': 'NSG',
  'publicipaddresses': 'IP', 'managedclusters': 'AKS', 'vaults': 'KV',
  'accounts': 'AI', 'workspaces': 'WS', 'namespaces': 'SB',
  'servers': 'SQL', 'flexibleservers': 'PG', 'components': 'AI',
  'disks': 'Disk', 'networkinterfaces': 'NIC', 'loadbalancers': 'LB',
  'applicationgateways': 'AGW', 'dnszones': 'DNS', 'privatednszones': 'DNS',
  'containerregistries': 'ACR', 'redis': 'Cache', 'searchservices': 'Srch',
}
function getTypeIcon(resourceType) {
  const lower = resourceType.toLowerCase()
  for (const [key, icon] of Object.entries(TYPE_ICON)) {
    if (lower.includes(key)) return icon
  }
  return lower.split('/').pop().slice(0, 3).replace(/^\w/, c => c.toUpperCase())
}

// ── Connection inference ───────────────────────────────────────────────────────
function commonPrefixLen(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function inferConnections(resources) {
  const edges = [], seen = new Set()
  function addEdge(s, t, type) {
    const key = [s, t].sort().join('||')
    if (!seen.has(key)) { seen.add(key); edges.push({ source: s, target: t, type }) }
  }
  const byRG = {}
  for (const r of resources) {
    if (!byRG[r.resource_group]) byRG[r.resource_group] = []
    byRG[r.resource_group].push(r)
  }
  for (const rg of Object.values(byRG)) {
    const t = r => r.resource_type.toLowerCase()
    const plans   = rg.filter(r => t(r).includes('serverfarms'))
    const sites   = rg.filter(r => t(r).includes('/sites'))
    const vnets   = rg.filter(r => t(r).includes('virtualnetworks'))
    const vms     = rg.filter(r => t(r).includes('virtualmachines'))
    const nsgs    = rg.filter(r => t(r).includes('networksecuritygroups'))
    const storage = rg.filter(r => t(r).includes('storageaccounts'))
    const kv      = rg.filter(r => t(r).includes('vaults'))
    const aks     = rg.filter(r => t(r).includes('managedclusters'))
    for (const p of plans) for (const s of sites) addEdge(p.resource_id, s.resource_id, 'hosts')
    for (const v of vnets) {
      for (const m of vms)  addEdge(v.resource_id, m.resource_id, 'network')
      for (const n of nsgs) addEdge(v.resource_id, n.resource_id, 'network')
      for (const a of aks)  addEdge(v.resource_id, a.resource_id, 'network')
    }
    if (storage.length && sites.length) {
      const funcs = sites.filter(s => /func|fn[-_]|[-_]fn/i.test(s.resource_name))
      for (const st of storage) for (const fn of funcs) addEdge(st.resource_id, fn.resource_id, 'storage')
    }
    for (const vault of kv) {
      const base = vault.resource_name.toLowerCase().replace(/[-_]?(kv|keyvault|vault)[-_]?/g,'').replace(/[-_]/g,'')
      if (base.length >= 3)
        for (const r of rg) {
          if (r.resource_id === vault.resource_id) continue
          if (r.resource_name.toLowerCase().replace(/[-_]/g,'').includes(base))
            addEdge(vault.resource_id, r.resource_id, 'dependency')
        }
    }
    for (let i = 0; i < rg.length; i++)
      for (let j = i+1; j < rg.length; j++) {
        const a = rg[i].resource_name.toLowerCase().replace(/[-_]/g,'')
        const b = rg[j].resource_name.toLowerCase().replace(/[-_]/g,'')
        if (commonPrefixLen(a,b) >= 4) addEdge(rg[i].resource_id, rg[j].resource_id, 'app')
      }
  }
  return edges
}

// ── Force layout ───────────────────────────────────────────────────────────────
function computeLayout(nodes, edges, W, H) {
  if (!nodes.length) return {}
  const groups = [...new Set(nodes.map(n => n.group))]
  const gCount = groups.length
  const cx = W/2, cy = H/2
  const orbitR = Math.min(W,H) * (gCount === 1 ? 0 : 0.30)
  const clusterPos = {}
  groups.forEach((g,i) => {
    const angle = (i/gCount)*Math.PI*2 - Math.PI/2
    clusterPos[g] = { x: cx + orbitR*Math.cos(angle), y: cy + orbitR*Math.sin(angle) }
  })
  const pos = {}
  for (const n of nodes) {
    const cp = clusterPos[n.group]
    pos[n.id] = { x: cp.x+(Math.random()-0.5)*120, y: cp.y+(Math.random()-0.5)*120, vx:0, vy:0 }
  }
  const ITERS=160, REPULSE=1800, SPRING=0.06, GRAVITY=0.025, DAMP=0.72
  for (let iter=0; iter<ITERS; iter++) {
    const alpha = 1 - iter/ITERS
    const ids = Object.keys(pos)
    for (let i=0; i<ids.length; i++)
      for (let j=i+1; j<ids.length; j++) {
        const a=pos[ids[i]], b=pos[ids[j]]
        const dx=b.x-a.x, dy=b.y-a.y
        const d2=dx*dx+dy*dy||0.01, d=Math.sqrt(d2), f=REPULSE/d2
        a.vx-=f*dx/d; a.vy-=f*dy/d; b.vx+=f*dx/d; b.vy+=f*dy/d
      }
    for (const e of edges) {
      const a=pos[e.source], b=pos[e.target]
      if (!a||!b) continue
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)||1, f=(d-130)*SPRING
      a.vx+=f*dx/d; a.vy+=f*dy/d; b.vx-=f*dx/d; b.vy-=f*dy/d
    }
    for (const n of nodes) {
      const p=pos[n.id], cp=clusterPos[n.group]
      p.vx+=(cp.x-p.x)*GRAVITY; p.vy+=(cp.y-p.y)*GRAVITY
    }
    for (const n of nodes) {
      const p=pos[n.id]
      p.vx*=DAMP; p.vy*=DAMP
      p.x=Math.max(n.r+8,Math.min(W-n.r-8,p.x+p.vx*alpha))
      p.y=Math.max(n.r+8,Math.min(H-n.r-8,p.y+p.vy*alpha))
    }
  }
  return pos
}

// ── Edge styles ────────────────────────────────────────────────────────────────
const EDGE_STYLE = {
  hosts:      { stroke: '#60a5fa', dasharray: '',     particleColor: '#93c5fd' },
  network:    { stroke: '#34d399', dasharray: '',     particleColor: '#6ee7b7' },
  storage:    { stroke: '#fb923c', dasharray: '4 2',  particleColor: '#fdba74' },
  dependency: { stroke: '#a78bfa', dasharray: '2 3',  particleColor: '#c4b5fd' },
  app:        { stroke: '#94a3b8', dasharray: '3 3',  particleColor: '#cbd5e1' },
}

// ── Animated flow particle ─────────────────────────────────────────────────────
function FlowParticle({ pathD, color, duration, delay = 0 }) {
  return (
    <circle r={2.5} fill={color} opacity={0.95} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
      <animateMotion dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" path={pathD} />
    </circle>
  )
}

// ── Hover tooltip ──────────────────────────────────────────────────────────────
function NodeTooltip({ node, mousePos, containerRef }) {
  if (!node || !containerRef.current) return null
  const rect = containerRef.current.getBoundingClientRect()
  const x = mousePos.x - rect.left
  const y = mousePos.y - rect.top
  const color = SCORE_COLOR[node.data.score_label] ?? DEFAULT_COLOR
  const tipW = 220
  const left = x + tipW + 16 > rect.width ? x - tipW - 12 : x + 16
  const top  = Math.max(8, Math.min(y - 20, rect.height - 180))
  return (
    <div className="absolute z-30 pointer-events-none" style={{ left, top, width: tipW }}>
      <div className="bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden"
           style={{ boxShadow: `0 0 20px ${color}22, 0 8px 32px rgba(0,0,0,0.6)` }}>
        <div className="px-3 py-2.5 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <span className="text-xs font-semibold" style={{ color }}>{node.data.score_label}</span>
            <span className="text-xs text-gray-500 ml-auto">Score {node.data.final_score?.toFixed(0)}</span>
          </div>
          <p className="text-sm font-semibold text-white leading-tight break-all">{node.data.resource_name}</p>
        </div>
        <div className="px-3 py-2 space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span className="text-gray-600">Type</span>
            <span className="text-gray-300">{node.data.resource_type.split('/').pop()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Group</span>
            <span className="text-gray-300 truncate max-w-[130px] text-right">{node.data.resource_group}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">This month</span>
            <span className="text-white font-medium">${node.data.cost_current_month?.toFixed(2)}</span>
          </div>
          {node.data.estimated_monthly_savings > 0 && (
            <div className="flex justify-between border-t border-gray-800 pt-1">
              <span className="text-green-600">Est. savings</span>
              <span className="text-green-400 font-medium">${node.data.estimated_monthly_savings?.toFixed(2)}/mo</span>
            </div>
          )}
          {node.data.is_orphan && (
            <div className="flex items-center gap-1.5 border-t border-gray-800 pt-1 text-orange-400">
              <AlertTriangle size={10} /><span>Orphaned resource</span>
            </div>
          )}
        </div>
        <div className="px-3 py-1.5 bg-gray-800/50 border-t border-gray-800">
          <p className="text-xs text-gray-600">Click to pin details</p>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function DetailPanel({ resource, connectedResources, onClose }) {
  if (!resource) return null
  const color = SCORE_COLOR[resource.score_label] ?? DEFAULT_COLOR
  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-gray-900/98 border-l border-gray-800 flex flex-col shadow-2xl z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-white break-all leading-tight">{resource.resource_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{resource.resource_type.split('/').pop()}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0"><X size={15}/></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="font-medium" style={{ color }}>{resource.score_label}</span>
          <span className="text-gray-500 ml-auto">Score {resource.final_score?.toFixed(0)}</span>
        </div>
        <div className="space-y-1.5 text-gray-400">
          <div><span className="text-gray-600">Group: </span>{resource.resource_group}</div>
          {resource.location && <div><span className="text-gray-600">Region: </span>{resource.location}</div>}
          {resource.sku      && <div><span className="text-gray-600">SKU: </span>{resource.sku}</div>}
        </div>
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
        {resource.ai_explanation && (
          <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-lg p-3">
            <p className="text-indigo-400 font-medium mb-1">Analysis</p>
            <p className="text-gray-300 leading-relaxed">{resource.ai_explanation}</p>
          </div>
        )}
        {resource.recommendation && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-3">
            <p className="text-gray-400 leading-relaxed">{resource.recommendation}</p>
          </div>
        )}
        {connectedResources.length > 0 && (
          <div>
            <p className="text-gray-500 font-medium uppercase tracking-wider mb-2">Connected</p>
            <div className="space-y-1.5">
              {connectedResources.map(cr => (
                <div key={cr.resource_id} className="flex items-center gap-2 bg-gray-800/40 rounded-lg px-2.5 py-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SCORE_COLOR[cr.score_label] ?? DEFAULT_COLOR }} />
                  <span className="text-gray-300 break-all flex-1 leading-tight">{cr.resource_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {resource.is_orphan && (
          <div className="flex items-start gap-2 bg-orange-950/30 border border-orange-800/40 rounded-lg p-3">
            <AlertTriangle size={13} className="text-orange-400 shrink-0 mt-0.5"/>
            <div>
              <p className="text-orange-300 font-medium">Orphaned</p>
              <p className="text-orange-400/80 mt-0.5">{resource.orphan_reason}</p>
            </div>
          </div>
        )}
      </div>
      {resource.portal_url && (
        <div className="px-4 py-3 border-t border-gray-800">
          <a href={resource.portal_url} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLink size={12}/> Open in Azure Portal
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
const MAX_NODES  = 80
const SVG_W      = 1100
const SVG_H      = 700
const MIN_RADIUS = 10
const MAX_RADIUS = 34
const RG_PAD     = 44

export default function ResourceMap({ resources = [] }) {
  const svgRef       = useRef(null)
  const containerRef = useRef(null)
  const [selected,   setSelected]   = useState(null)
  const [hovered,    setHovered]    = useState(null)
  const [mousePos,   setMousePos]   = useState({ x: 0, y: 0 })
  const [filterRG,   setFilterRG]   = useState('')
  const [zoom,       setZoom]       = useState(1)
  const [pan,        setPan]        = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPan  = useRef({ x: 0, y: 0 })

  const resourceGroups = useMemo(
    () => [...new Set(resources.map(r => r.resource_group))].sort(),
    [resources],
  )

  const topResources = useMemo(() => {
    let rs = filterRG ? resources.filter(r => r.resource_group === filterRG) : resources
    return [...rs].sort((a,b) => (b.cost_current_month||0)-(a.cost_current_month||0)).slice(0, MAX_NODES)
  }, [resources, filterRG])

  const maxCost = useMemo(
    () => Math.max(...topResources.map(r => r.cost_current_month||0), 1),
    [topResources],
  )

  const nodes = useMemo(() => topResources.map(r => ({
    id:    r.resource_id,
    label: r.resource_name,
    icon:  getTypeIcon(r.resource_type),
    group: r.resource_group,
    color: SCORE_COLOR[r.score_label] ?? DEFAULT_COLOR,
    r:     MIN_RADIUS + Math.sqrt((r.cost_current_month||0) / maxCost) * (MAX_RADIUS - MIN_RADIUS),
    data:  r,
  })), [topResources, maxCost])

  const edges = useMemo(() => inferConnections(topResources), [topResources])

  const layout = useMemo(() => {
    if (!nodes.length) return {}
    return computeLayout(nodes, edges, SVG_W, SVG_H)
  }, [nodes, edges]) // eslint-disable-line

  // RG bounding boxes for floor panels
  const rgPanels = useMemo(() => {
    if (!Object.keys(layout).length) return []
    const groups = [...new Set(nodes.map(n => n.group))]
    return groups.map((group, idx) => {
      const gNodes = nodes.filter(n => n.group === group)
      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity
      for (const n of gNodes) {
        const p = layout[n.id]
        if (!p) continue
        minX = Math.min(minX, p.x - n.r - RG_PAD)
        minY = Math.min(minY, p.y - n.r - RG_PAD)
        maxX = Math.max(maxX, p.x + n.r + RG_PAD)
        maxY = Math.max(maxY, p.y + n.r + RG_PAD)
      }
      if (minX === Infinity) return null
      const c = RG_COLORS[idx % RG_COLORS.length]
      return { group, x: minX, y: minY, w: maxX-minX, h: maxY-minY, ...c }
    }).filter(Boolean)
  }, [nodes, layout])

  const connectedResources = useMemo(() => {
    if (!selected) return []
    const connIds = new Set()
    for (const e of edges) {
      if (e.source === selected.resource_id) connIds.add(e.target)
      if (e.target === selected.resource_id) connIds.add(e.source)
    }
    return topResources.filter(r => connIds.has(r.resource_id))
  }, [selected, edges, topResources])

  const hoveredNode = useMemo(() => nodes.find(n => n.id === hovered) ?? null, [nodes, hovered])

  function resetView() { setZoom(1); setPan({ x:0, y:0 }) }

  function onWheel(e) {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }
  function onMouseDown(e) {
    if (e.target.closest('.map-node')) return
    dragging.current = true
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  function onMouseMove(e) {
    setMousePos({ x: e.clientX, y: e.clientY })
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
          <div className="hidden sm:flex items-center gap-3 mr-3 text-xs text-gray-600">
            {Object.entries(SCORE_COLOR).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }}/>
                {label}
              </span>
            ))}
          </div>
          <button onClick={() => setZoom(z => Math.min(3, z*1.2))} className="btn-ghost p-1.5"><ZoomIn size={14}/></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z*0.8))} className="btn-ghost p-1.5"><ZoomOut size={14}/></button>
          <button onClick={resetView} className="btn-ghost p-1.5" title="Reset view"><Maximize2 size={14}/></button>
        </div>
        <p className="w-full text-xs text-gray-700 -mt-1">
          {topResources.length} resources{resources.length > MAX_NODES ? ` (top ${MAX_NODES} by cost)` : ''} · {edges.length} connections · drag to pan · scroll to zoom · hover for details · click to pin
        </p>
      </div>

      {/* Map canvas */}
      <div ref={containerRef} className="relative" style={{ height: SVG_H }}>
        <svg ref={svgRef} width="100%" height={SVG_H}
          className="cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={() => { onMouseUp(); setHovered(null) }}>

          <defs>
            {/* Dot grid background */}
            <pattern id="dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1" fill="#1e293b"/>
            </pattern>

            {/* Node gradients */}
            {nodes.map(n => {
              const gid = `grad-${n.id.replace(/\W/g,'_')}`
              return (
                <radialGradient key={gid} id={gid} cx="35%" cy="30%" r="70%">
                  <stop offset="0%"   stopColor={n.color} stopOpacity="1"   />
                  <stop offset="60%"  stopColor={n.color} stopOpacity="0.75"/>
                  <stop offset="100%" stopColor={n.color} stopOpacity="0.35"/>
                </radialGradient>
              )
            })}

            {/* Glow filters */}
            <filter id="glow-edge" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-node" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-node-lg" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="panel-shadow" x="-5%" y="-5%" width="110%" height="110%">
              <feDropShadow dx="0" dy="2" stdDeviation="8" floodColor="#000" floodOpacity="0.4"/>
            </filter>
          </defs>

          {/* Dot grid background — covers whole SVG, outside transform */}
          <rect width="100%" height="100%" fill="url(#dot-grid)"/>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* RG floor panels */}
            {rgPanels.map(panel => (
              <g key={panel.group}>
                <rect
                  x={panel.x} y={panel.y} width={panel.w} height={panel.h}
                  rx={20} ry={20}
                  fill={panel.fill}
                  stroke={panel.stroke}
                  strokeWidth={1}
                  filter="url(#panel-shadow)"
                />
                <text
                  x={panel.x + 16} y={panel.y + 20}
                  fontSize={11} fill={panel.stroke}
                  fontFamily="ui-monospace, monospace"
                  fontWeight="600" letterSpacing="0.06em"
                  style={{ pointerEvents: 'none' }}>
                  {panel.group}
                </text>
              </g>
            ))}

            {/* Edges */}
            {edges.map((e, i) => {
              const a = layout[e.source], b = layout[e.target]
              if (!a || !b) return null
              const style = EDGE_STYLE[e.type] ?? EDGE_STYLE.app
              const isHighlighted = hovered === e.source || hovered === e.target ||
                selected?.resource_id === e.source || selected?.resource_id === e.target
              const mx = (a.x+b.x)/2 + (b.y-a.y)*0.15
              const my = (a.y+b.y)/2 - (b.x-a.x)*0.15
              const pathD = `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`
              const edgeLen = Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2)
              const particleDur = Math.max(1.2, edgeLen / 90)

              return (
                <g key={i}>
                  <path d={pathD} fill="none"
                    stroke={style.stroke}
                    strokeWidth={isHighlighted ? 2 : 0.8}
                    strokeDasharray={style.dasharray}
                    opacity={isHighlighted ? 0.9 : 0.15}
                    filter={isHighlighted ? 'url(#glow-edge)' : undefined}
                  />
                  {/* Animated particles on highlighted edges */}
                  {isHighlighted && (
                    <>
                      <FlowParticle pathD={pathD} color={style.particleColor} duration={particleDur} delay={0} />
                      <FlowParticle pathD={pathD} color={style.particleColor} duration={particleDur} delay={particleDur / 2} />
                    </>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const p = layout[n.id]
              if (!p) return null
              const isSelected  = selected?.resource_id === n.id
              const isHovered   = hovered === n.id
              const isConnected = selected && connectedResources.some(c => c.resource_id === n.id)
              const dim         = selected && !isSelected && !isConnected
              const gradId      = `grad-${n.id.replace(/\W/g,'_')}`
              const iconSize    = n.icon.length <= 2 ? 11 : n.icon.length <= 3 ? 9 : 8

              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`}
                   className="map-node cursor-pointer"
                   onClick={() => setSelected(isSelected ? null : n.data)}
                   onMouseEnter={() => setHovered(n.id)}
                   onMouseLeave={() => setHovered(null)}>

                  {/* Large bloom glow for selected */}
                  {isSelected && (
                    <circle r={n.r + 4} fill={n.color} fillOpacity={0.25}
                      filter="url(#glow-node-lg)" />
                  )}

                  {/* Medium glow ring */}
                  {(isSelected || isHovered) && (
                    <circle r={n.r + 3} fill={n.color} fillOpacity={0.15}
                      filter="url(#glow-node)" />
                  )}

                  {/* Outer ring */}
                  {(isSelected || isHovered) && (
                    <circle r={n.r + 6} fill="none" stroke={n.color}
                      strokeWidth={isSelected ? 2 : 1.5}
                      opacity={isSelected ? 0.7 : 0.4} />
                  )}

                  {/* Main circle */}
                  <circle r={n.r}
                    fill={dim ? n.color : `url(#${gradId})`}
                    fillOpacity={dim ? 0.08 : 1}
                    stroke={n.color}
                    strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
                    strokeOpacity={dim ? 0.12 : isSelected ? 1 : 0.75}
                  />

                  {/* Specular highlight — small bright dot top-left */}
                  {!dim && (
                    <circle
                      r={n.r * 0.28}
                      cx={-n.r * 0.3}
                      cy={-n.r * 0.32}
                      fill="white"
                      fillOpacity={0.2}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Type icon */}
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={iconSize} fontWeight="700" fill="#0f172a"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    opacity={dim ? 0 : 0.88}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {n.icon}
                  </text>

                  {/* Orphan indicator */}
                  {n.data.is_orphan && (
                    <circle r={4.5} cx={n.r-3} cy={-(n.r-3)}
                      fill="#f97316" stroke="#0f172a" strokeWidth={1} />
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* HTML hover tooltip */}
        {hovered && !selected && hoveredNode && (
          <NodeTooltip node={hoveredNode} mousePos={mousePos} containerRef={containerRef}/>
        )}

        {/* Pinned detail panel */}
        {selected && (
          <DetailPanel resource={selected} connectedResources={connectedResources} onClose={() => setSelected(null)}/>
        )}

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
                stroke={style.stroke} strokeWidth={1.5} strokeDasharray={style.dasharray}/>
            </svg>
            {type}
          </span>
        ))}
      </div>
    </div>
  )
}
