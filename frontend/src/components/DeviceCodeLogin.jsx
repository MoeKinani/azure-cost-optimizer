import React, { useState, useEffect, useRef } from 'react'
import { Monitor, CheckCircle, Loader, LogOut, Copy, ExternalLink, AlertCircle } from 'lucide-react'
import { api } from '../api/client'

export default function DeviceCodeLogin({ onAuthChange }) {
  const [status, setStatus]       = useState('idle')
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [error, setError]         = useState(null)
  const [copied, setCopied]       = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    api.getDeviceCodeStatus()
      .then(s => {
        setStatus(s.status)
        if (s.status === 'pending') setDeviceInfo(s)
      })
      .catch(() => {})
    return () => stopPoll()
  }, [])

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  function startPoll() {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getDeviceCodeStatus()
        setStatus(s.status)
        if (s.status === 'pending') setDeviceInfo(s)
        if (s.status === 'authenticated') {
          stopPoll()
          onAuthChange?.('authenticated')
        }
        if (s.status === 'error') {
          stopPoll()
          setError(s.error || 'Sign-in failed.')
        }
      } catch { stopPoll() }
    }, 2000)
  }

  async function handleSignIn() {
    setStatus('starting')
    setError(null)
    try {
      await api.startDeviceCodeFlow()
      startPoll()
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  async function handleSignOut() {
    stopPoll()
    await api.signOut().catch(() => {})
    setStatus('idle')
    setDeviceInfo(null)
    setError(null)
    onAuthChange?.('idle')
  }

  function copyCode() {
    navigator.clipboard.writeText(deviceInfo?.user_code || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Authenticated ────────────────────────────────────────────────────────────
  if (status === 'authenticated') {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/40">
        <div className="flex items-center gap-2 text-xs text-green-400">
          <CheckCircle size={13} className="shrink-0" />
          Signed in via Microsoft account
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    )
  }

  // ── Waiting for user to complete sign-in ─────────────────────────────────────
  if ((status === 'pending' || status === 'starting') && deviceInfo) {
    return (
      <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-300 flex items-center gap-2">
          <Monitor size={13} /> Complete sign-in in your browser
        </p>
        <div className="text-xs text-gray-400 space-y-2">
          <p>
            1. Open{' '}
            <a
              href={deviceInfo.verification_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline underline-offset-2 inline-flex items-center gap-0.5"
            >
              {deviceInfo.verification_uri}
              <ExternalLink size={10} />
            </a>
          </p>
          <div className="flex items-center gap-2">
            <span>2. Enter code:</span>
            <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1">
              <span className="font-mono text-sm font-bold tracking-widest text-white">
                {deviceInfo.user_code}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="Copy code"
              >
                {copied
                  ? <CheckCircle size={12} className="text-green-400" />
                  : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
          <Loader size={12} className="animate-spin shrink-0" />
          Waiting for sign-in…
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-auto text-gray-600 hover:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Idle / Error ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Sign in interactively with your Microsoft account. Works without a service principal
        — useful for personal tenants or ad-hoc access.
      </p>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={status === 'starting'}
        className="btn-ghost flex items-center gap-2 text-sm w-full justify-center"
      >
        {status === 'starting'
          ? <Loader size={14} className="animate-spin" />
          : <Monitor size={14} />}
        Sign in with Microsoft
      </button>
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  )
}
