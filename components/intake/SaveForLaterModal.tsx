'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ArrowRight, Check, RotateCcw } from 'lucide-react'

type Step = 'email' | 'otp' | 'success'

type Props = {
  proposalId: string
  sessionId: string
  projectName?: string
  onClose: () => void
}

export default function SaveForLaterModal({ proposalId, sessionId, projectName, onClose }: Props) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const emailInputRef = useRef<HTMLInputElement>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Autofocus email input on open
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  // Autofocus first OTP box when step changes to otp
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    }
  }, [step])

  // Countdown timer for resend cooldown
  const startCooldown = useCallback(() => {
    setResendCooldown(30)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }, [])

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  async function handleSendCode(targetEmail = email) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, proposalId, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send code')
      setStep('otp')
      startCooldown()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    const code = otp.join('')
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, proposalId, sessionId, projectName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed')

      // Fire-and-forget: backfill all messages to Supabase now that email is verified
      try {
        const raw = localStorage.getItem(`cd_msgs_${proposalId}`)
        const storedMessages: { role: string; content: string }[] = raw ? JSON.parse(raw) : []
        const apiMessages = storedMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
        fetch('/api/intake/sync-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposalId, sessionId, messages: apiMessages }),
        })
          .then(() => {
            localStorage.setItem(`cd_email_verified_${proposalId}`, '1')
            localStorage.setItem(`cd_synced_count_${proposalId}`, String(apiMessages.length))
          })
          .catch((e) => console.error('Initial sync error:', e))
      } catch (e) {
        console.error('Sync setup error:', e)
      }

      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      // Clear OTP boxes on error so user can re-enter
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpChange(index: number, value: string) {
    // Accept paste: if value is 6 digits, fill all boxes
    if (value.length === 6 && /^\d{6}$/.test(value)) {
      setOtp(value.split(''))
      otpRefs.current[5]?.focus()
      return
    }
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const otpComplete = otp.every(d => d !== '')

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >

      {/* Modal card */}
      <div className="relative w-full max-w-sm bg-[var(--ov-surface,#1a1a1a)] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-2xl shadow-2xl p-6 space-y-5">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#fff)] hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── STEP: email ── */}
        {step === 'email' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-[var(--ov-text,#ffffff)] mb-1">Save your progress</h2>
              <p className="text-sm text-[var(--ov-text-muted,#727272)] leading-relaxed">
                We'll send a 6-digit code to verify your email, then send you a link so you can come back to your renovation estimate anytime.
              </p>
            </div>

            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && isValidEmail && !loading) handleSendCode() }}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] text-sm outline-none focus:border-[var(--ov-focus-ring,rgba(255,252,0,0.40))] transition-colors"
            />

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={() => handleSendCode()}
              disabled={!isValidEmail || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-purple text-white font-semibold text-sm disabled:opacity-40 hover:bg-brand-purple/90 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : <><span>Send code</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </>
        )}

        {/* ── STEP: otp ── */}
        {step === 'otp' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-[var(--ov-text,#ffffff)] mb-1">Check your inbox</h2>
              <p className="text-sm text-[var(--ov-text-muted,#727272)] leading-relaxed">
                We sent a 6-digit code to{' '}
                <span className="text-[var(--ov-text,#ffffff)]">{email}</span>.{' '}
                <button
                  onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError('') }}
                  className="underline hover:text-[var(--ov-text,#fff)] transition-colors cursor-pointer"
                >
                  Change
                </button>
              </p>
            </div>

            {/* 6 digit boxes */}
            <div className="flex gap-2 justify-between">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text')
                    if (/^\d{6}$/.test(text)) {
                      e.preventDefault()
                      handleOtpChange(i, text)
                    }
                  }}
                  className={[
                    'w-11 h-14 text-center text-xl font-bold rounded-xl border outline-none transition-colors',
                    'bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] text-[var(--ov-text,#ffffff)]',
                    digit
                      ? 'border-[var(--ov-accent-border,rgba(255,252,0,0.60))]'
                      : 'border-[var(--ov-border,rgba(255,255,255,0.10))] focus:border-[var(--ov-focus-ring,rgba(255,252,0,0.40))]',
                  ].join(' ')}
                />
              ))}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={handleVerify}
              disabled={!otpComplete || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-purple text-white font-semibold text-sm disabled:opacity-40 hover:bg-brand-purple/90 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying…' : <><span>Verify</span><ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="text-center">
              <button
                onClick={() => handleSendCode()}
                disabled={resendCooldown > 0 || loading}
                className="text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#fff)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: success ── */}
        {step === 'success' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[var(--ov-accent-bg,rgba(255,252,0,0.15))] flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-[var(--ov-accent-strong,#fffc00)]" />
              </div>
              <h2 className="text-base font-semibold text-[var(--ov-text,#ffffff)]">You're all set</h2>
            </div>

            <p className="text-sm text-[var(--ov-text-muted,#727272)] leading-relaxed">
              A link to your renovation estimate has been sent to{' '}
              <span className="text-[var(--ov-text,#ffffff)]">{email}</span>. Check your inbox — you can come back and continue anytime.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] text-[var(--ov-text,#ffffff)] text-sm font-medium hover:border-white/20 transition-colors cursor-pointer"
            >
              Done
            </button>
          </>
        )}

      </div>
    </div>
  )
}
