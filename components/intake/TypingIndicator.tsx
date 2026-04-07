'use client'

import { useState, useEffect } from 'react'

const DEFAULT_LABELS = ['Thinking', 'Analyzing', 'Planning', 'Mapping', 'Building']
const INTERVAL_MS = 1800

export default function TypingIndicator({ labels = DEFAULT_LABELS }: { labels?: string[] }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Reset index when labels change (e.g. switching between chat and session loading)
    setIndex(0)
    setVisible(true)
  }, [labels])

  useEffect(() => {
    const cycle = setInterval(() => {
      // Fade out
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % labels.length)
        setVisible(true)
      }, 200)
    }, INTERVAL_MS)

    return () => clearInterval(cycle)
  }, [labels])

  return (
    <span
      className="inline-block text-sm text-[var(--ov-text-muted,#727272)] transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
      }}
    >
      {labels[index]}…
    </span>
  )
}
