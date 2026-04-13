'use client'

import type { ChatMessage } from '@/hooks/useIntakeChat'

type Props = {
  message: ChatMessage
  onSend: (value: string, display?: string) => void
  onRequestViewProposal?: () => void
  onSaveLater?: () => void
  isLast: boolean
  isStreaming: boolean
  emailVerified?: boolean
}

type Pill = {
  value: string
  label: string
  icon: string
  primary: boolean
}

// Pills when lead is NOT saved yet — lead with Save for later (primary)
const UNSAVED_PILLS: Pill[] = [
  { value: '__save_later__',    label: 'Save for later',          icon: '', primary: true  },
  { value: '__continue__',      label: 'Keep going',              icon: '', primary: false },
  { value: '__view_proposal__', label: 'Get ballpark estimate',   icon: '', primary: false },
]

// Pills when lead IS saved — lead with Get ballpark estimate (primary)
const SAVED_PILLS: Pill[] = [
  { value: '__view_proposal__', label: 'Get ballpark estimate',   icon: '', primary: true  },
  { value: '__continue__',      label: 'Keep going',              icon: '', primary: false },
]

export default function PauseCheckpoint({ message, onSend, onRequestViewProposal, onSaveLater, isLast, isStreaming, emailVerified }: Props) {
  const showActions = isLast && !isStreaming
  const pills = emailVerified ? SAVED_PILLS : UNSAVED_PILLS

  function handleSelect(value: string, label: string) {
    if (value === '__view_proposal__' || value === '__submit__') {
      onRequestViewProposal?.()
    } else if (value === '__save_later__') {
      onSaveLater?.()
    } else {
      // __continue__ -> keep the conversation going
      onSend(value, label)
    }
  }

  const paragraphs = message.content ? message.content.replace(/\\n/g, '\n').split('\n\n').filter(Boolean) : []

  return (
    <div className="w-full space-y-4 py-1">

      {/* ── Horizontal divider with centred label ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
        <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--ov-text-muted,#727272)] select-none whitespace-nowrap">
          take a breath
        </span>
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
      </div>

      {/* ── Checkpoint intro — warm summary of what's been established ── */}
      <div className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed space-y-2">
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {/* ── Compact inline pill buttons ── */}
      {showActions && (
        <div className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => handleSelect(pill.value, pill.label)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer',
                pill.primary
                  ? 'bg-brand-purple border border-brand-purple text-brand-dark hover:bg-brand-purple/90 font-medium'
                  : 'border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.50))] hover:text-[var(--ov-accent-strong,#7367ff)]',
              ].join(' ')}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}

    </div>
  )
}
