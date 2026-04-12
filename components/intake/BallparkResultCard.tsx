'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Info } from 'lucide-react'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import { STYLE_MULTIPLIERS, formatPriceRange, formatPrice, computeStyleMidpoints, type PriceRange } from '@/lib/pricing/engine'
import { getStyleInfo, STYLE_INFO_ORDERED, type StyleInfo } from '@/lib/styles/descriptions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type Props = {
  range: PriceRange
  scopeIds: string[]
  propertyType: string
  location: string
  sizeSqft: number
  condition: string
  stylePreference: string
  onDigDeeper: () => void
  onSaveLater: () => void
  isLast: boolean
  isStreaming: boolean
}

function conditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    new: 'New',
    needs_refresh: 'Needs refresh',
    major_renovation: 'Major renovation',
    shell: 'Shell',
    fitted: 'Fitted',
    semi_fitted: 'Semi-fitted',
    shell_and_core: 'Shell & core',
  }
  return labels[condition] || condition
}

const MIN_MULT = STYLE_MULTIPLIERS.minimalist   // 0.85
const MAX_MULT = STYLE_MULTIPLIERS.maximalist   // 1.35

/** The 3 styles shown as navigation pills in the modal */
function getNavStyles(
  userStyleKey: string | null,
  midpoints: Record<string, number>
): { key: string; label: string; price: number; isUser: boolean }[] {
  const pills: { key: string; label: string; price: number; isUser: boolean }[] = [
    { key: 'minimalist', label: 'Minimalist', price: midpoints.minimalist, isUser: userStyleKey === 'minimalist' },
  ]

  // Add user's style in the middle if it's not an endpoint
  if (userStyleKey && userStyleKey !== 'minimalist' && userStyleKey !== 'maximalist') {
    const info = getStyleInfo(userStyleKey)
    if (info) {
      pills.push({ key: userStyleKey, label: info.label, price: midpoints[userStyleKey], isUser: true })
    }
  }

  pills.push({ key: 'maximalist', label: 'Maximalist', price: midpoints.maximalist, isUser: userStyleKey === 'maximalist' })

  return pills
}

export default function BallparkResultCard({
  range,
  scopeIds,
  propertyType,
  location,
  sizeSqft,
  condition,
  stylePreference,
  onDigDeeper,
  onSaveLater,
  isLast,
  isStreaming,
}: Props) {
  const showActions = isLast && !isStreaming
  const [activeStyleKey, setActiveStyleKey] = useState<string | null>(null)

  const scopeNames = scopeIds
    .map((id) => SCOPE_CATALOG.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s!.name)

  const propertyLabel = propertyType.charAt(0).toUpperCase() + propertyType.slice(1)
  const summaryParts = [propertyLabel, location, sizeSqft > 0 ? `${sizeSqft.toLocaleString()} sqft` : null, conditionLabel(condition)].filter(Boolean)

  // Style spectrum data
  const styleMidpoints = computeStyleMidpoints(range)
  const userStyleKey = stylePreference ? stylePreference.toLowerCase().replace(/\s+/g, '_') : null
  const userMultiplier = userStyleKey ? STYLE_MULTIPLIERS[userStyleKey] : null
  const userPrice = userStyleKey && styleMidpoints[userStyleKey] ? styleMidpoints[userStyleKey] : null

  // Position of user's dot on the bar (0 = minimalist, 1 = maximalist)
  const userPosition = userMultiplier != null
    ? (userMultiplier - MIN_MULT) / (MAX_MULT - MIN_MULT)
    : null

  // Label collision: merge with endpoint if too close
  const showUserAsMiddle = userPosition != null && userPosition > 0.15 && userPosition < 0.85
  const userIsMin = userStyleKey === 'minimalist'
  const userIsMax = userStyleKey === 'maximalist'

  // Navigation pills for the modal
  const navPills = getNavStyles(userStyleKey, styleMidpoints)

  // Active modal style info
  const activeStyleInfo = activeStyleKey ? getStyleInfo(activeStyleKey) : null
  const activePrice = activeStyleKey ? styleMidpoints[activeStyleKey] : null

  return (
    <div className="w-full space-y-4 py-1">
      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
        <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--ov-text-muted,#727272)] select-none whitespace-nowrap">
          quick estimate
        </span>
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
      </div>

      {/* ── Property summary ── */}
      <p className="text-xs text-[var(--ov-text-muted,#727272)]">
        {summaryParts.join(' \u00B7 ')}
      </p>

      {/* ── Price range ── */}
      <div className="text-2xl font-semibold text-[var(--ov-text,#ffffff)] tracking-tight">
        {formatPriceRange(range)}
      </div>

      {/* ── Style Spectrum Bar ── */}
      <div className="space-y-2">
        {/* Price labels row */}
        <div className="relative flex items-end justify-between text-[11px]">
          <span className={userIsMin ? 'text-[var(--ov-accent-strong,#7367ff)] font-medium' : 'text-[var(--ov-text-muted,#727272)]'}>
            {formatPrice(styleMidpoints.minimalist)}
          </span>

          {showUserAsMiddle && userPrice != null && userPosition != null && (
            <span
              className="absolute text-[var(--ov-accent-strong,#7367ff)] font-medium text-xs whitespace-nowrap"
              style={{ left: `${userPosition * 100}%`, transform: 'translateX(-50%)' }}
            >
              {formatPrice(userPrice)}
            </span>
          )}

          <span className={userIsMax ? 'text-[var(--ov-accent-strong,#7367ff)] font-medium' : 'text-[var(--ov-text-muted,#727272)]'}>
            {formatPrice(styleMidpoints.maximalist)}
          </span>
        </div>

        {/* The bar */}
        <div className="relative h-1.5 rounded-full bg-[var(--ov-border,rgba(255,255,255,0.10))]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[rgba(255,255,255,0.06)] to-[rgba(115,103,255,0.25)]" />

          {userPosition != null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--ov-accent-strong,#7367ff)] border-2 border-[#1a1a1a] shadow-sm"
              style={{ left: `calc(${userPosition * 100}% - 6px)`, transition: 'left 120ms ease-out' }}
            />
          )}
        </div>

        {/* Tappable label chips */}
        <div className="relative flex items-start justify-between">
          {/* Minimalist chip */}
          <button
            type="button"
            onClick={() => setActiveStyleKey('minimalist')}
            aria-label="View Minimalist style details"
            className={[
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors cursor-pointer',
              userIsMin
                ? 'border-[var(--ov-accent-border,rgba(115,103,255,0.40))] text-[var(--ov-accent-strong,#7367ff)]'
                : 'border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))] hover:text-[var(--ov-text,#ffffff)]',
            ].join(' ')}
          >
            Minimalist
            <Info className="w-3 h-3 opacity-50" />
          </button>

          {/* User's style chip (middle) */}
          {showUserAsMiddle && userStyleKey && (
            <button
              type="button"
              onClick={() => setActiveStyleKey(userStyleKey)}
              aria-label={`View ${getStyleInfo(userStyleKey)?.label || userStyleKey} style details`}
              className="absolute inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-[var(--ov-accent-border,rgba(115,103,255,0.40))] text-[var(--ov-accent-strong,#7367ff)] hover:text-[var(--ov-text,#ffffff)] transition-colors cursor-pointer whitespace-nowrap"
              style={{ left: `${userPosition! * 100}%`, transform: 'translateX(-50%)' }}
            >
              {getStyleInfo(userStyleKey)?.label || userStyleKey}
              <Info className="w-3 h-3 opacity-50" />
            </button>
          )}

          {/* Maximalist chip */}
          <button
            type="button"
            onClick={() => setActiveStyleKey('maximalist')}
            aria-label="View Maximalist style details"
            className={[
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors cursor-pointer',
              userIsMax
                ? 'border-[var(--ov-accent-border,rgba(115,103,255,0.40))] text-[var(--ov-accent-strong,#7367ff)]'
                : 'border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))] hover:text-[var(--ov-text,#ffffff)]',
            ].join(' ')}
          >
            Maximalist
            <Info className="w-3 h-3 opacity-50" />
          </button>
        </div>

        {/* No style hint */}
        {!userPrice && (
          <p className="text-[10px] text-[var(--ov-text-muted,#727272)] italic">
            Your style affects price. Tap to explore.
          </p>
        )}

        {/* SR-only description */}
        <span className="sr-only">
          Style spectrum: {formatPrice(styleMidpoints.minimalist)} for Minimalist to {formatPrice(styleMidpoints.maximalist)} for Maximalist.
          {userStyleKey && userPrice ? ` Your selected style, ${getStyleInfo(userStyleKey)?.label}, is ${formatPrice(userPrice)}.` : ''}
        </span>
      </div>

      {/* ── Scope pills ── */}
      {scopeNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scopeNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#727272)]"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Caveat ── */}
      <p className="text-xs text-[var(--ov-text-muted,#727272)] leading-relaxed">
        This is a rough ballpark based on what you have shared so far. A detailed consultation can narrow this down significantly.
      </p>

      {/* ── CTAs ── */}
      {showActions && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDigDeeper}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer bg-brand-purple border border-brand-purple text-brand-dark hover:bg-brand-purple/90 font-medium"
          >
            <span className="leading-none text-base">🔍</span>
            Dig deeper
          </button>
          <button
            type="button"
            onClick={onSaveLater}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.50))] hover:text-[var(--ov-accent-strong,#7367ff)]"
          >
            <span className="leading-none text-base">🔖</span>
            Save &amp; continue
          </button>
        </div>
      )}

      {/* ── Style Detail Modal ── */}
      <Dialog
        open={activeStyleKey !== null}
        onOpenChange={(open) => { if (!open) setActiveStyleKey(null) }}
      >
        <DialogContent
          className="bg-[#1e1e1e] text-[var(--ov-text,#f0f0f0)] border border-[var(--ov-border,rgba(255,255,255,0.12))] sm:max-w-md max-h-[85vh] overflow-y-auto"
        >
          {activeStyleInfo && activePrice != null && (
            <>
              <DialogHeader>
                {/* Style image */}
                <div className="relative w-full h-48 rounded-lg overflow-hidden -mt-1">
                  <Image
                    src={activeStyleInfo.imageUrl}
                    alt={`${activeStyleInfo.label} interior style`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 448px) 100vw, 448px"
                  />
                </div>

                <DialogTitle className="text-lg font-semibold text-[var(--ov-text,#ffffff)] mt-3">
                  {activeStyleInfo.label}
                </DialogTitle>
                <DialogDescription className="text-sm italic text-[var(--ov-text-muted,#a0a0a0)]">
                  &ldquo;{activeStyleInfo.tagline}&rdquo;
                </DialogDescription>
              </DialogHeader>

              {/* Project-specific price */}
              <div className="text-lg font-semibold text-[var(--ov-accent-strong,#7367ff)]">
                {formatPrice(activePrice)} for your project
              </div>

              {/* Description */}
              <p className="text-sm text-[var(--ov-text-muted,#a0a0a0)] leading-relaxed">
                {activeStyleInfo.description}
              </p>

              {/* Materials */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--ov-text-muted,#727272)]">
                  Materials
                </h4>
                <ul className="space-y-1">
                  {activeStyleInfo.materials.map((m) => (
                    <li key={m} className="text-sm text-[var(--ov-text,#f0f0f0)] flex items-start gap-2">
                      <span className="text-[var(--ov-text-muted,#727272)] mt-0.5 flex-shrink-0">&middot;</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Finishes */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--ov-text-muted,#727272)]">
                  Finishes
                </h4>
                <ul className="space-y-1">
                  {activeStyleInfo.finishes.map((f) => (
                    <li key={f} className="text-sm text-[var(--ov-text,#f0f0f0)] flex items-start gap-2">
                      <span className="text-[var(--ov-text-muted,#727272)] mt-0.5 flex-shrink-0">&middot;</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Best for */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--ov-text-muted,#727272)]">
                  Best for
                </h4>
                <p className="text-sm text-[var(--ov-text-muted,#a0a0a0)]">
                  {activeStyleInfo.bestFor}
                </p>
              </div>

              {/* Navigation pills */}
              <div className="flex gap-2 pt-2 border-t border-[var(--ov-border,rgba(255,255,255,0.08))]">
                {navPills.map((pill) => {
                  const isActive = pill.key === activeStyleKey
                  return (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setActiveStyleKey(pill.key)}
                      className={[
                        'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-center transition-colors cursor-pointer border',
                        isActive
                          ? 'bg-[rgba(115,103,255,0.12)] border-[var(--ov-accent-border,rgba(115,103,255,0.40))] text-[var(--ov-accent-strong,#7367ff)]'
                          : 'border-[var(--ov-border,rgba(255,255,255,0.08))] text-[var(--ov-text-muted,#a0a0a0)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] hover:text-[var(--ov-text,#ffffff)]',
                      ].join(' ')}
                    >
                      <span className="text-[11px] font-medium truncate w-full">{pill.label}</span>
                      <span className="text-[10px] opacity-70">{formatPrice(pill.price)}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
