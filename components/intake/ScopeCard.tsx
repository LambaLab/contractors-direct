'use client'

import { useState } from 'react'
import { getScopeById, validateScopeRemoval } from '@/lib/scope/dependencies'
import * as Icons from 'lucide-react'
import { X, ChevronDown } from 'lucide-react'

type Props = {
  scopeId: string
  status: 'confirmed' | 'detected' | 'inactive' | 'current'
  detectedScope: string[]
  onToggle: (id: string) => void
  summary?: string
}

const cardStyles: Record<string, string> = {
  confirmed: 'bg-[var(--ov-accent-bg,rgba(255,252,0,0.05))] border-[var(--ov-accent-border,rgba(255,252,0,0.30))]',
  current: 'bg-[var(--ov-accent-bg,rgba(255,252,0,0.05))] border-[var(--ov-accent-border,rgba(255,252,0,0.20))] border-dashed',
  detected: 'bg-[var(--ov-surface-subtle,rgba(255,255,255,0.03))] border-[var(--ov-border,rgba(255,255,255,0.10))] border-dashed',
  inactive: 'bg-[var(--ov-surface-subtle,rgba(255,255,255,0.02))] border-[var(--ov-border,rgba(255,255,255,0.05))] opacity-50',
}

const iconBgStyles: Record<string, string> = {
  confirmed: 'bg-[var(--ov-accent-bg,rgba(255,252,0,0.15))]',
  current: 'bg-[var(--ov-accent-bg,rgba(255,252,0,0.10))]',
  detected: 'bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))]',
  inactive: 'bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))]',
}

const iconColorStyles: Record<string, string> = {
  confirmed: 'text-[var(--ov-accent-strong,#fffc00)]',
  current: 'text-[var(--ov-accent-strong,#fffc00)]',
  detected: 'text-[var(--ov-text-muted,#727272)]',
  inactive: 'text-[var(--ov-text-muted,#727272)]',
}

const textStyles: Record<string, string> = {
  confirmed: 'text-[var(--ov-text,#ffffff)]',
  current: 'text-[var(--ov-text,#ffffff)]',
  detected: 'text-[var(--ov-text,#ffffff)]/70',
  inactive: 'text-[var(--ov-text-muted,#727272)]',
}

export default function ScopeCard({ scopeId, status, detectedScope, onToggle, summary }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const item = getScopeById(scopeId)
  if (!item) return null

  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ?? Icons.Box

  const isExpandable = (status === 'confirmed' || status === 'detected' || status === 'current') && !!summary

  function handleHeaderClick() {
    if (isExpandable) {
      setIsExpanded(e => !e)
    }
    // Inactive scope items: read-only in the proposal panel — do nothing on click
  }

  return (
    <div
      className={`w-full rounded-xl border transition-all text-left overflow-hidden ${cardStyles[status]}`}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={handleHeaderClick}
        aria-expanded={isExpandable ? isExpanded : undefined}
        className={`w-full p-3 text-left ${
          isExpandable
            ? 'cursor-pointer hover:bg-[var(--ov-hover-bg,rgba(255,255,255,0.03))]'
            : 'cursor-default'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgStyles[status]}`}>
              <IconComponent className={`w-4 h-4 ${iconColorStyles[status]}`} />
            </div>
            <p className={`text-sm font-medium truncate ${textStyles[status]}`}>
              {item.name}
            </p>
          </div>

          {/* Right icon */}
          {isExpandable ? (
            <ChevronDown
              className={`w-4 h-4 text-[var(--ov-text-muted,#727272)] flex-shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          ) : null}
        </div>
      </button>

      {/* Expandable body — for confirmed and detected scope items with a summary */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isExpanded && summary ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="h-px bg-brand-purple/10 mb-3" />
            <p className="text-xs text-[var(--ov-text-muted,#727272)] leading-relaxed">
              {summary}
            </p>
            {status === 'confirmed' && (() => {
              const { canRemove, blockedBy } = validateScopeRemoval(scopeId, detectedScope)
              return canRemove ? (
                <button
                  type="button"
                  onClick={() => onToggle(scopeId)}
                  className="mt-2 flex items-center gap-1 text-[10px] text-[var(--ov-text-muted,#727272)]/50 hover:text-[var(--ov-text-muted,#727272)] transition-colors cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                  Remove scope item
                </button>
              ) : (
                <p className="mt-2 text-[10px] text-[var(--ov-text-muted,#727272)]/40">
                  Required by: {blockedBy.map(id => getScopeById(id)?.name ?? id).join(', ')}
                </p>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
