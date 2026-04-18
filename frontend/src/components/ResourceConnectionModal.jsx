import React, { useMemo, useState } from 'react'
import { X, ExternalLink, AlertTriangle } from 'lucide-react'
import { SCORE_HEX as SCORE_COLOR } from '../scoreColors'

const TYPE_ICON = {
  'virtualmachines': 'VM', 'storageaccounts': 'St', 'sites': 'App',
  'serverfarms': 'Plan', 'virtualnetworks': 'VNet', 'networksecuritygroups': 'NSG',
  'publicipaddresses': 'IP', 'managedclusters': 'AKS', 'vaults': 'KV',
  'accounts': 'AI', 'workspaces': 'WS', 'namespaces': 'SB',
  'servers': 'SQL', 'flexibleservers': 'PG', 'disks': 'Disk',
  'networkinterfaces': 'NIC', 'loadbalancers': 'LB', 'containerregistries': 'ACR',
  'dnszones': 'DNS', 'privatednszones': 'DNS',
}
function getTypeIcon(resourceType) {
  const lower = resourceType.toLowerCase()
  for (const [key, icon] of Object.entries(TYPE_ICON)) {
    if (lower.includes(key)) return icon
  }
  return lower.split('/').pop().slice(0, 3).replace(/^\w/, c => c.toUpperCase())
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const EDGE_STYLE = {
  hosts:      { stroke: '#60a5fa', label: 'hosts'      },
  network:    { stroke: '#34d399', label: 'network'    },
  storage:    { stroke: '#fb923c', label: 'storage'    },
  dependency: { stroke: '#a78bfa', label: 'depends on' },
  app:        { stroke: '#94a3b8', label: 'same app'   },
}

function commonPrefixLen(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function inferConnectionsFor(resource, allResources) {
  const result = []   // { resource, type }
  const seen   = new Set()

  function add(r, type) {
    if (seen.has(r.resource_id) || r.resource_id === resource.resource_id) return
    seen.add(r.resource_id)
    result.push({ resource: r, type })
  }

  const t  = (r) => r.resource_type.toLowerCase()
  const me = t(resource)
  const rg = resource.resource_group

  const sameRG = allResources.filter(r => r.resource_group === rg && r.resource_id !== resource.resource_id)

  // App Service Plan ↔ Web Apps
  if (me.includes('serverfarms')) {
    sameRG.filter(r => t(r).includes('/sites')).forEach(r => add(r, 'hosts'))
  }
  if (me.includes('/sites')) {
    sameRG.filter(r => t(r).includes('serverfarms')).forEach(r => add(r, 'hosts'))
  }

  // VNet ↔ VMs / AKS / NSG
  if (me.includes('virtualnetworks')) {
    sameRG.filter(r => t(r).includes('virtualmachines') || t(r).includes('managedclusters') || t(r).includes('networksecuritygroups'))
      .forEach(r => add(r, 'network'))
  }
  if (me.includes('virtualmachines') || me.includes('managedclusters')) {
    sameRG.filter(r => t(r).includes('virtualnetworks') || t(r).includes('networksecuritygroups'))
      .forEach(r => add(r, 'network'))
  }

  // Storage ↔ Functions
  if (me.includes('storageaccounts')) {
    sameRG.filter(r => t(r).includes('/sites') && (
      r.resource_name.toLowerCase().includes('func') ||
      r.resource_name.toLowerCase().includes('fn-') ||
      r.resource_name.toLowerCase().includes('-fn')
    )).forEach(r => add(r, 'storage'))
  }
  if (me.includes('/sites')) {
    sameRG.filter(r => t(r).includes('storageaccounts')).forEach(r => add(r, 'storage'))
  }

  // Key Vault dependencies
  if (me.includes('vaults')) {
    const base = resource.resource_name.toLowerCase().replace(/[-_]?(kv|keyvault|vault)[-_]?/g, '').replace(/[-_]/g, '')
    if (base.length >= 3) {
      sameRG.filter(r => r.resource_name.toLowerCase().replace(/[-_]/g, '').includes(base))
        .forEach(r => add(r, 'dependency'))
    }
  }

  // Same name prefix
  const myName = resource.resource_name.toLowerCase().replace(/[-_]/g, '')
  sameRG.forEach(r => {
    const rName = r.resource_name.toLowerCase().replace(/[-_]/g, '')
    if (commonPrefixLen(myName, rName) >= 4) add(r, 'app')
  })

  return result
}

// ── SVG diagram ────────────────────────────────────────────────────────────────

const CX = 320, CY = 280
const HUB_R = 36
const SPOKE_R = 22
const ORBIT = 175

function NodeCircle({ x, y, r, color, label, resourceType, isOrphan, onClick, isHub }) {
  const [hov, setHov] = useState(false)
  const icon = getTypeIcon(resourceType || '')
  const iconSize = icon.length <= 2 ? (isHub ? 13 : 10) : icon.length <= 3 ? (isHub ? 11 : 9) : (isHub ? 9 : 8)
  const labelPad = 6
  const labelW   = Math.min(label.length * 6.5 + 16, 160)

  return (
    <g transform={`translate(${x},${y})`} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className={onClick ? 'cursor-pointer' : ''}>

      {/* Glow ring */}
      {(hov || isHub) && (
        <circle r={r + 6} fill="none" stroke={color} strokeWidth={isHub ? 2 : 1.5} opacity={isHub ? 0.3 : 0.35} />
      )}

      {/* Main circle */}
      <circle r={r} fill={color} fillOpacity={isHub ? 0.88 : 0.65}
        stroke={color} strokeWidth={isHub ? 2 : 1} strokeOpacity={0.9} />

      {/* Type icon */}
      <text textAnchor="middle" dominantBaseline="central"
        fontSize={iconSize} fontWeight="700" fill="#0f172a"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }} opacity={0.85}>
        {icon}
      </text>

      {/* Orphan dot */}
      {isOrphan && <circle r={4.5} cx={r - 3} cy={-(r - 3)} fill="#f97316" stroke="#0f172a" strokeWidth={1} />}

      {/* Full name label — only on hover, with pill background */}
      {hov && (
        <g transform={`translate(0,${r + labelPad + 10})`} style={{ pointerEvents: 'none' }}>
          <rect x={-labelW / 2} y={-10} width={labelW} height={20}
            rx={10} fill="#1e293b" stroke={color} strokeWidth={1} strokeOpacity={0.6} />
          <text textAnchor="middle" dominantBaseline="central"
            fontSize={10} fontWeight="500" fill="#f1f5f9"
            fontFamily="ui-sans-serif, sans-serif">
            {label}
          </text>
        </g>
      )}
    </g>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ResourceConnectionModal({ resource, allResources, onClose, onNavigate }) {
  const [selected, setSelected] = useState(null)

  const connections = useMemo(
    () => inferConnectionsFor(resource, allResources),
    [resource, allResources],
  )

  const hubColor = SCORE_COLOR[resource.score_label] ?? '#6b7280'

  // Radial positions for spoke nodes
  const spokeNodes = connections.map((c, i) => {
    const angle = (i / connections.length) * Math.PI * 2 - Math.PI / 2
    return {
      ...c,
      x: CX + ORBIT * Math.cos(angle),
      y: CY + ORBIT * Math.sin(angle),
    }
  })

  const svgH = Math.max(560, CY + ORBIT + 80)

  const active = selected ?? resource

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex overflow-hidden"
           style={{ maxHeight: '90vh' }}>

        {/* ── Diagram ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
            <div>
              <p className="text-sm font-semibold text-white">{resource.resource_name}</p>
              <p className="text-xs text-gray-500">{connections.length} connected resource{connections.length !== 1 ? 's' : ''} found</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
          </div>

          {connections.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center"
                   style={{ borderColor: hubColor, background: `${hubColor}20` }}>
                <span className="text-2xl" style={{ color: hubColor }}>
                  {resource.resource_name.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 font-medium">{resource.resource_name}</p>
              <p className="text-xs text-gray-600 max-w-xs">
                No connections detected. Connections are inferred from resource type patterns and shared name prefixes.
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <svg width="100%" height={svgH} viewBox={`0 0 ${CX * 2} ${svgH}`}>
                {/* Edge lines */}
                {spokeNodes.map((sn, i) => {
                  const style = EDGE_STYLE[sn.type] ?? EDGE_STYLE.app
                  const dx = sn.x - CX, dy = sn.y - CY
                  const d  = Math.sqrt(dx * dx + dy * dy)
                  const x1 = CX + (HUB_R + 4) * dx / d
                  const y1 = CY + (HUB_R + 4) * dy / d
                  const x2 = sn.x - (SPOKE_R + 4) * dx / d
                  const y2 = sn.y - (SPOKE_R + 4) * dy / d
                  return (
                    <g key={i}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={style.stroke} strokeWidth={1.5} strokeOpacity={0.5} />
                      <text
                        x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4}
                        textAnchor="middle" fontSize={8.5} fill={style.stroke} opacity={0.7}
                        fontFamily="ui-sans-serif, sans-serif">
                        {style.label}
                      </text>
                    </g>
                  )
                })}

                {/* Hub node */}
                <NodeCircle
                  x={CX} y={CY} r={HUB_R}
                  color={hubColor}
                  label={resource.resource_name}
                  resourceType={resource.resource_type}
                  isOrphan={resource.is_orphan}
                  isHub
                />

                {/* Spoke nodes */}
                {spokeNodes.map((sn, i) => (
                  <NodeCircle
                    key={i}
                    x={sn.x} y={sn.y} r={SPOKE_R}
                    color={SCORE_COLOR[sn.resource.score_label] ?? '#6b7280'}
                    label={sn.resource.resource_name}
                    resourceType={sn.resource.resource_type}
                    isOrphan={sn.resource.is_orphan}
                    onClick={() => setSelected(sn.resource === selected ? null : sn.resource)}
                  />
                ))}
              </svg>
            </div>
          )}

          {/* Edge legend */}
          <div className="px-5 py-2.5 border-t border-gray-800/60 flex flex-wrap gap-4 text-xs text-gray-600">
            {Object.entries(EDGE_STYLE).map(([, s]) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="w-4 h-px inline-block" style={{ background: s.stroke }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Detail sidebar ── */}
        <div className="w-64 border-l border-gray-800 flex flex-col shrink-0 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/40">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {selected && selected.resource_id !== resource.resource_id ? 'Selected' : 'Resource'}
            </p>
          </div>
          <div className="px-4 py-4 space-y-3 text-xs flex-1">
            <div>
              <p className="font-semibold text-white text-sm leading-tight">{active.resource_name}</p>
              <p className="text-gray-500 mt-0.5 font-mono text-xs">{active.resource_type.split('/').pop()}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: SCORE_COLOR[active.score_label] ?? '#6b7280' }} />
              <span style={{ color: SCORE_COLOR[active.score_label] ?? '#6b7280' }} className="font-medium">
                {active.score_label}
              </span>
              <span className="ml-auto text-gray-500">Score {active.final_score?.toFixed(0)}</span>
            </div>

            <div className="space-y-1.5 text-gray-400">
              <div><span className="text-gray-600">Group: </span>{active.resource_group}</div>
              {active.location && <div><span className="text-gray-600">Region: </span>{active.location}</div>}
              {active.sku      && <div><span className="text-gray-600">SKU: </span>{active.sku}</div>}
            </div>

            <div className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">This month</span>
                <span className="text-white font-semibold">${active.cost_current_month?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last month</span>
                <span className="text-gray-400">${active.cost_previous_month?.toFixed(2)}</span>
              </div>
              {active.estimated_monthly_savings > 0 && (
                <div className="flex justify-between border-t border-gray-700/40 pt-1.5">
                  <span className="text-green-600">Est. savings</span>
                  <span className="text-green-400 font-semibold">${active.estimated_monthly_savings?.toFixed(2)}</span>
                </div>
              )}
            </div>

            {active.recommendation && (
              <p className="text-gray-400 leading-relaxed bg-gray-800/40 border border-gray-700/40 rounded-lg p-2.5">
                {active.recommendation}
              </p>
            )}

            {active.ai_explanation && (
              <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-lg p-2.5">
                <p className="text-indigo-400 font-medium mb-1">AI</p>
                <p className="text-gray-300 leading-relaxed">{active.ai_explanation}</p>
              </div>
            )}

            {active.is_orphan && (
              <div className="flex items-start gap-2 bg-orange-950/30 border border-orange-800/40 rounded-lg p-2.5">
                <AlertTriangle size={12} className="text-orange-400 shrink-0 mt-0.5" />
                <p className="text-orange-400/80">{active.orphan_reason}</p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-800 space-y-2">
            {active.portal_url && (
              <a href={active.portal_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={12} /> Open in Azure Portal
              </a>
            )}
            {selected && selected.resource_id !== resource.resource_id && onNavigate && (
              <button
                onClick={() => { onNavigate(selected); onClose() }}
                className="w-full text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg py-1.5 transition-colors">
                View in table →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
