import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import {
  Key, RefreshCw, Loader, CheckCircle, ChevronRight,
  ChevronLeft, Cloud, Eye, EyeOff, AlertCircle, Layers, Settings,
  Zap, Info,
} from 'lucide-react'
import { api } from '../api/client'

// ── Error message humanizer ────────────────────────────────────────────────────

function humanizeError(msg = '') {
  if (msg.includes('AADSTS7000215'))
    return 'Invalid client secret. Make sure you copied the secret Value, not the Secret ID.'
  if (msg.includes('AADSTS70011'))
    return 'Invalid scope or resource. Check your Tenant ID and Client ID.'
  if (msg.includes('AADSTS50034') || msg.includes('does not exist'))
    return 'App registration not found. Verify your Client ID and Tenant ID.'
  if (msg.includes('AADSTS50126'))
    return 'Wrong credentials. Double-check your Client Secret.'
  if (msg.includes('AuthorizationFailed') || msg.includes('does not have authorization'))
    return 'Missing permissions. Assign Reader + Cost Management Reader roles to this app on your subscription.'
  if (msg.includes('No subscriptions found'))
    return 'No subscriptions found. Make sure your account has access to at least one Azure subscription.'
  return msg
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function Steps({ current, labels }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {labels.map((label, i) => {
        const n      = i + 1
        const done   = n < current
        const active = n === current
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all',
                done   && 'bg-blue-600 border-blue-600 text-white',
                active && 'bg-gray-900 border-blue-500 text-blue-400',
                !done && !active && 'bg-gray-900 border-gray-700 text-gray-600',
              )}>
                {done ? <CheckCircle size={14} /> : n}
              </div>
              <span className={clsx('text-xs whitespace-nowrap', active ? 'text-blue-400' : done ? 'text-gray-400' : 'text-gray-600')}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={clsx('w-16 h-px mx-1 mb-5 transition-colors', n < current ? 'bg-blue-600' : 'bg-gray-800')} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function SecretField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600 pr-9"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, mono }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={clsx(
          'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600',
          mono && 'font-mono',
        )}
      />
    </div>
  )
}

// ── Returning user screen ──────────────────────────────────────────────────────

function ReturningScreen({ settings, onLaunch, onReconfigure }) {
  const [loadingRGs,     setLoadingRGs]     = useState(false)
  const [resourceGroups, setResourceGroups] = useState([])
  const [selectedRG,     setSelectedRG]     = useState(settings.scan_scope_resource_group || '')
  const [launching,      setLaunching]      = useState(false)
  const [subName,        setSubName]        = useState('')

  useEffect(() => {
    const subId = settings.azure_subscription_id
    if (!subId) return
    setLoadingRGs(true)
    api.getResourceGroups(subId)
      .then(r => setResourceGroups(r.resource_groups || []))
      .catch(() => {})
      .finally(() => setLoadingRGs(false))
    // Resolve friendly subscription name
    api.discoverSubscriptions()
      .then(r => {
        const match = (r.subscriptions || []).find(s => s.subscription_id === subId)
        if (match?.display_name) setSubName(match.display_name)
      })
      .catch(() => {})
  }, [settings.azure_subscription_id])

  async function launch() {
    setLaunching(true)
    // Save RG scope selection before launching
    if (selectedRG !== (settings.scan_scope_resource_group || '')) {
      await api.saveSettings({
        SCAN_SCOPE_RESOURCE_GROUP:  selectedRG,
        SCAN_SCOPE_SUBSCRIPTION_ID: selectedRG ? settings.azure_subscription_id : '',
        persist_to_env: true,
      }).catch(() => {})
    }
    onLaunch(selectedRG)
  }

  return (
    <div className="space-y-5">
      {/* Connected subscription */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-950/30 border border-blue-800/40">
        <div className="w-8 h-8 rounded-full bg-blue-900/60 border border-blue-700/60 flex items-center justify-center shrink-0">
          <Cloud size={15} className="text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            {subName || settings.azure_subscription_id}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
            {subName ? settings.azure_subscription_id : 'Azure Subscription'}
          </p>
        </div>
        <CheckCircle size={15} className="text-green-400 shrink-0" />
      </div>

      {/* Resource group picker */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-gray-500" />
          <label className="text-xs font-medium text-gray-400">Resource Group</label>
          {loadingRGs && <Loader size={11} className="animate-spin text-gray-600 ml-1" />}
        </div>
        {resourceGroups.length > 0 ? (
          <select
            value={selectedRG}
            onChange={e => setSelectedRG(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-600"
          >
            <option value="">All resource groups</option>
            {resourceGroups.map(rg => (
              <option key={rg} value={rg}>{rg}</option>
            ))}
          </select>
        ) : (
          <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500">
            {loadingRGs ? 'Loading…' : 'All resource groups'}
          </div>
        )}
        {selectedRG && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            Scan limited to <strong>{selectedRG}</strong>
          </p>
        )}
      </div>

      {/* Launch */}
      <button
        onClick={launch}
        disabled={launching}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold"
      >
        {launching
          ? <><Loader size={15} className="animate-spin" /> Starting…</>
          : <><Zap size={15} /> Start Scan</>
        }
      </button>

      {/* Reconfigure link */}
      <button
        type="button"
        onClick={onReconfigure}
        className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center justify-center gap-1.5 py-1"
      >
        <Settings size={11} /> Connect a different account
      </button>
    </div>
  )
}

// ── Service principal permissions guide ───────────────────────────────────────

function PermissionsGuide() {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <Info size={12} /> Required Azure roles (at subscription scope)
      </div>
      <div className="space-y-1.5">
        {[
          { role: 'Reader', desc: 'Enumerate resources & metrics' },
          { role: 'Cost Management Reader', desc: 'Pull billing & cost data' },
        ].map(({ role, desc }) => (
          <div key={role} className="flex items-center gap-2">
            <span className="text-xs bg-blue-900/50 border border-blue-800/60 text-blue-300 px-1.5 py-0.5 rounded font-mono">{role}</span>
            <span className="text-xs text-gray-500">{desc}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        Assign via Portal → Subscriptions → Access control (IAM) → Add role assignment
      </p>
    </div>
  )
}

// ── New user wizard ────────────────────────────────────────────────────────────

function WizardSetup({ onComplete }) {
  const [step,           setStep]          = useState(1)
  const [discovering,    setDiscovering]   = useState(false)
  const [subscriptions,  setSubscriptions] = useState([])
  const [selectedSub,    setSelectedSub]   = useState(null)
  const [tenantId,       setTenantId]      = useState('')
  const [clientId,       setClientId]      = useState('')
  const [clientSecret,   setClientSecret]  = useState('')
  const [aiProvider,     setAiProvider]    = useState('none')
  const [aoaiKey,        setAoaiKey]       = useState('')
  const [aoaiEndpoint,   setAoaiEndpoint]  = useState('')
  const [aoaiDeployment, setAoaiDeployment] = useState('gpt-4o-mini')
  const [loadingRGs,     setLoadingRGs]    = useState(false)
  const [resourceGroups, setResourceGroups] = useState([])
  const [selectedRG,     setSelectedRG]    = useState('')
  const [error,          setError]         = useState(null)
  const [saving,         setSaving]        = useState(false)

  async function discover() {
    setDiscovering(true); setError(null)
    try {
      await api.saveSettings({
        AZURE_TENANT_ID: tenantId,
        AZURE_CLIENT_ID: clientId,
        AZURE_CLIENT_SECRET: clientSecret,
      })
      const res = await api.discoverSubscriptions('')
      setSubscriptions(res.subscriptions || [])
      if (!res.subscriptions?.length) setError('No subscriptions found. Make sure your account has access to at least one Azure subscription.')
      else setStep(3)
    } catch (err) {
      setError(humanizeError(err.message))
    } finally { setDiscovering(false) }
  }

  async function pickSub(sub) {
    setSelectedSub(sub)
    setLoadingRGs(true)
    try {
      const res = await api.getResourceGroups(sub.subscription_id)
      setResourceGroups(res.resource_groups || [])
    } catch { /* non-fatal */ }
    finally { setLoadingRGs(false) }
  }

  async function launch() {
    setSaving(true); setError(null)
    try {
      const subId = selectedSub.subscription_id
      const body  = {
        AZURE_SUBSCRIPTION_ID: subId,
        AZURE_TENANT_ID: tenantId,
        AZURE_CLIENT_ID: clientId,
        persist_to_env: true,
      }
      if (clientSecret) body.AZURE_CLIENT_SECRET = clientSecret
      if (selectedRG) {
        body.SCAN_SCOPE_RESOURCE_GROUP  = selectedRG
        body.SCAN_SCOPE_SUBSCRIPTION_ID = subId
      }
      if (aiProvider !== 'none') {
        body.ai_provider = aiProvider
        if (aoaiKey)        body.AZURE_OPENAI_KEY        = aoaiKey
        if (aoaiEndpoint)   body.AZURE_OPENAI_ENDPOINT   = aoaiEndpoint
        if (aoaiDeployment) body.AZURE_OPENAI_DEPLOYMENT = aoaiDeployment
      }
      await api.saveSettings(body)
      onComplete(selectedRG)
    } catch (err) {
      setError(humanizeError(err.message)); setSaving(false)
    }
  }

  return (
    <>
      <Steps current={step} labels={['Connect', 'AI Setup', 'Subscription', 'Scope & Launch']} />
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 shadow-2xl">

        {/* ── Step 1: Azure credentials ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">Connect your Azure account</h2>
              <p className="text-xs text-gray-500 mt-1">Create a service principal and assign the required roles.</p>
            </div>
            <PermissionsGuide />
            <TextField label="Tenant ID"     value={tenantId}     onChange={setTenantId}     placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" mono />
            <TextField label="Client ID"     value={clientId}     onChange={setClientId}     placeholder="App registration client ID" mono />
            <SecretField label="Client Secret" value={clientSecret} onChange={setClientSecret} placeholder="Paste client secret value" />
            <button
              onClick={() => { setError(null); setStep(2) }}
              disabled={!(tenantId && clientId && clientSecret)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              Next <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step 2: AI setup (optional) ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">AI Scoring</h2>
              <p className="text-xs text-gray-500 mt-1">Optional — adds plain-English explanations and catches false positives. You can change this later in Settings.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'none',        label: 'Skip for now', desc: 'Rules-based scoring only' },
                { value: 'azure_openai', label: 'Azure OpenAI', desc: 'Uses your own deployment' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => setAiProvider(opt.value)}
                  className={clsx(
                    'flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all',
                    aiProvider === opt.value
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600',
                  )}>
                  <span className="text-sm font-semibold text-white">{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.desc}</span>
                </button>
              ))}
            </div>
            {aiProvider === 'azure_openai' && (
              <div className="space-y-3">
                <TextField label="Endpoint" value={aoaiEndpoint} onChange={setAoaiEndpoint} placeholder="https://your-resource.openai.azure.com/" />
                <SecretField label="API Key" value={aoaiKey} onChange={setAoaiKey} placeholder="Azure OpenAI key" />
                <TextField label="Deployment name" value={aoaiDeployment} onChange={setAoaiDeployment} placeholder="gpt-4o-mini" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setStep(1); setError(null) }} className="btn-ghost flex items-center gap-1.5 px-4">
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={discover}
                disabled={discovering || (aiProvider === 'azure_openai' && !(aoaiEndpoint && aoaiKey))}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
                {discovering ? <><Loader size={14} className="animate-spin" /> Discovering…</> : <><RefreshCw size={14} /> Discover Subscriptions</>}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Pick subscription ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">Pick your subscription</h2>
              <p className="text-xs text-gray-500 mt-1">{subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''} found.</p>
            </div>
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {subscriptions.map(sub => (
                <button key={sub.subscription_id} type="button" onClick={() => pickSub(sub)}
                  className={clsx('flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl border transition-all',
                    selectedSub?.subscription_id === sub.subscription_id
                      ? 'border-blue-500 bg-blue-950/40'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600')}>
                  <CheckCircle size={15} className={clsx('shrink-0', selectedSub?.subscription_id === sub.subscription_id ? 'text-blue-400' : 'text-gray-700')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{sub.display_name || sub.subscription_id}</p>
                    <p className="text-xs text-gray-600 font-mono truncate">{sub.subscription_id}</p>
                  </div>
                </button>
              ))}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setStep(2); setError(null) }} className="btn-ghost flex items-center gap-1.5 px-4">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={() => { setError(null); setStep(4) }} disabled={!selectedSub}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Scope & Launch ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">Scope your scan</h2>
              <p className="text-xs text-gray-500 mt-1">Limit to a resource group to speed up your first run. You can change this anytime.</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-950/30 border border-blue-800/40">
              <Cloud size={16} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{selectedSub?.display_name || selectedSub?.subscription_id}</p>
                <p className="text-xs text-gray-500 font-mono">{selectedSub?.subscription_id}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-gray-500" />
                <label className="text-xs font-medium text-gray-400">Resource Group (optional)</label>
                {loadingRGs && <Loader size={11} className="animate-spin text-gray-600 ml-auto" />}
              </div>
              {resourceGroups.length > 0 ? (
                <select value={selectedRG} onChange={e => setSelectedRG(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-600">
                  <option value="">All resource groups</option>
                  {resourceGroups.map(rg => <option key={rg} value={rg}>{rg}</option>)}
                </select>
              ) : (
                <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500">
                  {loadingRGs ? 'Loading resource groups…' : 'All resource groups will be scanned'}
                </div>
              )}
              {selectedRG && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  Scan limited to <strong>{selectedRG}</strong>
                </p>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0" /> {error}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setStep(3); setError(null) }} className="btn-ghost flex items-center gap-1.5 px-4">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={launch} disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold">
                {saving ? <><Loader size={15} className="animate-spin" /> Starting…</> : <><Zap size={15} /> Start Scan</>}
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────

export default function SetupWizard({ settings, onLaunch }) {
  const isConfigured = !!(settings?.azure_subscription_id || settings?.demo_mode)
  const [reconfiguring, setReconfiguring] = useState(false)

  const showWizard = !isConfigured || reconfiguring

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* Branding */}
      <div className="flex flex-col items-center mb-8 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <Key size={26} className="text-blue-400" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-white tracking-tight">Azure Cost Optimizer</h1>
          <p className="text-xs text-gray-500 mt-0.5">Reduce spend · Enforce governance</p>
        </div>
      </div>

      <div className="w-full max-w-lg">
        {showWizard ? (
          <WizardSetup onComplete={onLaunch} />
        ) : (
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-white">Ready to scan</h2>
              <p className="text-xs text-gray-500 mt-1">Pick a scope and start your analysis</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 shadow-2xl">
              <ReturningScreen
                settings={settings}
                onLaunch={onLaunch}
                onReconfigure={() => setReconfiguring(true)}
              />
            </div>
          </>
        )}

        {/* Demo mode */}
        {!settings?.demo_mode && (
          <p className="text-center text-xs text-gray-700 mt-5">
            No Azure account?{' '}
            <button
              type="button"
              onClick={async () => {
                await api.saveSettings({ demo_mode: true }).catch(() => {})
                onLaunch('')
              }}
              className="text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
            >
              Try demo mode
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
