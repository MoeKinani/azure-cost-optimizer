import React, { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, AlertCircle, Settings, FlaskConical, Brain, X, Lock, Coffee, Loader } from 'lucide-react'
import clsx from 'clsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-red-400 font-semibold">Something went wrong</p>
        <pre className="text-gray-500 text-xs max-w-lg text-center whitespace-pre-wrap">{this.state.error?.message}</pre>
        <button onClick={() => window.location.reload()} className="text-xs text-blue-400 underline">Reload</button>
      </div>
    )
    return this.props.children
  }
}

import { api } from './api/client'
import KPICards          from './components/KPICards'
import ScoreDonut        from './components/ScoreDonut'
import CostByTypeBar     from './components/CostByTypeBar'
import ResourceTable     from './components/ResourceTable'
import OrphanPanel       from './components/OrphanPanel'
import SavingsPanel      from './components/SavingsPanel'
import ProgressOverlay   from './components/ProgressOverlay'
import SettingsPanel     from './components/SettingsPanel'
import WasteQuadrant     from './components/WasteQuadrant'
import SavingsWaterfall  from './components/SavingsWaterfall'
import RightSizePanel    from './components/RightSizePanel'
import WasteByRG        from './components/WasteByRG'
import WasteByCategory  from './components/WasteByCategory'
import TagCompliance    from './components/TagCompliance'
import FilterBar         from './components/FilterBar'
import AIInsightPanel    from './components/AIInsightPanel'
import BenchmarkPanel    from './components/BenchmarkPanel'
import DrillDownDrawer   from './components/DrillDownDrawer'
import SetupWizard       from './components/SetupWizard'
import ResourceMap       from './components/ResourceMap'
import AIResourcesPanel  from './components/AIResourcesPanel'
import AppServicePanel   from './components/AppServicePanel'
import StoragePanel      from './components/StoragePanel'
import SpendTrend        from './components/SpendTrend'
import ReservationsPanel from './components/ReservationsPanel'
import ExportPDFButton   from './components/ExportPDFButton'

function ErrorView({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="p-4 rounded-full bg-red-900/20">
        <AlertCircle size={32} className="text-red-400" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-red-400 font-semibold text-lg">Failed to load data</p>
        <p className="text-gray-500 text-sm mt-2 font-mono">{message}</p>
      </div>
      <button onClick={onRetry} className="btn-primary">Retry</button>
    </div>
  )
}


const PROVIDER_LABEL = {
  azure_openai: 'Azure OpenAI',
  none:         'AI Off',
}
function providerLabel(p) { return PROVIDER_LABEL[p] ?? 'AI Off' }

function AIStatusBadge({ provider, onOpenSettings }) {
  const active = provider && provider !== 'none'
  return (
    <button
      onClick={onOpenSettings}
      title={active ? `AI scoring active — ${providerLabel(provider)}` : 'Enable AI for better scoring'}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-colors',
        active
          ? 'bg-green-900/30 border-green-700/50 text-green-400 hover:bg-green-900/50'
          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300',
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', active ? 'bg-green-400 animate-pulse' : 'bg-gray-600')} />
      <Brain size={11} />
      <span className="hidden lg:inline">{active ? providerLabel(provider) : 'AI Off'}</span>
    </button>
  )
}

function AIDisabledBanner({ onOpenSettings, onDismiss }) {
  return (
    <div className="bg-amber-900/20 border-b border-amber-700/30 px-6 py-2.5">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-sm">
          <Brain size={14} className="text-amber-400 shrink-0" />
          <span className="text-amber-300">
            <strong>Enable AI for better scoring and assurance results.</strong>
            {' '}AI catches false positives, explains findings in plain English, and adds confidence levels rules alone can't provide.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onOpenSettings}
            className="px-3 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium transition-colors">
            Enable AI
          </button>
          <button onClick={onDismiss} className="text-amber-600 hover:text-amber-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function DemoBanner({ onExitDemo }) {
  return (
    <div className="bg-indigo-900/30 border-b border-indigo-700/40 px-6 py-2 text-xs text-indigo-300">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
        <span>
          <FlaskConical size={12} className="inline mr-1.5 mb-0.5" />
          <strong>Demo Mode</strong> — showing synthetic data. Add your Azure credentials in Settings to connect to your real subscription.
        </span>
        <button
          onClick={onExitDemo}
          className="shrink-0 px-2.5 py-1 rounded-md bg-indigo-700/60 hover:bg-indigo-600/70 text-indigo-200 hover:text-white text-xs font-medium transition-colors border border-indigo-600/50"
        >
          Exit Demo →
        </button>
      </div>
    </div>
  )
}

function CostDataWarningBanner({ warning }) {
  if (!warning) return null
  return (
    <div className="bg-red-950/60 border-b border-red-700/40 px-6 py-2.5">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-2.5 text-sm">
        <AlertCircle size={15} className="text-red-400 shrink-0" />
        <span className="text-red-300">
          <strong>Cost data unavailable:</strong> {warning}
        </span>
      </div>
    </div>
  )
}

function PartialMonthBanner({ kpi }) {
  if (!kpi || kpi.billing_basis !== 'previous_month') return null
  return (
    <div className="bg-amber-900/20 border-b border-amber-700/30 px-6 py-2 text-xs text-amber-300">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-2">
        <span>⚡</span>
        <span>
          <strong>Early-month data:</strong> Only {kpi.billing_days_current} day{kpi.billing_days_current !== 1 ? 's' : ''} of billing recorded this month.
          Savings estimates are based on last month's spend for accuracy.
        </span>
      </div>
    </div>
  )
}

// ── UX1: Read-only trust badge (inline in header) ──────────────────────────────
function ReadOnlyBadge() {
  return (
    <div
      title="Read-only — no changes are made to your Azure environment"
      className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-green-800/40 bg-green-900/20 text-xs text-green-400 cursor-default select-none"
    >
      <Lock size={10} />
      <span className="hidden lg:inline">Read-only</span>
    </div>
  )
}

function BuyMeCoffeeButton() {
  return (
    <a
      href="https://buymeacoffee.com/moekinani"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-800 hover:bg-amber-900/40 text-gray-400 hover:text-amber-400 transition-colors"
      title="Enjoying the tool? Buy me a coffee!"
    >
      <Coffee size={14} />
    </a>
  )
}

// ── UX0: Waste summary banner ──────────────────────────────────────────────────

function fmtBannerAmount(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function WasteSummaryBanner({ data }) {
  if (!data) return null
  const totalWaste = data.kpi?.total_estimated_savings ?? 0
  const totalSpend = data.kpi?.total_cost_current_month ?? 0
  if (totalWaste <= 0) return null

  const wastePct = totalSpend > 0 ? Math.round((totalWaste / totalSpend) * 100) : 0

  // Top waste resource group
  const rgMap = {}
  for (const r of (data.resources ?? [])) {
    const rg = r.resource_group || '(unassigned)'
    rgMap[rg] = (rgMap[rg] ?? 0) + (r.estimated_monthly_savings ?? 0)
  }
  const topRG = Object.entries(rgMap).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="bg-gradient-to-r from-red-950/60 via-orange-950/40 to-transparent border border-orange-800/30 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tabular-nums">{fmtBannerAmount(totalWaste)}</span>
            <span className="text-base text-orange-400 font-medium">/mo potential savings</span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            <span className="text-orange-300 font-semibold">{wastePct}% of your total bill</span>
            {' '}could be eliminated
          </p>
        </div>
        {topRG && topRG[1] > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Top waste source</p>
            <p className="text-sm font-semibold text-orange-300 truncate max-w-[260px]">{topRG[0]}</p>
            <p className="text-xs text-gray-500 mt-0.5">{fmtBannerAmount(topRG[1])} in savings</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ScopeBanner({ data, onOpenSettings }) {
  if (!data?.scan_scope_active) return null
  const parts = []
  if (data.active_subscription_id) parts.push(`subscription ${data.active_subscription_id.slice(0, 8)}…`)
  if (data.active_resource_group)  parts.push(`resource group "${data.active_resource_group}"`)
  return (
    <div className="bg-amber-900/20 border-b border-amber-700/30 px-6 py-2">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-amber-300">
          <FlaskConical size={13} className="text-amber-400 shrink-0" />
          <span>
            <strong>Test Scope Active</strong> — scanning only {parts.join(' + ')}.
            {' '}Results represent a subset of your environment.
          </span>
        </div>
        <button
          onClick={onOpenSettings}
          className="shrink-0 text-xs text-amber-500 hover:text-amber-300 underline underline-offset-2 transition-colors"
        >
          Change scope
        </button>
      </div>
    </div>
  )
}

function AppInner() {
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [error,         setError]         = useState(null)
  const [settingsOpen,          setSettingsOpen]          = useState(false)
  const [isDemoMode,            setIsDemoMode]            = useState(false)
  const [aiProvider,            setAiProvider]            = useState('none')
  const [aiBannerHidden,        setAiBannerHidden]        = useState(
    () => sessionStorage.getItem('ai-banner-dismissed') === '1'
  )
  const [selectedSubscription,  setSelectedSubscription]  = useState('')
  const [selectedResourceGroup, setSelectedResourceGroup] = useState('')
  const [drillDownType,  setDrillDownType]  = useState(null)   // opens the drill drawer
  const [tableFilter,    setTableFilter]    = useState(null)   // { field, value, label }
  const [appSettings,    setAppSettings]    = useState(null)   // null=loading, object=ready
  const [launched,       setLaunched]       = useState(false)  // false=connect page, true=dashboard
  const [view,           setView]           = useState('dashboard') // 'dashboard' | 'map' | 'ai'

  // SSE progress state
  const [progressSteps, setProgressSteps] = useState([])
  const [progressPct,   setProgressPct]   = useState(0)
  const [progressMsg,   setProgressMsg]   = useState('')

  const sseCleanup = useRef(null)

  const load = useCallback(async (forceRefresh = false, rgFilter = selectedResourceGroup) => {
    // Clean up any existing SSE connection
    if (sseCleanup.current) {
      sseCleanup.current()
      sseCleanup.current = null
    }

    setError(null)
    setProgressSteps([])
    setProgressPct(0)
    setProgressMsg('')

    if (forceRefresh) setRefreshing(true)
    else setLoading(true)

    // Build query params
    const params = new URLSearchParams()
    if (forceRefresh) params.set('refresh', 'true')
    // Always send resource_group when the user has touched the dropdown —
    // empty string signals "All" (clears scope override); null/undefined means "not specified".
    if (rgFilter !== null && rgFilter !== undefined) params.set('resource_group', rgFilter)

    // Try SSE stream first
    const cleanup = api.streamDashboard(
      // onEvent — progress update
      (event) => {
        if (event.type === 'progress') {
          setProgressPct(event.pct ?? 0)
          setProgressMsg(event.message ?? '')
          if (event.step) {
            setProgressSteps(prev => prev.includes(event.step) ? prev : [...prev, event.step])
          }
        }
      },
      // onDone — full dashboard payload
      (dashboardData) => {
        setData(dashboardData)
        setIsDemoMode(dashboardData.demo_mode ?? false)
        setAiProvider(dashboardData.ai_provider ?? 'none')
        // Always sync scope back — including empty string when "All" was selected,
        // so the dropdown resets correctly instead of sticking on the previous RG.
        setSelectedResourceGroup(dashboardData.active_resource_group ?? '')
        if (dashboardData.active_subscription_id) setSelectedSubscription(dashboardData.active_subscription_id)
        setLoading(false)
        setRefreshing(false)
        setProgressPct(100)
        sseCleanup.current = null
      },
      // onError — fall back to regular endpoint
      async (err) => {
        console.warn('SSE connection failed, retrying with REST...')
        try {
          const result = await api.getDashboard(forceRefresh)
          setData(result)
          setIsDemoMode(result.demo_mode ?? false)
          setAiProvider(result.ai_provider ?? 'none')
        } catch (fetchErr) {
          setError(fetchErr.message)
        } finally {
          setLoading(false)
          setRefreshing(false)
          sseCleanup.current = null
        }
      },
      params,
    )

    sseCleanup.current = cleanup
  }, [])

  // Load settings once on startup — always show connect page first
  useEffect(() => {
    api.getSettings()
      .then(s => setAppSettings(s))
      .catch(() => setAppSettings({}))
  }, [])

  // Start scan only after user clicks Launch on the connect page
  useEffect(() => {
    if (!launched) return
    load()
    return () => { if (sseCleanup.current) sseCleanup.current() }
  }, [launched, load])

  const handleSettingsSaved = useCallback(() => {
    setSettingsOpen(false)
    setTimeout(() => load(true), 300)
  }, [load])

  const handleResourceGroupChange = useCallback((rg) => {
    setSelectedResourceGroup(rg)
    load(true, rg)
  }, [load])

  const handleTableFilter = useCallback((filter) => {
    setTableFilter(filter)
    setTimeout(() => {
      document.getElementById('resource-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const handleResourceDetailClick = useCallback((r) => {
    if (!r?.resource_name) return
    setView('dashboard')
    setTimeout(() => {
      setTableFilter({ field: 'resource_name', value: r.resource_name, label: r.resource_name })
      setTimeout(() => {
        document.getElementById('resource-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }, 50)
  }, [])

  const handleWasteQuadrantClick = useCallback((dot) => {
    // Filter table to that resource by name
    if (!dot?.name) return
    setTableFilter({ field: 'resource_name', value: dot.name, label: dot.name })
    setTimeout(() => {
      document.getElementById('resource-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  // Show connect page until user hits Start Scan
  if (!launched) {
    if (appSettings === null) return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <Loader size={26} className="text-blue-400 animate-spin" />
        </div>
        <p className="text-xs text-gray-500">Connecting to backend…</p>
      </div>
    )
    return (
      <SetupWizard
        settings={appSettings}
        onLaunch={(rg) => {
          if (rg) setSelectedResourceGroup(rg)
          setLaunched(true)
        }}
      />
    )
  }

  const isStreaming = (loading || refreshing) && progressPct < 100

  if (isStreaming) {
    return (
      <ProgressOverlay
        steps={progressSteps}
        currentPct={progressPct}
        currentMessage={progressMsg}
      />
    )
  }

  if (error && !data) return <ErrorView message={error} onRetry={() => load()} />

  return (
    <div className="min-h-screen bg-gray-950">
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={handleSettingsSaved} subscriptions={data?.subscriptions || []} onDisconnect={() => { setSettingsOpen(false); setLaunched(false) }} />

      <DrillDownDrawer
        type={drillDownType}
        resources={data?.resources ?? []}
        savingsRecs={data?.savings_recommendations ?? []}
        onClose={() => setDrillDownType(null)}
        onApplyTableFilter={(filter) => {
          handleTableFilter(filter)
        }}
      />

      {isDemoMode && (
        <DemoBanner onExitDemo={async () => {
          await api.saveSettings({ demo_mode: false })
          setIsDemoMode(false)
          setSettingsOpen(true)
        }} />
      )}
      {!isDemoMode && data?.scan_scope_active && (
        <ScopeBanner data={data} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      {!isDemoMode && <CostDataWarningBanner warning={data?.cost_data_warning} />}
      {!isDemoMode && <PartialMonthBanner kpi={data?.kpi} />}
      {!isDemoMode && aiProvider === 'none' && !aiBannerHidden && (
        <AIDisabledBanner
          onOpenSettings={() => setSettingsOpen(true)}
          onDismiss={() => {
            setAiBannerHidden(true)
            sessionStorage.setItem('ai-banner-dismissed', '1')
          }}
        />
      )}

      <FilterBar
        subscriptions={data?.subscriptions ?? []}
        resourceGroups={data?.resource_groups ?? []}
        selectedSubscription={selectedSubscription}
        selectedResourceGroup={selectedResourceGroup}
        onSubscriptionChange={setSelectedSubscription}
        onResourceGroupChange={handleResourceGroupChange}
      />

      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800/60 px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-base font-bold text-white leading-none">Azure Cost Optimizer</h1>
            <span className="text-xs text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded-full border border-blue-700/40 font-medium">Preview</span>
            {isDemoMode && <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-700/40">Demo</span>}
          </div>

          {/* Nav tabs */}
          <nav className="flex items-center gap-1 bg-gray-900/60 border border-gray-800 rounded-lg p-1">
            {[
              { key: 'dashboard',     label: 'Dashboard'      },
              { key: 'appservice',    label: 'App Services'   },
              { key: 'storage',       label: 'Storage'        },
              { key: 'reservations',  label: 'Reservations'   },
              { key: 'ai',            label: 'AI Costs'       },
              { key: 'map',           label: 'Resource Map'   },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                  view === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs text-orange-400 bg-orange-900/20 px-2 py-1 rounded-md">
                ⚠ Cached
              </span>
            )}
            <ReadOnlyBadge />
            <AIStatusBadge provider={aiProvider} onOpenSettings={() => setSettingsOpen(true)} />
            <ExportPDFButton data={data} />
            <BuyMeCoffeeButton />
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Settings"
            >
              <Settings size={14} />
            </button>
            {data?.last_refreshed && !refreshing && (
              <span className="text-xs text-gray-500 hidden sm:block">
                {new Date(data.last_refreshed).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                'bg-blue-600 hover:bg-blue-500 text-white',
                refreshing && 'opacity-60 cursor-not-allowed',
              )}
            >
              <RefreshCw size={12} className={clsx(refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

        {/* ── Resource Map view ── */}
        {view === 'map' && (
          <ResourceMap resources={data?.resources ?? []} />
        )}

        {/* ── App Services view ── */}
        {view === 'appservice' && (
          <AppServicePanel resources={data?.resources ?? []} onResourceClick={handleResourceDetailClick} />
        )}

        {/* ── Storage view ── */}
        {view === 'storage' && (
          <StoragePanel resources={data?.resources ?? []} onResourceClick={handleResourceDetailClick} />
        )}

        {/* ── Reservations view ── */}
        {view === 'reservations' && (
          <ReservationsPanel
            resources={data?.resources ?? []}
            activeReservations={data?.active_reservations ?? []}
            overCommitmentUsd={data?.reservation_over_commitment_usd ?? 0}
            reservationRecommendations={data?.reservation_recommendations ?? []}
          />
        )}

        {/* ── AI Costs view ── */}
        {view === 'ai' && (
          <AIResourcesPanel resources={data?.resources ?? []} onResourceClick={handleResourceDetailClick} />
        )}

        {/* ── Dashboard view ── */}
        {view === 'dashboard' && <>

        {/* Waste summary banner — first thing seen */}
        <WasteSummaryBanner data={data} />

        {/* AI Insight Panel */}
        <AIInsightPanel
          narrative={data?.ai_narrative}
          provider={aiProvider}
          aiEnabled={data?.ai_enabled}
        />

        {/* KPI Row */}
        <KPICards
          kpi={data?.kpi}
          aiEnabled={data?.ai_enabled}
          totalCarbon={data?.total_carbon_kg}
          tagCompliancePct={data?.tag_compliance_pct}
          resources={data?.resources ?? []}
          savingsRecs={data?.savings_recommendations ?? []}
          onDrillDown={(type) => {
            if (type === 'reservations') { setView('reservations'); return }
            setDrillDownType(type)
          }}
        />

        {/* Industry Benchmark Panel */}
        <BenchmarkPanel
          kpi={data?.kpi}
          resources={data?.resources ?? []}
          resourceTypeSummary={data?.resource_type_summary ?? []}
          tagCompliancePct={data?.tag_compliance_pct ?? null}
        />

        {/* Spend Trend + Top Movers */}
        <SpendTrend
          resources={data?.resources ?? []}
          totalDailyCm={data?.total_daily_cm ?? []}
          totalDailyPm={data?.total_daily_pm ?? []}
        />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ScoreDonut
            data={data?.score_distribution}
            onSegmentClick={(label) => handleTableFilter({ field: 'score_label', value: label, label: `Score: ${label}` })}
          />
          <CostByTypeBar
            data={data?.resource_type_summary}
            onBarClick={(filter) => filter ? handleTableFilter(filter) : setTableFilter(null)}
          />
          <WasteByCategory
            resources={data?.resources ?? []}
            onBarClick={(filter) => filter ? handleTableFilter(filter) : setTableFilter(null)}
          />
        </div>

        {/* Waste Quadrant + Savings Waterfall */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <WasteQuadrant resources={data?.resources ?? []} onResourceClick={handleWasteQuadrantClick} />
          <SavingsWaterfall
            recommendations={data?.savings_recommendations ?? []}
            resources={data?.resources ?? []}
          />
        </div>

        {/* Orphan + Savings Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <OrphanPanel orphans={data?.orphans} />
          <SavingsPanel recommendations={data?.savings_recommendations} />
        </div>

        {/* Right-Sizing Row (only when opportunities exist) */}
        {data?.rightsize_opportunities?.length > 0 && (
          <RightSizePanel opportunities={data?.rightsize_opportunities} />
        )}

        {/* Waste by RG + Tag Compliance Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <WasteByRG
            resources={data?.resources ?? []}
            onBarClick={(filter) => filter ? handleTableFilter(filter) : setTableFilter(null)}
          />
          <TagCompliance
            resources={data?.resources ?? []}
            tagCompliancePct={data?.tag_compliance_pct ?? 100}
            totalUntagged={data?.total_untagged ?? 0}
          />
        </div>

        {/* Full Resource Table */}
        <ResourceTable
          resources={data?.resources}
          externalFilter={tableFilter}
          onClearExternalFilter={() => setTableFilter(null)}
        />

        </> /* end dashboard view */}

      </main>

      <footer className="border-t border-gray-800/60 mt-6 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between text-xs text-gray-700">
          <span>Azure Cost Optimizer · Cost Management + Monitor + Advisor + AI</span>
          <div className="flex items-center gap-4">
            <span>Fully Used ≥76 · Actively Used 51–75 · Likely Waste 26–50 · Confirmed Waste ≤25 · Unknown = no metrics</span>
            <a
              href="https://buymeacoffee.com/moekinani"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-amber-700 hover:text-amber-500 transition-colors"
            >
              <Coffee size={11} />
              <span>Buy me a coffee</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
