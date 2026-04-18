import React from 'react'

// Azure billing settles 3-5 days after the cost is incurred.
// The last UNSETTLED_DAYS of any sparkline are shaded to signal pending data.
const UNSETTLED_DAYS = 5

/**
 * Tiny inline sparkline rendered as an SVG polyline.
 * Props:
 *   data    — array of numbers (daily costs, 30 values recommended)
 *   width   — SVG width (default 60)
 *   height  — SVG height (default 22)
 *   color   — stroke color (default '#60a5fa')
 *   anomaly — if true, render in orange/red
 */
export default function SparkLine({ data = [], width = 60, height = 22, color, anomaly = false }) {
  if (!data || data.length < 2) {
    return <span className="text-gray-700 text-xs">—</span>
  }

  const stroke = color ?? (anomaly ? '#f97316' : '#60a5fa')
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Calculate x position where the unsettled window starts
  const unsettledStartIdx = Math.max(0, data.length - UNSETTLED_DAYS)
  const unsettledX = pad + (unsettledStartIdx / (data.length - 1)) * (width - pad * 2)
  const unsettledWidth = width - unsettledX

  return (
    <svg width={width} height={height} className="inline-block" title="Last 5 days: billing pending">
      {/* Unsettled billing window — subtle amber tint */}
      {data.length > UNSETTLED_DAYS && (
        <rect
          x={unsettledX}
          y={0}
          width={unsettledWidth}
          height={height}
          fill="#78350f"
          fillOpacity={0.18}
          rx={1}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  )
}
