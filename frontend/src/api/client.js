const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Dashboard — non-streaming fallback
  getDashboard: (refresh = false) =>
    request(`/dashboard${refresh ? '?refresh=true' : ''}`),

  // Settings
  getSettings:           ()          => request('/settings'),
  saveSettings:          (body)      => request('/settings', { method: 'POST', body: JSON.stringify(body) }),
  testAzure:             (body = {}) => request('/settings/test-azure',            { method: 'POST', body: JSON.stringify(body) }),
  testAI:                (body = {}) => request('/settings/test-ai',               { method: 'POST', body: JSON.stringify(body) }),
  exportSettings:        ()          => request('/settings/export'),
  discoverSubscriptions:   (authMethod = '') => request(`/settings/discover-subscriptions${authMethod ? `?auth_method=${authMethod}` : ''}`),
  discoverManagementGroups:(authMethod = '') => request(`/settings/management-groups${authMethod ? `?auth_method=${authMethod}` : ''}`),
  preflight:             ()               => request('/settings/preflight'),
  getAuthMethod:         ()               => request('/settings/auth-method'),
  startDeviceCodeFlow:   ()               => request('/auth/device-code/start', { method: 'POST', body: '{}' }),
  getDeviceCodeStatus:   ()               => request('/auth/device-code/status'),
  signOut:               ()               => request('/auth/sign-out', { method: 'POST', body: '{}' }),
  getResourceGroups:     (subId = '')   => request(`/settings/resource-groups${subId ? `?subscription_id=${subId}` : ''}`),

  // SSE streaming dashboard — accepts optional URLSearchParams
  streamDashboard(onEvent, onDone, onError, params = null) {
    const qs  = params && params.toString() ? `?${params.toString()}` : ''
    const url = `${BASE}/dashboard/stream${qs}`
    const es  = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'done') {
          onDone(data.data)
          es.close()
        } else if (data.type === 'error') {
          onError(new Error(data.message))
          es.close()
        } else {
          onEvent(data)
        }
      } catch (err) {
        onError(err)
        es.close()
      }
    }

    es.onerror = () => {
      onError(new Error('SSE connection lost'))
      es.close()
    }

    return () => es.close()
  },
}
