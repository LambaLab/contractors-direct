'use client'

import { useState } from 'react'
import { X, Phone, ArrowRight, Loader2, CheckCircle } from 'lucide-react'
import { getStoredSession } from '@/lib/session'

type Step = 'phone' | 'loading' | 'sent'

type Props = {
  proposalId: string
  onClose: () => void
  theme?: 'dark' | 'light'
}

export default function AuthGateModal({ proposalId, onClose, theme }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setStep('loading')
    setError('')

    const session = getStoredSession()
    if (!session?.sessionId) {
      setStep('phone')
      setError('Session expired. Please refresh the page and try again.')
      return
    }

    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim(),
        proposalId,
        sessionId: session.sessionId,
      }),
    })

    if (res.ok) {
      setStep('sent')
    } else {
      setStep('phone')
      setError('Failed to send OTP. Please try again.')
    }
  }

  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${theme === 'light' ? 'intake-light' : ''}`}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[var(--ov-surface,#1d1d1d)] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'sent' ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 bg-[var(--ov-accent-bg,rgba(255,252,0,0.10))] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-[var(--ov-accent-strong,#fffc00)]" />
            </div>
            <div>
              <h2 className="font-bold text-[var(--ov-text,#ffffff)] text-lg">Check your WhatsApp</h2>
              <p className="text-[var(--ov-text-muted,#727272)] text-sm mt-1">
                We sent an OTP to <span className="text-[var(--ov-text,#ffffff)]">{phone}</span>.
                Enter it to view your full proposal.
              </p>
            </div>
            <p className="text-[var(--ov-text-muted,#727272)]/60 text-xs">
              Didn&apos;t receive it?{' '}
              <button
                onClick={() => setStep('phone')}
                className="text-[var(--ov-accent-strong,#fffc00)] hover:underline"
              >
                Try again
              </button>
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="w-10 h-10 bg-[var(--ov-accent-bg,rgba(255,252,0,0.10))] rounded-xl flex items-center justify-center mb-4">
                <Phone className="w-5 h-5 text-[var(--ov-accent-strong,#fffc00)]" />
              </div>
              <h2 className="font-bold text-[var(--ov-text,#ffffff)] text-lg">View your proposal</h2>
              <p className="text-[var(--ov-text-muted,#727272)] text-sm mt-1">
                Enter your WhatsApp number and we&apos;ll send you an OTP to access the full proposal.
              </p>
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <form onSubmit={handleSendOTP} className="space-y-4">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                required
                autoFocus
                disabled={step === 'loading'}
                className="w-full bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-xl px-4 py-3 text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] outline-none focus:border-[var(--ov-focus-ring,rgba(255,252,0,0.50))] transition-colors text-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={step === 'loading' || !phone.trim()}
                className="w-full py-3 bg-brand-yellow text-brand-dark font-medium rounded-xl hover:bg-brand-yellow/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {step === 'loading' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Send OTP <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
