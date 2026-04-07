'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { ChevronUp } from 'lucide-react'
import ScopePanel from './ScopePanel'

type Props = {
  summary: string
  detectedScope: string[]
  confirmedScope: string[]
  confidenceScore: number
  projectOverview: string
  proposalId: string
  aiStarted: boolean
  onToggle: (id: string) => void
  scopeSummaries?: { [id: string]: string }
  onReset?: () => void
  onSaveLater?: () => void
  currentScope?: string
}

// Collapsed handle height (swipe bar + button row)
const HANDLE_HEIGHT = 68
// How far from top of viewport the drawer can reach when fully open
const TOP_INSET = 80
// If user drags below this fraction of max height, snap closed
const CLOSE_THRESHOLD = 0.35
// Velocity threshold (px/ms) — a fast flick always triggers open/close
const VELOCITY_THRESHOLD = 0.4

export type MobileBottomDrawerHandle = { open: () => void }

const MobileBottomDrawer = forwardRef<MobileBottomDrawerHandle, Props>(function MobileBottomDrawer({
  summary,
  detectedScope,
  confirmedScope,
  confidenceScore,
  projectOverview,
  proposalId,
  aiStarted,
  onToggle,
  scopeSummaries = {},
  onReset,
  onSaveLater,
  currentScope,
}, ref) {
  const [open, setOpen] = useState(false)
  // dragOffset: how many px above collapsed position the drawer currently sits.
  // null = not dragging, let CSS handle position via `open` state.
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  // Whether CSS transition should be active (disabled during drag for 1:1 tracking)
  const [animating, setAnimating] = useState(false)

  useImperativeHandle(ref, () => ({
    open: () => { setAnimating(true); setOpen(true) },
  }), [])

  const drawerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number>(0)
  const touchStartTime = useRef<number>(0)
  const startOffset = useRef<number>(0)
  const isDragging = useRef(false)

  // Max drawable height = viewport - top inset
  const getMaxHeight = useCallback(() => {
    return window.innerHeight - TOP_INSET
  }, [])

  // Current resting height based on open/closed
  const getRestHeight = useCallback((isOpen: boolean) => {
    return isOpen ? getMaxHeight() : HANDLE_HEIGHT
  }, [getMaxHeight])

  // ── Touch handlers on the drag handle area ──

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY
    touchStartY.current = y
    touchStartTime.current = Date.now()

    // Calculate current visual height to start dragging from
    const currentHeight = getRestHeight(open)
    startOffset.current = currentHeight - HANDLE_HEIGHT
    isDragging.current = true
    setAnimating(false)
  }, [open, getRestHeight])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    const y = e.touches[0].clientY
    const deltaY = touchStartY.current - y // positive = dragging up
    const maxOffset = getMaxHeight() - HANDLE_HEIGHT

    // Clamp offset between 0 (closed) and maxOffset (fully open)
    const newOffset = Math.max(0, Math.min(maxOffset, startOffset.current + deltaY))
    setDragOffset(newOffset)
  }, [getMaxHeight])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    isDragging.current = false

    const y = e.changedTouches[0].clientY
    const deltaY = touchStartY.current - y
    const elapsed = Date.now() - touchStartTime.current
    const velocity = Math.abs(deltaY) / Math.max(elapsed, 1) // px/ms

    const maxOffset = getMaxHeight() - HANDLE_HEIGHT
    const currentOffset = Math.max(0, Math.min(maxOffset, startOffset.current + deltaY))
    const fraction = currentOffset / maxOffset

    // Determine target: fast flick or position-based snap
    let shouldOpen: boolean
    if (velocity > VELOCITY_THRESHOLD) {
      // Fast flick: direction determines outcome
      shouldOpen = deltaY > 0
    } else {
      // Slow drag: snap based on position
      shouldOpen = fraction > CLOSE_THRESHOLD
    }

    // Animate to target
    setAnimating(true)
    setDragOffset(null) // release drag, let CSS take over
    setOpen(shouldOpen)
  }, [getMaxHeight])

  // Tap to toggle (only if no significant drag occurred)
  const handleTap = useCallback(() => {
    setAnimating(true)
    setOpen(prev => !prev)
  }, [])

  // Backdrop click closes
  const handleBackdropClick = useCallback(() => {
    setAnimating(true)
    setOpen(false)
  }, [])

  // Calculate the drawer height for rendering
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - TOP_INSET : 600
  const drawerHeight = dragOffset !== null
    ? HANDLE_HEIGHT + dragOffset
    : open
      ? maxHeight
      : HANDLE_HEIGHT

  // Backdrop opacity follows drag position
  const maxOffset = maxHeight - HANDLE_HEIGHT
  const backdropOpacity = dragOffset !== null
    ? Math.min(1, dragOffset / maxOffset) * 0.5
    : open ? 0.5 : 0

  // Always render ScopePanel content (but clip it via overflow)
  // so it doesn't flash on open
  const showContent = open || dragOffset !== null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black z-10 ${animating && dragOffset === null ? 'transition-opacity duration-300 ease-out' : ''}`}
        style={{
          opacity: backdropOpacity,
          pointerEvents: backdropOpacity > 0.05 ? 'auto' : 'none',
        }}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed bottom-0 left-0 right-0 z-20 bg-[var(--ov-surface,#1d1d1d)] border-t border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-t-2xl overflow-hidden ${
          animating && dragOffset === null ? 'transition-[height] duration-300 ease-out' : ''
        }`}
        style={{ height: `${drawerHeight}px` }}
      >
        {/* Drag handle area — this is what you grab */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="touch-none"
        >
          {/* Swipe bar indicator */}
          <div className="flex justify-center pt-2 pb-0.5">
            <div className="w-9 h-1 rounded-full bg-[var(--ov-text-muted,#727272)]/40" />
          </div>

          <button
            onClick={handleTap}
            className="w-full flex items-center justify-between px-4 h-12"
            aria-label={open ? 'Close proposal' : 'Open proposal'}
          >
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--ov-border,rgba(255,255,255,0.10))] text-[var(--ov-text,#ffffff)]">
              View Proposal <span className="text-[var(--ov-accent-strong,#fffc00)]">{confidenceScore}%</span>
            </span>
            <ChevronUp
              className={`w-4 h-4 text-[var(--ov-text,#ffffff)] transition-transform duration-200 ${
                open && dragOffset === null ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Scrollable content */}
        {showContent && (
          <div
            className="overflow-hidden"
            style={{ height: `${Math.max(0, drawerHeight - HANDLE_HEIGHT)}px` }}
          >
            <ScopePanel
              detectedScope={detectedScope}
              confirmedScope={confirmedScope}
              confidenceScore={confidenceScore}
              projectOverview={projectOverview}
              proposalId={proposalId}
              aiStarted={aiStarted}
              onToggle={onToggle}
              scopeSummaries={scopeSummaries}
              onReset={onReset}
              onSaveLater={onSaveLater}
              currentScope={currentScope}
            />
          </div>
        )}
      </div>
    </>
  )
})

export default MobileBottomDrawer
