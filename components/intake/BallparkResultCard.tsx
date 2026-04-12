'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronDown, Info } from 'lucide-react'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import { formatPriceRange, formatPrice, computeStyleMidpoints, computeStyleRange, type PriceRange } from '@/lib/pricing/engine'
import { getStyleInfo, STYLE_INFO_ORDERED } from '@/lib/styles/descriptions'
import {
  Dialog,
  DialogClose,
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

function getNavStyles(
  userStyleKey: string | null,
  midpoints: Record<string, number>
): { key: string; label: string; price: number; isUser: boolean }[] {
  const pills: { key: string; label: string; price: number; isUser: boolean }[] = [
    { key: 'minimalist', label: 'Minimalist', price: midpoints.minimalist, isUser: userStyleKey === 'minimalist' },
  ]
  if (userStyleKey && userStyleKey !== 'minimalist' && userStyleKey !== 'maximalist') {
    const info = getStyleInfo(userStyleKey)
    if (info) {
      pills.push({ key: userStyleKey, label: info.label, price: midpoints[userStyleKey], isUser: true })
    }
  }
  pills.push({ key: 'maximalist', label: 'Maximalist', price: midpoints.maximalist, isUser: userStyleKey === 'maximalist' })
  return pills
}

// ── Custom scrub bar ──
// Pointer-event driven for guaranteed drag on all platforms.
// Renders a gradient-filled track, a draggable thumb, and a floating
// label pill above the thumb showing the active style name.

function StyleScrubBar({
  activeTierIndex,
  onTierChange,
  activeLabel,
  onLabelTap,
  minPrice,
  maxPrice,
}: {
  activeTierIndex: number
  onTierChange: (index: number) => void
  activeLabel: string
  onLabelTap: () => void
  minPrice: string
  maxPrice: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const totalTiers = STYLE_INFO_ORDERED.length
  const clampedIndex = Math.max(0, Math.min(totalTiers - 1, activeTierIndex))
  const thumbPct = totalTiers > 1 ? (clampedIndex / (totalTiers - 1)) * 100 : 50

  const getIndexFromPointer = useCallback((clientX: number) => {
    if (!trackRef.current) return clampedIndex
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(pct * (totalTiers - 1))
  }, [clampedIndex, totalTiers])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const idx = getIndexFromPointer(e.clientX)
    onTierChange(idx)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [getIndexFromPointer, onTierChange])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    const idx = getIndexFromPointer(e.clientX)
    onTierChange(idx)
  }, [isDragging, getIndexFromPointer, onTierChange])

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Keyboard support
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onTierChange(Math.min(totalTiers - 1, clampedIndex + 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onTierChange(Math.max(0, clampedIndex - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onTierChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onTierChange(totalTiers - 1)
    }
  }, [clampedIndex, onTierChange, totalTiers])

  return (
    <div className="space-y-3">
      {/* Track + thumb + floating label */}
      <div className="relative pt-10 pb-1">
        {/* Floating label pill — always visible, follows thumb */}
        <button
          type="button"
          onClick={onLabelTap}
          className="absolute top-0 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer bg-[rgba(115,103,255,0.12)] text-[#a99aff] border border-[rgba(115,103,255,0.25)] hover:bg-[rgba(115,103,255,0.20)] hover:border-[rgba(115,103,255,0.40)] hover:text-[#c4baff] active:scale-95"
          style={{
            left: `clamp(48px, ${thumbPct}%, calc(100% - 48px))`,
            transition: isDragging ? 'none' : 'left 150ms ease-out',
          }}
        >
          {activeLabel}
          <Info className="w-3 h-3 opacity-60" />
        </button>

        {/* Connector line from pill to thumb */}
        <div
          className="absolute top-[38px] w-px h-[14px] bg-[rgba(115,103,255,0.25)] -translate-x-1/2"
          style={{
            left: `clamp(48px, ${thumbPct}%, calc(100% - 48px))`,
            transition: isDragging ? 'none' : 'left 150ms ease-out',
          }}
        />

        {/* Track area — handles all pointer events */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Style tier"
          aria-valuemin={0}
          aria-valuemax={totalTiers - 1}
          aria-valuenow={clampedIndex}
          aria-valuetext={activeLabel}
          className="relative h-10 flex items-center cursor-pointer outline-none select-none touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {/* Track background */}
          <div className="absolute inset-x-0 h-[6px] rounded-full bg-[rgba(255,255,255,0.06)]" />

          {/* Track fill — gradient from left edge to thumb */}
          <div
            className="absolute left-0 h-[6px] rounded-full bg-gradient-to-r from-[rgba(115,103,255,0.08)] to-[rgba(115,103,255,0.35)]"
            style={{
              width: `${thumbPct}%`,
              transition: isDragging ? 'none' : 'width 150ms ease-out',
            }}
          />

          {/* Tick marks for each tier */}
          {STYLE_INFO_ORDERED.map((_, i) => {
            const pct = (i / (totalTiers - 1)) * 100
            const isActive = i === clampedIndex
            return (
              <div
                key={i}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-all ${
                  isActive ? 'w-0 h-0' : i <= clampedIndex ? 'w-1 h-1 bg-[rgba(115,103,255,0.5)]' : 'w-1 h-1 bg-[rgba(255,255,255,0.12)]'
                }`}
                style={{ left: `${pct}%` }}
              />
            )
          })}

          {/* Thumb */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full bg-[#7367ff] border-[3px] border-[#1a1a1a] shadow-[0_0_0_2px_rgba(115,103,255,0.25),0_2px_8px_rgba(0,0,0,0.3)] ${
              isDragging ? 'scale-110' : ''
            }`}
            style={{
              left: `${thumbPct}%`,
              transition: isDragging ? 'none' : 'left 150ms ease-out, transform 100ms ease-out',
            }}
          />
        </div>
      </div>

      {/* Endpoint labels */}
      <div className="flex items-center justify-between text-xs text-[rgba(255,255,255,0.35)]">
        <span>Minimalist · {minPrice}</span>
        <span>{maxPrice} · Maximalist</span>
      </div>
    </div>
  )
}

// ── Main card ──

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

  const userStyleKey = stylePreference ? stylePreference.toLowerCase().replace(/\s+/g, '_') : null

  const [activeStyle, setActiveStyle] = useState<string>(userStyleKey || 'modern')
  const [activeStyleKey, setActiveStyleKey] = useState<string | null>(null)
  const [scopeExpanded, setScopeExpanded] = useState(false)
  const modalScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeStyleKey && modalScrollRef.current) {
      modalScrollRef.current.scrollTop = 0
    }
  }, [activeStyleKey])

  const scopeNames = scopeIds
    .map((id) => SCOPE_CATALOG.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s!.name)

  const propertyLabel = propertyType.charAt(0).toUpperCase() + propertyType.slice(1)
  const summaryParts = [propertyLabel, location, sizeSqft > 0 ? `${sizeSqft.toLocaleString()} sqft` : null, conditionLabel(condition)].filter(Boolean)

  const styleMidpoints = computeStyleMidpoints(range)
  const activeStyleInfo = getStyleInfo(activeStyle)
  const activeTierIndex = STYLE_INFO_ORDERED.findIndex((s) => s.key === activeStyle)
  const activeRange = computeStyleRange(range, activeStyle)

  const navPills = getNavStyles(userStyleKey, styleMidpoints)
  const modalStyleInfo = activeStyleKey ? getStyleInfo(activeStyleKey) : null
  const modalPrice = activeStyleKey ? styleMidpoints[activeStyleKey] : null

  const handleTierChange = useCallback((index: number) => {
    if (index >= 0 && index < STYLE_INFO_ORDERED.length) {
      setActiveStyle(STYLE_INFO_ORDERED[index].key)
    }
  }, [])

  return (
    <div className="w-full py-1">
      {/* ── Divider ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] select-none">
          quick estimate
        </span>
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
      </div>

      {/* ── Property summary ── */}
      <p className="text-sm text-[rgba(255,255,255,0.4)] mb-3">
        {summaryParts.join(' \u00B7 ')}
      </p>

      {/* ── Hero price ── */}
      <div className="mb-6">
        <div className="text-[28px] sm:text-[34px] font-bold text-white tracking-tight leading-tight whitespace-nowrap">
          {formatPriceRange(activeRange)}
        </div>
      </div>

      {/* ── Style scrub bar ── */}
      <div className="mb-5">
        <StyleScrubBar
          activeTierIndex={activeTierIndex >= 0 ? activeTierIndex : 3}
          onTierChange={handleTierChange}
          activeLabel={activeStyleInfo?.label || 'Modern'}
          onLabelTap={() => setActiveStyleKey(activeStyle)}
          minPrice={formatPrice(styleMidpoints.minimalist)}
          maxPrice={formatPrice(styleMidpoints.maximalist)}
        />
      </div>

      {/* ── Scope row ── */}
      {scopeNames.length > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setScopeExpanded(!scopeExpanded)}
            className="flex items-center gap-1.5 text-sm text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] transition-colors cursor-pointer"
          >
            <span>{scopeNames.length} area{scopeNames.length !== 1 ? 's' : ''} included</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${scopeExpanded ? 'rotate-180' : ''}`} />
          </button>
          {scopeExpanded && (
            <p className="text-sm text-[rgba(255,255,255,0.35)] mt-2 leading-relaxed">
              {scopeNames.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* ── Caveat ── */}
      <p className="text-[13px] text-[rgba(255,255,255,0.3)] leading-relaxed mb-5">
        Rough ballpark based on what you have shared. A detailed consultation narrows this significantly.
      </p>

      {/* ── CTAs ── */}
      {showActions && (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onDigDeeper}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer bg-[#7367ff] text-white hover:bg-[#8578ff] active:scale-[0.98]"
          >
            <span className="leading-none text-base">🔍</span>
            Dig deeper
          </button>
          <button
            type="button"
            onClick={onSaveLater}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.7)] hover:border-[rgba(115,103,255,0.4)] hover:text-white active:scale-[0.98]"
          >
            <span className="leading-none text-base">🔖</span>
            Save &amp; continue
          </button>
        </div>
      )}

      {/* ── SR-only ── */}
      <span className="sr-only">
        Style spectrum: {formatPrice(styleMidpoints.minimalist)} for Minimalist to {formatPrice(styleMidpoints.maximalist)} for Maximalist.
        {activeStyleInfo ? ` Currently viewing ${activeStyleInfo.label} at ${formatPriceRange(activeRange)}.` : ''}
      </span>

      {/* ── Style Detail Modal ── */}
      <Dialog
        open={activeStyleKey !== null}
        onOpenChange={(open) => { if (!open) setActiveStyleKey(null) }}
      >
        <DialogContent
          className="bg-[#1e1e1e] text-[var(--ov-text,#f0f0f0)] border border-[rgba(255,255,255,0.08)] sm:max-w-md p-0 overflow-hidden"
          showCloseButton={false}
        >
          {modalStyleInfo && modalPrice != null && (
            <div ref={modalScrollRef} className="overflow-y-auto max-h-[85vh]">
              <div className="relative w-full h-52">
                <Image
                  src={modalStyleInfo.imageUrl}
                  alt={`${modalStyleInfo.label} interior style`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 448px) 100vw, 448px"
                />
                <DialogClose
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span className="sr-only">Close</span>
                </DialogClose>
              </div>

              <div className="p-5 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold text-white">
                    {modalStyleInfo.label}
                  </DialogTitle>
                  <DialogDescription className="text-sm italic text-[rgba(255,255,255,0.5)]">
                    &ldquo;{modalStyleInfo.tagline}&rdquo;
                  </DialogDescription>
                </DialogHeader>

                <div className="text-xl font-semibold text-[#7367ff]">
                  {formatPrice(modalPrice)} for your project
                </div>

                <p className="text-sm text-[rgba(255,255,255,0.55)] leading-relaxed">
                  {modalStyleInfo.description}
                </p>

                {[
                  { title: 'Materials', items: modalStyleInfo.materials },
                  { title: 'Finishes', items: modalStyleInfo.finishes },
                ].map(({ title, items }) => (
                  <div key={title} className="space-y-1.5">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
                      {title}
                    </h4>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item} className="text-sm text-[rgba(255,255,255,0.8)] flex items-start gap-2">
                          <span className="text-[rgba(255,255,255,0.25)] mt-0.5 flex-shrink-0">&middot;</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
                    Best for
                  </h4>
                  <p className="text-sm text-[rgba(255,255,255,0.55)]">
                    {modalStyleInfo.bestFor}
                  </p>
                </div>
              </div>

              <div className="sticky bottom-0 bg-[#1e1e1e] border-t border-[rgba(255,255,255,0.06)] p-3">
                <div className="flex gap-2">
                  {navPills.map((pill) => {
                    const isActive = pill.key === activeStyleKey
                    return (
                      <button
                        key={pill.key}
                        type="button"
                        onClick={() => setActiveStyleKey(pill.key)}
                        className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg text-center transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-[rgba(115,103,255,0.12)] border-[rgba(115,103,255,0.35)] text-[#7367ff]'
                            : 'border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)] hover:border-[rgba(115,103,255,0.25)] hover:text-white'
                        }`}
                      >
                        <span className="text-sm font-medium truncate w-full">{pill.label}</span>
                        <span className="text-xs opacity-60">{formatPrice(pill.price)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
