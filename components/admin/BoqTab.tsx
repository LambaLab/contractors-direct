'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Lock, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronRight, Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type Props = { leadId: string }

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const FLAG_STYLES = {
  info: { icon: Info, color: 'text-blue-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400' },
  alert: { icon: AlertCircle, color: 'text-red-400' },
}

const COL = 'grid-cols-[1fr_60px_50px_80px_90px_28px]'

export default function BoqTab({ leadId }: Props) {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [boq, setBoq] = useState<BoqDraft | null>(null)
  const [categories, setCategories] = useState<BoqCategory[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null) // "cat:item:field"
  const [editValue, setEditValue] = useState('')
  const [dirty, setDirty] = useState(false)

  const fetchBoq = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq`)
      if (res.ok) {
        const data = await res.json()
        setBoq(data)
        if (data) {
          setCategories(data.categories as BoqCategory[])
          const indices = new Set((data.categories as BoqCategory[]).map((_: BoqCategory, i: number) => i))
          setExpandedCategories(indices)
        }
        setDirty(false)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [leadId])

  useEffect(() => { fetchBoq() }, [fetchBoq])

  // ── Generate ──
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq/generate`, { method: 'POST' })
      if (res.ok) await fetchBoq()
    } catch { /* ignore */ }
    setGenerating(false)
  }

  // ── Save edits ──
  const handleSave = async () => {
    if (!boq || !dirty) return
    setSaving(true)
    // Recalculate subtotals and grand total
    const updated = categories.map(cat => ({
      ...cat,
      category_subtotal_aed: cat.line_items.reduce((s, li) => s + li.subtotal_aed, 0),
    }))
    const grandTotal = updated.reduce((s, cat) => s + cat.category_subtotal_aed, 0)

    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boqId: boq.id, categories: updated, grand_total_aed: grandTotal }),
      })
      if (res.ok) {
        setCategories(updated)
        setBoq({ ...boq, categories: updated, grand_total_aed: grandTotal })
        setDirty(false)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  // ── Lock ──
  const handleLock = async () => {
    if (!boq) return
    if (dirty) await handleSave()
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

  // ── Inline editing ──
  const startEdit = (key: string, value: string) => {
    setEditingCell(key)
    setEditValue(value)
  }

  const commitEdit = () => {
    if (!editingCell) return
    const [catStr, itemStr, field] = editingCell.split(':')
    const catIdx = parseInt(catStr)
    const itemIdx = parseInt(itemStr)

    setCategories(prev => {
      const next = prev.map((cat, ci) => {
        if (ci !== catIdx) return cat
        if (field === 'catName') {
          return { ...cat, name: editValue }
        }
        return {
          ...cat,
          line_items: cat.line_items.map((li, li_idx) => {
            if (li_idx !== itemIdx) return li
            const updated = { ...li }
            if (field === 'description') updated.description = editValue
            else if (field === 'quantity') {
              updated.quantity = parseFloat(editValue) || 0
              updated.subtotal_aed = updated.quantity * updated.unit_price_aed
            }
            else if (field === 'unit') updated.unit = editValue
            else if (field === 'rate') {
              updated.unit_price_aed = parseFloat(editValue) || 0
              updated.subtotal_aed = updated.quantity * updated.unit_price_aed
            }
            return updated
          }),
        }
      })
      return next
    })
    setDirty(true)
    setEditingCell(null)
  }

  // ── Add/delete items ──
  const addLineItem = (catIdx: number) => {
    setCategories(prev => prev.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return {
        ...cat,
        line_items: [...cat.line_items, { description: 'New item', unit: 'nos', quantity: 1, unit_price_aed: 0, subtotal_aed: 0 }],
      }
    }))
    setDirty(true)
  }

  const deleteLineItem = (catIdx: number, itemIdx: number) => {
    setCategories(prev => prev.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return { ...cat, line_items: cat.line_items.filter((_, i) => i !== itemIdx) }
    }))
    setDirty(true)
  }

  const addCategory = () => {
    setCategories(prev => [...prev, { name: 'New Category', line_items: [], category_subtotal_aed: 0 }])
    setExpandedCategories(prev => new Set([...prev, categories.length]))
    setDirty(true)
  }

  const deleteCategory = (catIdx: number) => {
    setCategories(prev => prev.filter((_, i) => i !== catIdx))
    setDirty(true)
  }

  const toggleCategory = (idx: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Deviation flags map
  const flagMap = new Map<string, DeviationFlag>()
  if (boq?.deviation_flags) {
    for (const flag of boq.deviation_flags) {
      flagMap.set(`${flag.categoryName}:${flag.lineItemIndex}`, flag)
    }
  }

  // Computed grand total
  const grandTotal = categories.reduce((s, cat) => s + cat.line_items.reduce((ls, li) => ls + li.subtotal_aed, 0), 0)

  // ── Render states ──

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <p className="text-sm text-muted-foreground">Generating BOQ with historical pricing data...</p>
        <p className="text-xs text-muted-foreground">This may take up to a minute.</p>
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

  const isLocked = boq.locked

  // ── Editable cell renderer ──
  function EditableCell({ cellKey, value, className, isNumber }: { cellKey: string; value: string; className?: string; isNumber?: boolean }) {
    if (isLocked) return <span className={className}>{isNumber ? fmt(parseFloat(value)) : value}</span>
    if (editingCell === cellKey) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          type={isNumber ? 'number' : 'text'}
          className={`h-6 text-xs px-1 ${isNumber ? 'text-right font-mono' : ''}`}
          autoFocus
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditingCell(null)
          }}
        />
      )
    }
    return (
      <span
        className={`${className} cursor-text hover:bg-muted/30 px-1 -mx-1 rounded transition-colors`}
        onClick={() => startEdit(cellKey, value)}
        title="Click to edit"
      >
        {isNumber ? fmt(parseFloat(value)) : value}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {categories.length} categories &middot; Total: <span className="font-mono font-medium text-foreground">AED {fmt(grandTotal)}</span>
          </div>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
          {dirty && !isLocked && (
            <span className="text-[10px] text-amber-400">Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isLocked && (
            <>
              {dirty && (
                <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs cursor-pointer gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={addCategory} className="text-xs cursor-pointer gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Category
              </Button>
              <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating} className="text-xs cursor-pointer gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Regenerate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLockConfirmOpen(true)} className="text-xs cursor-pointer gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Lock
              </Button>
            </>
          )}
        </div>
      </div>

      {/* BOQ table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className={`grid ${COL} gap-2 px-6 md:px-8 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-background sticky top-0 z-10`}>
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Total</span>
          <span></span>
        </div>

        {categories.map((category, catIdx) => {
          const isOpen = expandedCategories.has(catIdx)
          const catSubtotal = category.line_items.reduce((s, li) => s + li.subtotal_aed, 0)

          return (
            <div key={catIdx}>
              {/* Category row */}
              <div className="flex items-center gap-1 px-6 md:px-8 py-2.5 hover:bg-muted/30 border-b transition-colors">
                <button onClick={() => toggleCategory(catIdx)} className="cursor-pointer shrink-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>
                <EditableCell
                  cellKey={`${catIdx}:0:catName`}
                  value={category.name}
                  className="font-semibold text-sm flex-1"
                />
                <span className="text-xs text-muted-foreground mr-2">({category.line_items.length})</span>
                <span className="text-right font-mono text-xs font-medium w-[90px]">{fmt(catSubtotal)}</span>
                {!isLocked && (
                  <button
                    onClick={() => deleteCategory(catIdx)}
                    className="p-1 text-muted-foreground hover:text-destructive cursor-pointer transition-colors ml-1"
                    title="Delete category"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Line items */}
              {isOpen && (
                <>
                  {category.line_items.map((item, itemIdx) => {
                    const flag = flagMap.get(`${category.name}:${itemIdx}`)
                    const FlagIcon = flag ? FLAG_STYLES[flag.severity].icon : null

                    return (
                      <div key={itemIdx} className={`grid ${COL} gap-2 items-center pl-10 pr-6 md:pl-12 md:pr-8 py-1.5 border-b border-dashed border-muted/30 hover:bg-muted/10 transition-colors group`}>
                        <EditableCell cellKey={`${catIdx}:${itemIdx}:description`} value={item.description} className="text-sm truncate text-muted-foreground" />
                        <EditableCell cellKey={`${catIdx}:${itemIdx}:quantity`} value={item.quantity.toString()} className="text-right text-xs font-mono text-muted-foreground" isNumber />
                        <EditableCell cellKey={`${catIdx}:${itemIdx}:unit`} value={item.unit} className="text-right text-xs text-muted-foreground" />
                        <EditableCell cellKey={`${catIdx}:${itemIdx}:rate`} value={item.unit_price_aed.toString()} className="text-right text-xs font-mono" isNumber />
                        <span className="text-right text-xs font-mono">{fmt(item.subtotal_aed)}</span>
                        <div className="flex justify-end items-center gap-0.5">
                          {FlagIcon && flag && (
                            <span title={flag.message}><FlagIcon className={`w-3 h-3 ${FLAG_STYLES[flag.severity].color}`} /></span>
                          )}
                          {!isLocked && (
                            <button
                              onClick={() => deleteLineItem(catIdx, itemIdx)}
                              className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive cursor-pointer transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Add line item */}
                  {!isLocked && (
                    <button
                      onClick={() => addLineItem(catIdx)}
                      className="flex items-center gap-1.5 pl-10 md:pl-12 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full border-b border-dashed border-muted/30"
                    >
                      <Plus className="w-3 h-3" />
                      Add item
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}

        {/* Grand total */}
        <div className={`grid ${COL} gap-2 items-center px-6 md:px-8 py-3 border-t-2 bg-muted/20`}>
          <span className="font-semibold text-sm">Grand Total</span>
          <span /><span /><span />
          <span className="text-right font-mono text-sm font-bold">{fmt(grandTotal)}</span>
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

      {/* Lock dialog */}
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
