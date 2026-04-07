'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, RotateCcw, Lightbulb } from 'lucide-react'

type RestoreData = {
  leadId: string
  sessionId: string
  email?: string | null
  brief?: string
  messages?: { role: string; content: string }[]
  [key: string]: unknown
}

type Props = {
  restoreData: RestoreData
  onRestoreSuccess: (data: RestoreData) => void
  onStartNew: () => void
}

type Step = 'email' | 'otp'

export default function RestoreGateModal({ restoreData, onRestoreSuccess, onStartNew }: Props) {
  const hasSavedEmail = !!restoreData.email
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const emailInputRef = useRef<HTMLInputElement>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (hasSavedEmail) emailInputRef.current?.focus()
  }, [hasSavedEmail])

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    }
  }, [step])

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

  async function handleSendCode() {
    // Client-side check: entered email must match the saved email
    if (email.toLowerCase().trim() !== restoreData.email?.toLowerCase().trim()) {
      setError('This email does not match the one used to save this project.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          leadId: restoreData.leadId,
          sessionId: restoreData.sessionId,
        }),
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
        body: JSON.stringify({
          email: email.trim(),
          otp: code,
          leadId: restoreData.leadId,
          sessionId: restoreData.sessionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed')

      // Success — pass the full restore data back to hydrate and open
      onRestoreSuccess(restoreData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpChange(index: number, value: string) {
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

  // ── Not saved state ──
  if (!hasSavedEmail) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className="relative w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-yellow/15 flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-5 h-5 text-brand-yellow" />
            </div>
            <h2 className="text-base font-semibold text-white">Project not saved</h2>
          </div>

          <p className="text-sm text-[#727272] leading-relaxed">
            This project was started on another device and was not saved. Use &ldquo;Save for Later&rdquo; next time to access your projects from any device.
          </p>

          <button
            onClick={onStartNew}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-yellow text-brand-dark font-semibold text-sm hover:bg-brand-yellow/90 transition-all cursor-pointer"
          >
            Start a new project <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── Saved — email + OTP verification ──
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">

        {/* ── STEP: email ── */}
        {step === 'email' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Verify your identity</h2>
              <p className="text-sm text-[#727272] leading-relaxed">
                Enter the email you used when saving this project. We'll send a code to verify it's you.
              </p>
            </div>

            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && isValidEmail && !loading) handleSendCode() }}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-[#727272] text-sm outline-none focus:border-[rgba(255,252,0,0.40)] transition-colors"
            />

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={handleSendCode}
              disabled={!isValidEmail || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-yellow text-brand-dark font-semibold text-sm disabled:opacity-40 hover:bg-brand-yellow/90 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : <><span>Send code</span><ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="text-center">
              <button
                onClick={onStartNew}
                className="text-xs text-[#727272] hover:text-white transition-colors cursor-pointer"
              >
                Start a new project instead
              </button>
            </div>
          </>
        )}

        {/* ── STEP: otp ── */}
        {step === 'otp' && (
          <>
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Check your inbox</h2>
              <p className="text-sm text-[#727272] leading-relaxed">
                We sent a 6-digit code to{' '}
                <span className="text-white">{email}</span>.{' '}
                <button
                  onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError('') }}
                  className="underline hover:text-white transition-colors cursor-pointer"
                >
                  Change
                </button>
              </p>
            </div>

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
                    'bg-white/5 text-white',
                    digit
                      ? 'border-[rgba(255,252,0,0.60)]'
                      : 'border-white/10 focus:border-[rgba(255,252,0,0.40)]',
                  ].join(' ')}
                />
              ))}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={handleVerify}
              disabled={!otpComplete || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-yellow text-brand-dark font-semibold text-sm disabled:opacity-40 hover:bg-brand-yellow/90 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : <><span>Verify & restore</span><ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="text-center">
              <button
                onClick={() => handleSendCode()}
                disabled={resendCooldown > 0 || loading}
                className="text-xs text-[#727272] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
