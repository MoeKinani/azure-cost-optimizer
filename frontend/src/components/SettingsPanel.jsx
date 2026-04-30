import React, { useState, useEffect } from 'react'
import { X, Settings, Eye, EyeOff, CheckCircle, AlertCircle, Loader, FlaskConical, Info } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client'
import ScopePicker from './ScopePicker'
import DeviceCodeLogin from './DeviceCodeLogin'

function Field({ label, type = 'text', value, onChange, placeholder, masked, hint }) {
  const [show, setShow] = useState(false)
  const inputType = masked ? (show ? 'text' : 'password') : type
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={inputType} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600 pr-10"
        />
        {masked && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

function NumberField({ label, value, onChange, min, max, step = 1, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-600"
      />
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} className={clsx(
      'px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
      active ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300',
    )}>
      {label}
    </button>
  )
}

function StatusMessage({ type, msg }) {
  if (!msg) return null
  const isError = type === 'error'
  return (
    <div className={clsx(
      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
      isError ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400',
    )}>
      {isError ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
      {msg}
    </div>
  )
}

const PROVIDER_OPTIONS = [
  { value: 'azure_openai', label: 'Azure OpenAI', desc: 'Uses your Azure OpenAI resource — credentials stay inside your tenant' },
  { value: 'none',         label: 'Disabled',     desc: 'Rule-based scoring only, no AI narrative or false-positive detection' },
]

export default function SettingsPanel({ open, onClose, onSaved, subscriptions = [], onDisconnect }) {
  const [tab,              setTab]              = useState('azure')
  const [form,    setForm]    = useState({
    azure_client_id: '', azure_client_secret: '', azure_tenant_id: '',
    azure_subscription_id: '', azure_subscription_ids: '',
    selected_scope_id: '', selected_scope_name: '',
    scan_scope_subscription_id: '', scan_scope_resource_group: '',
    ai_provider: 'azure_openai',
    azure_openai_endpoint: '',
    azure_openai_key: '', azure_openai_deployment: 'gpt-4o-mini',
    idle_threshold_pct: 3, no_metrics_age_days: 7,
    cost_floor_usd: 1, ai_cost_threshold_usd: 20,
    cache_ttl_seconds: 1800, demo_mode: false,
    credential_timeout_hours: 0,
  })
  const [loading,    setLoading]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [status,     setStatus]     = useState(null)
  const [authMethod, setAuthMethod] = useState('')

  function handleScopeSelect(scope) {
    if (!scope) {
      setForm(prev => ({ ...prev, selected_scope_id: '', selected_scope_name: '', azure_subscription_ids: '' }))
      return
    }
    const ids = scope.subscriptionIds.join(', ')
    const name = `${scope.name}${scope.subscriptionIds.length > 1 ? ` (${scope.subscriptionIds.length} subscriptions)` : ''}`
    setForm(prev => ({
      ...prev,
      selected_scope_id:   scope.id,
      selected_scope_name: name,
      azure_subscription_ids: ids,
      // Auto-fill primary if empty
      azure_subscription_id: prev.azure_subscription_id || (scope.subscriptionIds[0] ?? ''),
    }))
  }

  useEffect(() => {
    if (!open) return
    api.getAuthMethod().then(r => setAuthMethod(r.method || '')).catch(() => {})
    api.getSettings().then(s => {
      setForm(prev => ({
        ...prev,
        azure_client_id:        s.azure_client_id        ?? '',
        azure_tenant_id:        s.azure_tenant_id        ?? '',
        azure_subscription_id:      s.azure_subscription_id      ?? '',
        azure_subscription_ids:     s.azure_subscription_ids     ?? '',
        selected_scope_id:          s.selected_scope_id          ?? '',
        selected_scope_name:        s.selected_scope_name        ?? '',
        scan_scope_subscription_id: s.scan_scope_subscription_id ?? '',
        scan_scope_resource_group:  s.scan_scope_resource_group  ?? '',
        ai_provider:                s.ai_provider                ?? 'azure_openai',
        azure_openai_endpoint:  s.azure_openai_endpoint  ?? '',
        azure_openai_deployment:s.azure_openai_deployment ?? 'gpt-4o-mini',
        idle_threshold_pct:     s.idle_threshold_pct     ?? 3,
        no_metrics_age_days:    s.no_metrics_age_days    ?? 7,
        cost_floor_usd:         s.cost_floor_usd         ?? 1,
        ai_cost_threshold_usd:  s.ai_cost_threshold_usd  ?? 20,
        cache_ttl_seconds:           s.cache_ttl_seconds            ?? 1800,
        demo_mode:                   s.demo_mode                    ?? false,
        credential_timeout_hours:    s.credential_timeout_hours     ?? 0,
        // masked secrets — leave blank
        azure_client_secret: '',
        azure_openai_key:    '',
        _has_azure_secret:   s.has_azure_secret,
        _has_aoai_key:       s.has_azure_openai_key,
      }))
    }).catch(() => {})
  }, [open])

  function set(key) { return val => setForm(prev => ({ ...prev, [key]: val })) }

  async function save() {
    setLoading(true); setStatus(null)
    try {
      const body = { ...form }
      if (!body.azure_client_secret) delete body.azure_client_secret
      if (!body.azure_openai_key)    delete body.azure_openai_key
      // Map form keys to settings keys
      body.AZURE_CLIENT_ID        = body.azure_client_id
      body.AZURE_TENANT_ID        = body.azure_tenant_id
      body.AZURE_SUBSCRIPTION_ID  = body.azure_subscription_id
      body.AZURE_SUBSCRIPTION_IDS       = body.azure_subscription_ids
      body.SELECTED_SCOPE_ID            = body.selected_scope_id   || ''
      body.SELECTED_SCOPE_NAME          = body.selected_scope_name || ''
      body.SCAN_SCOPE_SUBSCRIPTION_ID   = body.scan_scope_subscription_id || ''
      body.SCAN_SCOPE_RESOURCE_GROUP    = body.scan_scope_resource_group  || ''
      if (body.azure_client_secret) body.AZURE_CLIENT_SECRET = body.azure_client_secret
      if (body.azure_openai_key)    body.AZURE_OPENAI_KEY    = body.azure_openai_key
      body.AZURE_OPENAI_ENDPOINT   = body.azure_openai_endpoint
      body.AZURE_OPENAI_DEPLOYMENT = body.azure_openai_deployment
      body.credential_timeout_hours = body.credential_timeout_hours ?? 0
      await api.saveSettings(body)
      setStatus({ type: 'success', msg: 'Settings saved. Refresh dashboard to apply.' })
      onSaved?.()
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally { setLoading(false) }
  }

  async function testAzure() {
    setTesting(true); setStatus(null)
    try {
      const res = await api.testAzure()
      setStatus({ type: 'success', msg: res.message || 'Azure connection OK!' })
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally { setTesting(false) }
  }

  async function testAI() {
    setTesting(true); setStatus(null)
    try {
      const body = { ai_provider: form.ai_provider }
      if (form.azure_openai_key)        body.AZURE_OPENAI_KEY        = form.azure_openai_key
      if (form.azure_openai_endpoint)   body.AZURE_OPENAI_ENDPOINT   = form.azure_openai_endpoint
      if (form.azure_openai_deployment) body.AZURE_OPENAI_DEPLOYMENT = form.azure_openai_deployment
      const res = await api.testAI(body)
      setStatus({ type: 'success', msg: res.message || 'AI connection OK!' })
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally { setTesting(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-4">
          {[['azure','Azure'], ['ai','AI Provider'], ['scoring','Scoring'], ['general','General']].map(([k, l]) => (
            <Tab key={k} label={l} active={tab === k} onClick={() => setTab(k)} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* ── Azure tab ── */}
          {tab === 'azure' && (
            <>
              {/* ── Interactive sign-in (device code) ── */}
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">Microsoft Account</p>
                <DeviceCodeLogin onAuthChange={(s) => {
                  if (s === 'authenticated') setStatus({ type: 'success', msg: 'Signed in. Refresh dashboard to scan.' })
                }} />
              </div>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 border-t border-gray-800" />
                <span className="text-xs text-gray-600">or use a Service Principal</span>
                <div className="flex-1 border-t border-gray-800" />
              </div>

              {/* ── Reconfigure button (shown when connected) ── */}
              {form.azure_subscription_id && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/40">
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle size={13} className="shrink-0" />
                    {(() => {
                      const sub = subscriptions.find(s => s.subscription_id === form.azure_subscription_id)
                      const name = sub?.subscription_name
                      return name
                        ? <span>Connected to <span className="font-medium text-white">{name}</span></span>
                        : <span>Connected to <span className="font-mono">{form.azure_subscription_id.slice(0, 8)}…</span></span>
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setForm(prev => ({ ...prev, azure_subscription_id: '', azure_client_id: '', azure_tenant_id: '', azure_client_secret: '' }))
                      await api.saveSettings({
                        AZURE_SUBSCRIPTION_ID: '',
                        AZURE_CLIENT_ID: '',
                        AZURE_TENANT_ID: '',
                        AZURE_CLIENT_SECRET: '',
                        persist_to_env: true,
                      }).catch(() => {})
                      if (onDisconnect) { onDisconnect(); return }
                      setStatus({ type: 'success', msg: 'Disconnected. Refresh the page to run the setup wizard again.' })
                    }}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors underline underline-offset-2"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* ── Service Principal instructions ── */}
              <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Info size={13} className="text-blue-400 shrink-0" />
                  <p className="text-xs font-semibold text-blue-300">Required roles — assign at Management Group scope</p>
                </div>
                <ul className="text-xs text-gray-400 space-y-1 pl-1">
                  <li><strong className="text-gray-300">Reader</strong> — enumerate resources and their properties</li>
                  <li><strong className="text-gray-300">Cost Management Reader</strong> — pull spend and billing data</li>
                  <li><strong className="text-gray-300">Monitoring Reader</strong> — fetch CPU, memory and network metrics</li>
                  <li><strong className="text-gray-300">Management Group Reader</strong> — required for the scope picker</li>
                </ul>
                <p className="text-xs text-gray-600 pt-1">
                  Assign at Management Group scope so roles cascade to all subscriptions beneath it.
                  Portal → Management Groups → your root MG → Access control (IAM) → Add role assignment
                </p>
              </div>
              <Field label="Tenant ID"       value={form.azure_tenant_id}       onChange={set('azure_tenant_id')}       placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              <Field label="Client ID"       value={form.azure_client_id}       onChange={set('azure_client_id')}       placeholder="App registration client ID" />
              <Field label="Client Secret"   value={form.azure_client_secret}   onChange={set('azure_client_secret')}   placeholder={form._has_azure_secret ? '(already set — leave blank to keep)' : 'Paste new secret'} masked />
              <Field label="Primary Subscription ID" value={form.azure_subscription_id} onChange={set('azure_subscription_id')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />

              {/* Management group scope picker */}
              <ScopePicker
                selectedScopeId={form.selected_scope_id}
                selectedScopeName={form.selected_scope_name}
                onSelect={handleScopeSelect}
                authMethod={authMethod}
              />

              {/* Manual override — shown when no scope is selected, or as read-only confirmation */}
              {form.azure_subscription_ids && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    Resolved subscription IDs
                    {form.selected_scope_name && <span className="text-gray-700 ml-1">(from scope above)</span>}
                  </label>
                  <textarea
                    value={form.azure_subscription_ids}
                    onChange={e => {
                      setForm(prev => ({ ...prev, azure_subscription_ids: e.target.value, selected_scope_id: '', selected_scope_name: '' }))
                    }}
                    rows={3}
                    placeholder="id1, id2, id3 — comma-separated"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400 font-mono placeholder-gray-700 focus:outline-none focus:border-blue-600 resize-none"
                  />
                  <p className="text-xs text-gray-700">Edit directly to override the scope selection.</p>
                </div>
              )}
              <button onClick={testAzure} disabled={testing} className="btn-ghost flex items-center gap-2 text-sm">
                {testing && <Loader size={14} className="animate-spin" />} Test Azure Connection
              </button>

              {/* ── Scan Scope ── */}
              <div className="pt-3 border-t border-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <FlaskConical size={13} className="text-amber-400" />
                  <p className="text-xs font-semibold text-amber-300">Scan Scope (Test Mode)</p>
                  {(form.scan_scope_subscription_id || form.scan_scope_resource_group) && (
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/50 text-xs text-amber-400 font-medium">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mb-3">
                  Limit scans to a specific subscription or resource group. Perfect for validating the tool before scanning everything.
                  Leave blank to scan all subscriptions.
                </p>
                <div className="space-y-3">
                  <Field
                    label="Test Subscription ID (optional)"
                    value={form.scan_scope_subscription_id}
                    onChange={set('scan_scope_subscription_id')}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    hint="Only this subscription will be scanned. Must be in your subscription list above."
                  />
                  <Field
                    label="Test Resource Group (optional)"
                    value={form.scan_scope_resource_group}
                    onChange={set('scan_scope_resource_group')}
                    placeholder="my-test-rg"
                    hint="Only resources in this resource group will be scanned."
                  />
                  {(form.scan_scope_subscription_id || form.scan_scope_resource_group) && (
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, scan_scope_subscription_id: '', scan_scope_resource_group: '' }))}
                      className="text-xs text-amber-600 hover:text-amber-400 underline underline-offset-2 transition-colors"
                    >
                      Clear scope — scan everything
                    </button>
                  )}
                </div>
              </div>

              {/* ── Credential auto-wipe timeout ── */}
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs font-semibold text-gray-400 mb-1">Credential Timeout</p>
                <p className="text-xs text-gray-600 mb-3">
                  Automatically wipe stored service principal credentials after this many hours of inactivity.
                  Set to <strong className="text-gray-500">0</strong> to disable. Recommended: 8h for shared machines.
                </p>
                <NumberField
                  label="Auto-wipe after (hours, 0 = never)"
                  value={form.credential_timeout_hours}
                  onChange={set('credential_timeout_hours')}
                  min={0} max={168} step={1}
                  hint={form.credential_timeout_hours > 0
                    ? `Credentials will be wiped after ${form.credential_timeout_hours}h of no scan activity.`
                    : 'Credentials persist until manually cleared.'}
                />
              </div>
            </>
          )}

          {/* ── AI Provider tab ── */}
          {tab === 'ai' && (
            <>
              {/* Provider selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400">AI Provider</label>
                <div className="space-y-2">
                  {PROVIDER_OPTIONS.map(opt => (
                    <label key={opt.value} className={clsx(
                      'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      form.ai_provider === opt.value
                        ? 'border-blue-600 bg-blue-900/20'
                        : 'border-gray-700 bg-gray-800/40 hover:border-gray-600',
                    )}>
                      <input type="radio" name="ai_provider" value={opt.value}
                        checked={form.ai_provider === opt.value}
                        onChange={() => setForm(prev => ({ ...prev, ai_provider: opt.value }))}
                        className="mt-0.5 accent-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Azure OpenAI fields */}
              {form.ai_provider === 'azure_openai' && (
                <div className="space-y-3 pt-2 border-t border-gray-800">
                  <p className="text-xs text-gray-500">
                    Requires Azure OpenAI resource. Find credentials in <span className="text-blue-400">Azure Portal → OpenAI → Keys and Endpoint</span>.
                  </p>
                  <Field label="Endpoint" value={form.azure_openai_endpoint} onChange={set('azure_openai_endpoint')}
                    placeholder="https://your-resource.openai.azure.com/"
                    hint="Base URL only — e.g. https://my-resource.openai.azure.com/ — do not include /openai/v1" />
                  <Field label="API Key" value={form.azure_openai_key} onChange={set('azure_openai_key')}
                    placeholder={form._has_aoai_key ? '(already set — leave blank to keep)' : 'Paste key'} masked />
                  <Field label="Deployment Name" value={form.azure_openai_deployment} onChange={set('azure_openai_deployment')}
                    placeholder="gpt-4o-mini"
                    hint="The name YOU gave the deployment in Azure OpenAI Studio — not the model name. Find it under Azure Portal → Azure OpenAI → Model deployments." />
                </div>
              )}

              {/* Cost threshold (shown for all providers) */}
              {form.ai_provider !== 'none' && (
                <NumberField label="Min cost to send to AI (USD/mo)" value={form.ai_cost_threshold_usd}
                  onChange={set('ai_cost_threshold_usd')} min={0} step={5}
                  hint="Only resources above this cost are eligible for AI review." />
              )}

              {form.ai_provider !== 'none' && (
                <button onClick={testAI} disabled={testing} className="btn-ghost flex items-center gap-2 text-sm">
                  {testing && <Loader size={14} className="animate-spin" />} Test AI Connection
                </button>
              )}
            </>
          )}

          {/* ── Scoring tab ── */}
          {tab === 'scoring' && (
            <>
              {/* How scoring works */}
              <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info size={13} className="text-blue-400 shrink-0" />
                  <p className="text-xs font-semibold text-gray-300">How scoring works</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Each resource is scored 0–100 based on signals pulled from Azure Monitor, Cost Management, and Advisor.
                  A higher score means the resource is earning its cost; a lower score means it's a waste candidate.
                </p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-gray-300 font-medium w-28">Fully Used</span>
                    <span className="text-gray-500">Score ≥ 76 — resource is actively earning its cost</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-gray-300 font-medium w-28">Actively Used</span>
                    <span className="text-gray-500">Score 51–75 — used but has room to optimise</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-gray-300 font-medium w-28">Likely Waste</span>
                    <span className="text-gray-500">Score 26–50 — low activity, review recommended</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-gray-300 font-medium w-28">Confirmed Waste</span>
                    <span className="text-gray-500">Score ≤ 25 — negligible activity, safe to act on</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                    <span className="text-gray-300 font-medium w-28">Unknown</span>
                    <span className="text-gray-500">No metrics returned — Diagnostics not enabled</span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 border-t border-gray-700 pt-2 mt-1">
                  Signals include: average + peak CPU/memory, network activity, request count, days since last use, workload pattern (bursty/declining/inactive), resource locks, and Reserved Instance coverage.
                  Resources with locks or RI coverage are flagged as protected and floored at score 26 regardless of utilisation.
                </p>
              </div>

            </>
          )}

          {/* ── General tab ── */}
          {tab === 'general' && (
            <>
              <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Info size={13} className="text-blue-400 shrink-0" />
                  <p className="text-xs font-semibold text-gray-300">About caching</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  A full scan queries Azure Monitor, Cost Management, Advisor, and Resource Graph — it can take 30–90 seconds depending on your subscription size.
                  Results are cached in memory so subsequent dashboard loads are instant. The cache is cleared automatically when you change settings or click Refresh.
                </p>
              </div>
              <NumberField label="Cache TTL (seconds)" value={form.cache_ttl_seconds} onChange={set('cache_ttl_seconds')} min={60} max={86400} step={60}
                hint="How long scan results are kept before a forced re-fetch. Default 1800s (30 min). Lower = fresher data but more Azure API calls." />
            </>
          )}

          {status && <StatusMessage {...status} />}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
            {loading && <Loader size={14} className="animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
