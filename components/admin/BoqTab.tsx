'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Lock, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

type BoqLineItem = {
  description: string
  unit: string
  quantity: number
  unit_price_aed: number
  subtotal_aed: number
  historical_avg_rate?: number | null
  deviation_pct?: number | null
}

type BoqCategory = {
  name: string
  line_items: BoqLineItem[]
  category_subtotal_aed: number
}

type BoqDraft = {
  id: string
  lead_id: string
  version: number
  categories: BoqCategory[]
  grand_total_aed: number
  assumptions: string[]
  exclusions: string[]
  locked: boolean
  deviation_flags: DeviationFlag[] | null
  created_at: string
}

type DeviationFlag = {
  categoryName: string
  lineItemIndex: number
  lineItemDescription: string
  generatedRate: number
  historicalAvg: number
  deviationPct: number
  severity: 'info' | 'warning' | 'alert'
  message: string
}

type Props = {
  leadId: string
}

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const SEVERITY_STYLES = {
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  alert: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
}

export default function BoqTab({ leadId }: Props) {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [boq, setBoq] = useState<BoqDraft | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)

  const fetchBoq = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq`)
      if (res.ok) {
        const data = await res.json()
        setBoq(data)
        if (data) {
          // Auto-expand all categories
          const names = new Set((data.categories as BoqCategory[]).map(c => c.name))
          setExpandedCategories(names)
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [leadId])

  useEffect(() => { fetchBoq() }, [fetchBoq])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      if (res.ok) {
        await fetchBoq()
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const handleLock = async () => {
    if (!boq) return
    setLocking(true)
    try {
      const res = await fetch(`/api/admin/boq/${boq.id}/lock`, { method: 'POST' })
      if (res.ok) {
        await fetchBoq()
        setLockConfirmOpen(false)
      }
    } catch { /* ignore */ }
    setLocking(false)
  }

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Build a map of deviation flags for quick lookup
  const flagMap = new Map<string, DeviationFlag>()
  if (boq?.deviation_flags) {
    for (const flag of boq.deviation_flags) {
      flagMap.set(`${flag.categoryName}:${flag.lineItemIndex}`, flag)
    }
  }

  const flagSummary = boq?.deviation_flags
    ? {
        total: boq.deviation_flags.length,
        alert: boq.deviation_flags.filter(f => f.severity === 'alert').length,
        warning: boq.deviation_flags.filter(f => f.severity === 'warning').length,
      }
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <p className="text-sm text-muted-foreground">Generating BOQ with historical pricing data...</p>
      </div>
    )
  }

  if (!boq) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-muted-foreground">No BOQ generated yet.</p>
        <Button onClick={handleGenerate} className="gap-2 cursor-pointer">
          <Sparkles className="w-4 h-4" />
          Generate BOQ
        </Button>
      </div>
    )
  }

  const categories = (boq.categories ?? []) as BoqCategory[]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {categories.length} categories &middot; Grand total: <span className="font-mono font-medium text-foreground">AED {fmt(boq.grand_total_aed)}</span>
          </div>
          {boq.locked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!boq.locked && (
            <>
              <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating} className="text-xs cursor-pointer gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Regenerate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLockConfirmOpen(true)} className="text-xs cursor-pointer gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Lock BOQ
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Deviation flag summary */}
      {flagSummary && flagSummary.total > 0 && (
        <div className="flex items-center gap-2 px-6 md:px-8 py-2 border-b bg-amber-500/5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>{flagSummary.total} items flagged</span>
          {flagSummary.alert > 0 && <span className="text-red-400">{flagSummary.alert} alerts</span>}
          {flagSummary.warning > 0 && <span className="text-amber-400">{flagSummary.warning} warnings</span>}
        </div>
      )}

      {/* BOQ table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_60px_60px_80px_90px_20px] gap-2 px-6 md:px-8 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-background sticky top-0 z-10">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Rate (AED)</span>
          <span className="text-right">Total (AED)</span>
          <span></span>
        </div>

        {categories.map((category) => {
          const isOpen = expandedCategories.has(category.name)

          return (
            <div key={category.name}>
              {/* Category row */}
              <div
                className="grid grid-cols-[1fr_60px_60px_80px_90px_20px] gap-2 items-center px-6 md:px-8 py-2.5 hover:bg-muted/30 cursor-pointer border-b transition-colors"
                onClick={() => toggleCategory(category.name)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                  }
                  <span className="font-semibold text-sm">{category.name}</span>
                  <span className="text-xs text-muted-foreground">({category.line_items.length})</span>
                </div>
                <span />
                <span />
                <span />
                <span className="text-right font-mono text-xs font-medium">{fmt(category.category_subtotal_aed)}</span>
                <span />
              </div>

              {/* Line items */}
              {isOpen && category.line_items.map((item, idx) => {
                const flag = flagMap.get(`${category.name}:${idx}`)
                const FlagIcon = flag ? SEVERITY_STYLES[flag.severity].icon : null

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_60px_60px_80px_90px_20px] gap-2 items-center pl-12 pr-6 md:pl-14 md:pr-8 py-2 border-b border-dashed border-muted/30 hover:bg-muted/10 transition-colors"
                  >
                    <span className="text-sm truncate text-muted-foreground" title={item.description}>
                      {item.description}
                    </span>
                    <span className="text-right text-xs font-mono text-muted-foreground">{fmt(item.quantity)}</span>
                    <span className="text-right text-xs text-muted-foreground">{item.unit}</span>
                    <span className="text-right text-xs font-mono">{fmt(item.unit_price_aed)}</span>
                    <span className="text-right text-xs font-mono">{fmt(item.subtotal_aed)}</span>
                    <div className="flex justify-end">
                      {FlagIcon && flag && (
                        <span title={flag.message}>
                          <FlagIcon className={`w-3.5 h-3.5 ${SEVERITY_STYLES[flag.severity].color}`} />
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Grand total row */}
        <div className="grid grid-cols-[1fr_60px_60px_80px_90px_20px] gap-2 items-center px-6 md:px-8 py-3 border-t-2 bg-muted/20">
          <span className="font-semibold text-sm">Grand Total</span>
          <span />
          <span />
          <span />
          <span className="text-right font-mono text-sm font-bold">{fmt(boq.grand_total_aed)}</span>
          <span />
        </div>

        {/* Assumptions & Exclusions */}
        {((boq.assumptions?.length ?? 0) > 0 || (boq.exclusions?.length ?? 0) > 0) && (
          <div className="px-6 md:px-8 py-4 space-y-3 border-t">
            {boq.assumptions?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Assumptions</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {boq.assumptions.map((a, i) => <li key={i}>&bull; {a}</li>)}
                </ul>
              </div>
            )}
            {boq.exclusions?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Exclusions</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {boq.exclusions.map((e, i) => <li key={i}>&bull; {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lock confirmation dialog */}
      <Dialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Lock this BOQ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Once locked, this BOQ cannot be edited. Its pricing data will be added to the historical Price Book to improve future estimates.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockConfirmOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleLock} disabled={locking} className="cursor-pointer">
              {locking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lock BOQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
