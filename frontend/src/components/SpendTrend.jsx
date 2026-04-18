import React, { useMemo } from 'react'
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

// Trailing zeros in current-month data beyond this count are billing lag, not real $0
const MAX_PENDING_DAYS = 3

// If the entire current-month array sums to zero, treat it as billing data not yet settled
function isCurrMonthEmpty(totals) {
  return totals.every(v => v === 0)
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtShort(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function fmtFull(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function monthName(offsetMonths = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offsetMonths)
  return d.toLocaleString('en-US', { month: 'long' })
}

// ── Build series ───────────────────────────────────────────────────────────────

/**
 * Prefer the pre-computed aggregate totals from the backend (totalDailyCm/Pm).
 * These come from a date-only query with no ResourceId grouping, so they never
 * hit the 1 000-row pagination limit that truncates per-resource daily data.
 * Fall back to summing per-resource arrays only when the aggregates are absent.
 */
function buildSeries(resources, totalDailyCm, totalDailyPm) {
  // ── Resolve source arrays ──────────────────────────────────────────────────
  let currTotals, prevTotals

  if (totalDailyCm.length > 0 || totalDailyPm.length > 0) {
    // Fast path: use pre-aggregated data from backend
    currTotals = totalDailyCm
    prevTotals = totalDailyPm
  } else {
    // Fallback: sum per-resource arrays (may be truncated by pagination)
    if (!resources.length) return { data: [], currLen: 0, prevLen: 0 }

    let maxCurr = 0, maxPrev = 0
    for (const r of resources) {
      if (Array.isArray(r.daily_costs_cm)) maxCurr = Math.max(maxCurr, r.daily_costs_cm.length)
      if (Array.isArray(r.daily_costs_pm)) maxPrev = Math.max(maxPrev, r.daily_costs_pm.length)
    }
    if (!maxCurr && !maxPrev) return { data: [], currLen: 0, prevLen: 0 }

    currTotals = Array(maxCurr).fill(0)
    prevTotals = Array(maxPrev).fill(0)
    for (const r of resources) {
      if (Array.isArray(r.daily_costs_cm))
        for (let i = 0; i < r.daily_costs_cm.length; i++) currTotals[i] += r.daily_costs_cm[i] || 0
      if (Array.isArray(r.daily_costs_pm))
        for (let i = 0; i < r.daily_costs_pm.length; i++) prevTotals[i] += r.daily_costs_pm[i] || 0
    }
  }

  if (!currTotals.length && !prevTotals.length) return { data: [], currLen: 0, prevLen: 0 }

  const maxCurr = currTotals.length
  const maxPrev = prevTotals.length

  // If the whole current-month array is zero, billing data hasn't settled yet
  const noCurrData = isCurrMonthEmpty(currTotals)

  // Detect billing-lag trailing zeros in the current month (only relevant when data exists)
  let trailingZeros = 0
  if (!noCurrData) {
    for (let i = currTotals.length - 1; i >= 0; i--) {
      if (currTotals[i] > 0) break
      trailingZeros++
    }
  }
  const pendingDays  = Math.min(trailingZeros, MAX_PENDING_DAYS)
  const pendingStart = currTotals.length - pendingDays

  const len = Math.max(maxCurr, maxPrev)
  const data = Array.from({ length: len }, (_, i) => ({
    day:     i + 1,
    // Hide the current-month line entirely when no billing data has settled
    curr:    (!noCurrData && i < maxCurr) ? Math.round(currTotals[i] * 100) / 100 : null,
    prev:    i < maxPrev ? Math.round(prevTotals[i] * 100) / 100 : null,
    pending: !noCurrData && i >= pendingStart && i < maxCurr,
  }))

  return { data, currLen: maxCurr, prevLen: maxPrev, pendingDays, currTotals, prevTotals, noCurrData }
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currMonth, prevMonth }) {
  if (!active || !payload?.length) return null
  const curr      = payload.find(p => p.dataKey === 'curr')
  const prev      = payload.find(p => p.dataKey === 'prev')
  const isPending = payload[0]?.payload?.pending

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl text-xs min-w-[165px]">
      <p className="text-gray-400 mb-2 font-medium">Day {label}</p>
      {curr?.value != null && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-blue-400 font-medium">{currMonth}</span>
          <span className="text-white font-bold tabular-nums">{fmtFull(curr.value)}</span>
        </div>
      )}
      {prev?.value != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">{prevMonth}</span>
          <span className="text-gray-300 tabular-nums">{fmtFull(prev.value)}</span>
        </div>
      )}
      {curr?.value != null && prev?.value != null && (
        <div className={clsx(
          'mt-2 pt-2 border-t border-gray-700/60 tabular-nums font-semibold',
          curr.value > prev.value ? 'text-red-400' : 'text-green-400',
        )}>
          {curr.value > prev.value ? '▲' : '▼'} {fmtShort(Math.abs(curr.value - prev.value))} vs last month
        </div>
      )}
      {isPending && (
        <p className="mt-1.5 text-amber-500/80 border-t border-gray-700/60 pt-1.5">
          ⏳ Billing may not have fully settled
        </p>
      )}
    </div>
  )
}

// ── Top cost movers ────────────────────────────────────────────────────────────

function TopMovers({ resources }) {
  const { risers, fallers } = useMemo(() => {
    const eligible = resources.filter(r =>
      r.cost_current_month > 1 &&
      (r.cost_previous_month_mtd > 0 || r.cost_previous_month > 0) &&
      r.cost_delta_pct != null &&
      r.cost_delta_pct !== 0
    )

    const byDelta = [...eligible].sort(
      (a, b) => Math.abs(b.cost_delta_pct) - Math.abs(a.cost_delta_pct)
    )

    const risers  = byDelta.filter(r => r.cost_delta_pct > 0).slice(0, 4)
    const fallers = byDelta.filter(r => r.cost_delta_pct < 0).slice(0, 3)
    return { risers, fallers }
  }, [resources])

  if (!risers.length && !fallers.length) return null

  function MoverRow({ r, isRiser }) {
    const pct     = Math.abs(r.cost_delta_pct).toFixed(1)
    const prevRef = r.cost_delta_is_mtd && r.cost_previous_month_mtd > 0
      ? r.cost_previous_month_mtd
      : r.cost_previous_month
    const diff    = r.cost_current_month - prevRef
    return (
      <div className="flex items-center gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
        <div className={clsx(
          'shrink-0 w-6 h-6 rounded-md flex items-center justify-center',
          isRiser ? 'bg-red-900/40' : 'bg-green-900/40',
        )}>
          {isRiser
            ? <TrendingUp size={11} className="text-red-400" />
            : <TrendingDown size={11} className="text-green-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-200 truncate font-medium" title={r.resource_name}>
            {r.resource_name}
          </p>
          <p className="text-xs text-gray-600 truncate">{r.resource_group}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={clsx('text-xs font-bold tabular-nums', isRiser ? 'text-red-400' : 'text-green-400')}>
            {isRiser ? '+' : ''}{pct}%
          </p>
          <p className="text-xs text-gray-600 tabular-nums"
             title={r.cost_delta_is_mtd ? 'vs same days last month' : 'vs full last month'}>
            {diff > 0 ? '+' : ''}{fmtShort(diff)} {r.cost_delta_is_mtd ? 'MTD' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {risers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp size={11} className="text-red-400" /> Top Risers
          </p>
          {risers.map(r => <MoverRow key={r.resource_id} r={r} isRiser={true} />)}
        </div>
      )}
      {fallers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingDown size={11} className="text-green-400" /> Top Fallers
          </p>
          {fallers.map(r => <MoverRow key={r.resource_id} r={r} isRiser={false} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SpendTrend({ resources = [], totalDailyCm = [], totalDailyPm = [] }) {
  const currMonth = monthName(0)
  const prevMonth = monthName(-1)

  const { data, currLen, prevLen, currTotals, prevTotals, noCurrData } = useMemo(
    () => buildSeries(resources, totalDailyCm, totalDailyPm),
    [resources, totalDailyCm, totalDailyPm],
  )

  const stats = useMemo(() => {
    if (!data.length) return null

    // Settled days = current month excluding any trailing-zero billing-lag tail
    const settledCurr = (currTotals || []).filter(v => v > 0)
    const mtdTotal    = (currTotals || []).reduce((s, v) => s + v, 0)
    const prevTotal   = (prevTotals || []).reduce((s, v) => s + v, 0)
    const dailyAvg    = settledCurr.length > 0 ? mtdTotal / currLen : 0

    // Pace: project full month if we continue at current daily avg
    const daysInMonth = prevLen || 30
    const projected   = dailyAvg * daysInMonth

    // MTD vs same-period last month
    const prevSamePeriod = (prevTotals || []).slice(0, currLen).reduce((s, v) => s + v, 0)
    const mtdPct = prevSamePeriod > 0
      ? ((mtdTotal - prevSamePeriod) / prevSamePeriod) * 100
      : 0

    return { mtdTotal, prevTotal, dailyAvg, projected, mtdPct, daysInMonth }
  }, [data, currLen, prevLen, currTotals, prevTotals])

  if (!data.length || !stats) return null

  const avgLine = Math.round(stats.dailyAvg * 100) / 100

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            {noCurrData
              ? `30-Day Spend Trend — ${prevMonth}`
              : `Daily Spend — ${currMonth} vs ${prevMonth}`}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {noCurrData
              ? `${currMonth} billing data not yet settled — showing ${prevMonth}`
              : 'Daily total cost across all resources'}
          </p>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-3 text-xs">
          {!noCurrData && (
            <>
              <div className="flex flex-col items-end">
                <span className="text-gray-600">{currMonth} MTD</span>
                <span className="font-bold text-white tabular-nums">{fmtShort(stats.mtdTotal)}</span>
              </div>
              <div className="w-px bg-gray-800" />
            </>
          )}
          <div className="flex flex-col items-end">
            <span className="text-gray-600">{prevMonth} total</span>
            <span className="font-bold text-white tabular-nums">{fmtShort(stats.prevTotal)}</span>
          </div>
          {!noCurrData && (
            <>
              <div className="w-px bg-gray-800" />
              <div className="flex flex-col items-end">
                <span className="text-gray-600">MTD vs same period</span>
                <span className={clsx(
                  'font-bold tabular-nums flex items-center gap-1',
                  stats.mtdPct > 5  ? 'text-red-400' :
                  stats.mtdPct < -5 ? 'text-green-400' : 'text-gray-400',
                )}>
                  {stats.mtdPct > 5  ? <TrendingUp size={11} />  :
                   stats.mtdPct < -5 ? <TrendingDown size={11} /> : <Minus size={11} />}
                  {stats.mtdPct > 0 ? '+' : ''}{stats.mtdPct.toFixed(1)}%
                </span>
              </div>
              <div className="w-px bg-gray-800" />
              <div className="flex flex-col items-end">
                <span className="text-gray-600">Projected full month</span>
                <span className="font-bold text-white tabular-nums">{fmtShort(stats.projected)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}`}
                interval={4}
              />
              <YAxis
                tickFormatter={v => fmtShort(v)}
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={<ChartTooltip currMonth={currMonth} prevMonth={prevMonth} />}
                cursor={{ stroke: '#374151', strokeWidth: 1 }}
              />
              {avgLine > 0 && (
                <ReferenceLine
                  y={avgLine}
                  stroke="#4b5563"
                  strokeDasharray="4 3"
                  label={{
                    value: `Avg ${fmtShort(avgLine)}`,
                    fill: '#6b7280',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}
              {/* Previous month — gray dashed, full month shape */}
              <Line
                type="monotone"
                dataKey="prev"
                stroke="#4b5563"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3, fill: '#6b7280', strokeWidth: 0 }}
                connectNulls={false}
              />
              {/* Current month — solid blue, stops at today */}
              <Line
                type="monotone"
                dataKey="curr"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="w-56 shrink-0 border-l border-gray-800/60 pl-5">
          {/* Legend */}
          <div className="flex gap-4 mb-4 text-xs">
            {!noCurrData && (
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="inline-block w-5 h-0.5 bg-blue-400 rounded" />
                {currMonth}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-5 border-t border-dashed border-gray-500" />
              {prevMonth}
            </span>
          </div>
          <TopMovers resources={resources} />
        </div>
      </div>
    </div>
  )
}
