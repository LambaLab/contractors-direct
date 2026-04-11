'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Lock, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// ── Types ──

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

type PriceBookItem = {
  description: string
  unit: string | null
  unit_rate_aed: number | null
  scope_item_id: string | null
  historical_projects: { project_name: string } | null
}

type Props = { leadId: string }

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function aed(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return `AED ${fmt(n)}`
}

const FLAG_STYLES = {
  info: { icon: Info, color: 'text-blue-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400' },
  alert: { icon: AlertCircle, color: 'text-red-400' },
}

// Wider total column to prevent icon overlap
const COL = 'grid-cols-[1fr_55px_45px_95px_110px_32px]'

export default function BoqTab({ leadId }: Props) {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [boq, setBoq] = useState<BoqDraft | null>(null)
  const [categories, setCategories] = useState<BoqCategory[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editCatIdx, setEditCatIdx] = useState(0)
  const [editItemIdx, setEditItemIdx] = useState(0)
  const [editDesc, setEditDesc] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editHistory, setEditHistory] = useState<PriceBookItem[]>([])

  // Add from Price Book
  const [addOpen, setAddOpen] = useState(false)
  const [addCatIdx, setAddCatIdx] = useState(0)
  const [addSearch, setAddSearch] = useState('')
  const [addCategoryFilter, setAddCategoryFilter] = useState('all')
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([])
  const [pbLoading, setPbLoading] = useState(false)
  // Add item detail view (when clicking an item in the list)
  const [addDetailItem, setAddDetailItem] = useState<PriceBookItem | null>(null)
  const [addDetailRate, setAddDetailRate] = useState('')
  const [addDetailQty, setAddDetailQty] = useState('1')
  const [addDetailHistory, setAddDetailHistory] = useState<PriceBookItem[]>([])

  // Category rename
  const [renameCatOpen, setRenameCatOpen] = useState(false)
  const [renameCatIdx, setRenameCatIdx] = useState(0)
  const [renameCatValue, setRenameCatValue] = useState('')

  const fetchBoq = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq`)
      if (res.ok) {
        const data = await res.json()
        setBoq(data)
        if (data) {
          setCategories(data.categories as BoqCategory[])
          setExpandedCategories(new Set((data.categories as BoqCategory[]).map((_: BoqCategory, i: number) => i)))
        }
        setDirty(false)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [leadId])

  useEffect(() => { fetchBoq() }, [fetchBoq])

  // Fetch all price book items once
  const fetchPriceBook = useCallback(async () => {
    if (priceBookItems.length > 0) return
    setPbLoading(true)
    try {
      const res = await fetch('/api/admin/price-book')
      if (res.ok) {
        const data = await res.json()
        setPriceBookItems(data.sampleItems ?? [])
      }
    } catch { /* ignore */ }
    setPbLoading(false)
  }, [priceBookItems.length])

  // Find similar items for history
  const findSimilar = (desc: string, unit: string): PriceBookItem[] => {
    const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3)
    if (words.length === 0) return []
    return priceBookItems
      .filter(s => words.some(w => s.description.toLowerCase().includes(w)))
      .slice(0, 10)
  }

  // Get unique scope categories from price book items
  const pbCategories = [...new Set(priceBookItems.map(i => i.scope_item_id).filter(Boolean))] as string[]

  // ── Handlers ──

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq/generate`, { method: 'POST' })
      if (res.ok) await fetchBoq()
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!boq || !dirty) return
    setSaving(true)
    const updated = categories.map(cat => ({ ...cat, category_subtotal_aed: cat.line_items.reduce((s, li) => s + li.subtotal_aed, 0) }))
    const grandTotal = updated.reduce((s, cat) => s + cat.category_subtotal_aed, 0)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/boq`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boqId: boq.id, categories: updated, grand_total_aed: grandTotal }),
      })
      if (res.ok) { setCategories(updated); setBoq({ ...boq, categories: updated, grand_total_aed: grandTotal }); setDirty(false) }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleLock = async () => {
    if (!boq) return
    if (dirty) await handleSave()
    setLocking(true)
    try {
      const res = await fetch(`/api/admin/boq/${boq.id}/lock`, { method: 'POST' })
      if (res.ok) { await fetchBoq(); setLockConfirmOpen(false) }
    } catch { /* ignore */ }
    setLocking(false)
  }

  // Edit item
  const openEditItem = async (catIdx: number, itemIdx: number) => {
    const item = categories[catIdx].line_items[itemIdx]
    setEditCatIdx(catIdx)
    setEditItemIdx(itemIdx)
    setEditDesc(item.description)
    setEditQty(item.quantity.toString())
    setEditUnit(item.unit)
    setEditRate(item.unit_price_aed.toString())
    setEditOpen(true)
    await fetchPriceBook()
    setEditHistory(findSimilar(item.description, item.unit))
  }

  // Update history when price book loads
  useEffect(() => {
    if (editOpen && priceBookItems.length > 0) {
      setEditHistory(findSimilar(editDesc, editUnit))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceBookItems.length])

  const saveEditItem = () => {
    const qty = parseFloat(editQty) || 0
    const rate = parseFloat(editRate) || 0
    setCategories(prev => prev.map((cat, ci) => {
      if (ci !== editCatIdx) return cat
      return { ...cat, line_items: cat.line_items.map((li, li_idx) => li_idx !== editItemIdx ? li : { ...li, description: editDesc, quantity: qty, unit: editUnit, unit_price_aed: rate, subtotal_aed: qty * rate }) }
    }))
    setDirty(true)
    setEditOpen(false)
  }

  // Reorder
  const moveItem = (catIdx: number, itemIdx: number, dir: -1 | 1) => {
    const t = itemIdx + dir
    setCategories(prev => prev.map((cat, ci) => {
      if (ci !== catIdx || t < 0 || t >= cat.line_items.length) return cat
      const items = [...cat.line_items]; [items[itemIdx], items[t]] = [items[t], items[itemIdx]]
      return { ...cat, line_items: items }
    }))
    setDirty(true)
  }

  const moveCategory = (catIdx: number, dir: -1 | 1) => {
    const t = catIdx + dir
    if (t < 0 || t >= categories.length) return
    setCategories(prev => { const n = [...prev]; [n[catIdx], n[t]] = [n[t], n[catIdx]]; return n })
    setDirty(true)
  }

  // Add from Price Book
  const openAddFromPB = async (catIdx: number) => {
    setAddCatIdx(catIdx)
    setAddSearch('')
    setAddCategoryFilter('all')
    setAddDetailItem(null)
    setAddOpen(true)
    await fetchPriceBook()
  }

  const showAddDetail = (item: PriceBookItem) => {
    setAddDetailItem(item)
    setAddDetailRate(item.unit_rate_aed?.toString() ?? '0')
    setAddDetailQty('1')
    // Find similar for history
    setAddDetailHistory(
      priceBookItems
        .filter(p => p.description === item.description && p !== item)
        .concat(findSimilar(item.description, item.unit ?? '').filter(p => p !== item))
        .slice(0, 8)
    )
  }

  const confirmAddItem = () => {
    if (!addDetailItem) return
    const qty = parseFloat(addDetailQty) || 1
    const rate = parseFloat(addDetailRate) || 0
    setCategories(prev => prev.map((cat, ci) => {
      if (ci !== addCatIdx) return cat
      return { ...cat, line_items: [...cat.line_items, { description: addDetailItem.description, unit: addDetailItem.unit ?? 'nos', quantity: qty, unit_price_aed: rate, subtotal_aed: qty * rate }] }
    }))
    setDirty(true)
    setAddDetailItem(null)
    setAddOpen(false)
  }

  const addBlankItem = () => {
    setCategories(prev => prev.map((cat, ci) => ci !== addCatIdx ? cat : { ...cat, line_items: [...cat.line_items, { description: 'New item', unit: 'nos', quantity: 1, unit_price_aed: 0, subtotal_aed: 0 }] }))
    setDirty(true)
    setAddOpen(false)
  }

  // Delete
  const deleteItem = (catIdx: number, itemIdx: number) => {
    setCategories(prev => prev.map((cat, ci) => ci !== catIdx ? cat : { ...cat, line_items: cat.line_items.filter((_, i) => i !== itemIdx) }))
    setDirty(true)
  }
  const deleteCategory = (catIdx: number) => { setCategories(prev => prev.filter((_, i) => i !== catIdx)); setDirty(true) }
  const addCategory = () => {
    setCategories(prev => [{ name: 'New Category', line_items: [], category_subtotal_aed: 0 }, ...prev])
    // Shift all expanded indices up by 1 and expand the new one at index 0
    setExpandedCategories(prev => {
      const next = new Set<number>([0])
      for (const idx of prev) next.add(idx + 1)
      return next
    })
    setDirty(true)
  }

  // Rename category
  const openRenameCat = (catIdx: number) => { setRenameCatIdx(catIdx); setRenameCatValue(categories[catIdx].name); setRenameCatOpen(true) }
  const saveRenameCat = () => { setCategories(prev => prev.map((cat, ci) => ci === renameCatIdx ? { ...cat, name: renameCatValue } : cat)); setDirty(true); setRenameCatOpen(false) }

  const toggleCategory = (idx: number) => { setExpandedCategories(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n }) }

  // Deviation flags
  const flagMap = new Map<string, DeviationFlag>()
  if (boq?.deviation_flags) for (const f of boq.deviation_flags) flagMap.set(`${f.categoryName}:${f.lineItemIndex}`, f)

  const grandTotal = categories.reduce((s, c) => s + c.line_items.reduce((ls, li) => ls + li.subtotal_aed, 0), 0)

  // Filtered PB items for add dialog
  const filteredPB = priceBookItems.filter(p => {
    if (addCategoryFilter !== 'all' && p.scope_item_id !== addCategoryFilter) return false
    if (addSearch && !p.description.toLowerCase().includes(addSearch.toLowerCase())) return false
    return true
  }).slice(0, 50)

  // ── Render ──

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  if (generating) return <div className="flex flex-col items-center justify-center py-16 gap-3"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /><p className="text-sm text-muted-foreground">Generating BOQ with historical pricing...</p><p className="text-xs text-muted-foreground">This may take up to a minute.</p></div>
  if (!boq) return <div className="flex flex-col items-center justify-center py-16 gap-3"><p className="text-sm text-muted-foreground">No BOQ generated yet.</p><Button onClick={handleGenerate} className="gap-2 cursor-pointer"><Sparkles className="w-4 h-4" />Generate BOQ</Button></div>

  const isLocked = boq.locked

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{categories.length} categories &middot; Total: <span className="font-mono font-medium text-foreground">AED {fmt(grandTotal)}</span></span>
          {isLocked && <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400"><Lock className="w-3 h-3" /> Locked</span>}
          {dirty && !isLocked && <span className="text-[10px] text-amber-400">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {!isLocked && <>
            {dirty && <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs cursor-pointer">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}</Button>}
            <Button variant="ghost" size="sm" onClick={addCategory} className="text-xs cursor-pointer gap-1.5"><Plus className="w-3.5 h-3.5" />Category</Button>
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating} className="text-xs cursor-pointer gap-1.5"><Sparkles className="w-3.5 h-3.5" />Regenerate</Button>
            <Button variant="outline" size="sm" onClick={() => setLockConfirmOpen(true)} className="text-xs cursor-pointer gap-1.5"><Lock className="w-3.5 h-3.5" />Lock</Button>
          </>}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className={`grid ${COL} gap-2 px-6 md:px-8 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-background sticky top-0 z-10`}>
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Amount</span>
          <span></span>
        </div>

        {categories.map((category, catIdx) => {
          const isOpen = expandedCategories.has(catIdx)
          const catSubtotal = category.line_items.reduce((s, li) => s + li.subtotal_aed, 0)
          return (
            <div key={catIdx}>
              <div className="flex items-center gap-1 px-6 md:px-8 py-2.5 hover:bg-muted/30 border-b transition-colors group cursor-pointer" onClick={() => toggleCategory(catIdx)}>
                <div className="shrink-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
                <span
                  className={`font-semibold text-sm flex-1 ${!isLocked ? 'hover:text-purple-400 hover:underline transition-colors' : ''}`}
                  onClick={(e) => { if (!isLocked) { e.stopPropagation(); openRenameCat(catIdx) } }}
                >{category.name}</span>
                <span className="text-xs text-muted-foreground mr-2">({category.line_items.length})</span>
                <span className="text-right font-mono text-xs font-medium w-[110px]">{aed(catSubtotal)}</span>
                {!isLocked && <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                  <button onClick={() => moveCategory(catIdx, -1)} className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => moveCategory(catIdx, 1)} className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"><ArrowDown className="w-3 h-3" /></button>
                  <button onClick={() => deleteCategory(catIdx)} className="p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                </div>}
              </div>

              {isOpen && <>
                {category.line_items.map((item, itemIdx) => {
                  const flag = flagMap.get(`${category.name}:${itemIdx}`)
                  const FlagIcon = flag ? FLAG_STYLES[flag.severity].icon : null
                  return (
                    <div key={itemIdx} className={`grid ${COL} gap-2 items-center pl-10 pr-6 md:pl-12 md:pr-8 py-2 border-b border-dashed border-muted/30 hover:bg-muted/10 transition-colors group ${!isLocked ? 'cursor-pointer' : ''}`} onClick={() => !isLocked && openEditItem(catIdx, itemIdx)}>
                      <span className="text-sm truncate text-muted-foreground" title={item.description}>{item.description}</span>
                      <span className="text-right text-xs font-mono text-muted-foreground">{fmt(item.quantity)}</span>
                      <span className="text-right text-xs text-muted-foreground">{item.unit}</span>
                      <span className="text-right text-xs font-mono">{aed(item.unit_price_aed)}</span>
                      <span className="text-right text-xs font-mono">{aed(item.subtotal_aed)}</span>
                      <div className="flex items-center gap-0.5 justify-end">
                        {FlagIcon && flag && <span title={flag.message}><FlagIcon className={`w-3 h-3 ${FLAG_STYLES[flag.severity].color}`} /></span>}
                        {!isLocked && <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); moveItem(catIdx, itemIdx, -1) }} className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"><ArrowUp className="w-3 h-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); moveItem(catIdx, itemIdx, 1) }} className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"><ArrowDown className="w-3 h-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteItem(catIdx, itemIdx) }} className="p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                        </div>}
                      </div>
                    </div>
                  )
                })}
                {!isLocked && <button onClick={() => openAddFromPB(catIdx)} className="flex items-center gap-1.5 pl-10 md:pl-12 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full border-b border-dashed border-muted/30"><Plus className="w-3 h-3" />Add item</button>}
              </>}
            </div>
          )
        })}

        <div className={`grid ${COL} gap-2 items-center px-6 md:px-8 py-3 border-t-2 bg-muted/20`}>
          <span className="font-semibold text-sm">Grand Total</span><span /><span /><span />
          <span className="text-right font-mono text-sm font-bold">{aed(grandTotal)}</span><span />
        </div>

        {((boq.assumptions?.length ?? 0) > 0 || (boq.exclusions?.length ?? 0) > 0) && (
          <div className="px-6 md:px-8 py-4 space-y-3 border-t">
            {boq.assumptions?.length > 0 && <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Assumptions</p><ul className="text-xs text-muted-foreground space-y-0.5">{boq.assumptions.map((a, i) => <li key={i}>&bull; {a}</li>)}</ul></div>}
            {boq.exclusions?.length > 0 && <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Exclusions</p><ul className="text-xs text-muted-foreground space-y-0.5">{boq.exclusions.map((e, i) => <li key={i}>&bull; {e}</li>)}</ul></div>}
          </div>
        )}
      </div>

      {/* ── Edit Item Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Line Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-xs text-muted-foreground mb-1 block">Description</label><Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="text-sm" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-muted-foreground mb-1 block">Quantity</label><Input value={editQty} onChange={(e) => setEditQty(e.target.value)} className="text-sm font-mono" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Unit</label><Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="text-sm" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Rate (AED)</label><Input value={editRate} onChange={(e) => setEditRate(e.target.value)} className="text-sm font-mono" /></div>
            </div>
            <div className="p-3 bg-muted/30 rounded-md"><p className="text-xs text-muted-foreground">Subtotal: <span className="font-mono font-medium text-foreground">{aed((parseFloat(editQty) || 0) * (parseFloat(editRate) || 0))}</span></p></div>

            {/* Price history */}
            {editHistory.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Price history from similar items</label>
                <div className="border rounded-md divide-y max-h-40 overflow-auto">
                  {editHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setEditRate(h.unit_rate_aed?.toString() ?? '')}>
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="truncate">{h.description}</p>
                        <p className="text-muted-foreground text-[11px]">{h.historical_projects?.project_name ?? '-'}</p>
                      </div>
                      <span className="font-mono shrink-0">{aed(h.unit_rate_aed)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Click a price to use it</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={saveEditItem} className="cursor-pointer">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add from Price Book Dialog ── */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setAddDetailItem(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{addDetailItem ? 'Item Details' : 'Add Item from Price Book'}</DialogTitle></DialogHeader>

          {!addDetailItem ? (
            /* ── Browse / search view ── */
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search items..." value={addSearch} onChange={(e) => setAddSearch(e.target.value)} className="pl-9 text-sm" autoFocus />
                </div>
                <select
                  value={addCategoryFilter}
                  onChange={(e) => setAddCategoryFilter(e.target.value)}
                  className="text-xs bg-background border rounded-md px-2 cursor-pointer"
                >
                  <option value="all">All categories</option>
                  {pbCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="border rounded-md max-h-72 overflow-auto divide-y">
                {pbLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                : filteredPB.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">No matching items</div>
                : filteredPB.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => showAddDetail(item)}>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm truncate">{item.description}</p>
                      <p className="text-[11px] text-muted-foreground">{item.scope_item_id ?? '-'} &middot; {item.historical_projects?.project_name ?? '-'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono">{aed(item.unit_rate_aed)}</p>
                      <p className="text-[11px] text-muted-foreground">{item.unit ?? '-'}</p>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={addBlankItem} className="cursor-pointer text-xs">Add blank item instead</Button>
              </DialogFooter>
            </>
          ) : (
            /* ── Item detail view ── */
            <>
              <div className="space-y-4">
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-sm font-medium">{addDetailItem.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{addDetailItem.historical_projects?.project_name ?? '-'} &middot; {addDetailItem.unit ?? '-'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground mb-1 block">Quantity</label><Input value={addDetailQty} onChange={(e) => setAddDetailQty(e.target.value)} className="text-sm font-mono" /></div>
                  <div><label className="text-xs text-muted-foreground mb-1 block">Rate (AED)</label><Input value={addDetailRate} onChange={(e) => setAddDetailRate(e.target.value)} className="text-sm font-mono" /></div>
                </div>

                <div className="p-3 bg-muted/30 rounded-md"><p className="text-xs text-muted-foreground">Subtotal: <span className="font-mono font-medium text-foreground">{aed((parseFloat(addDetailQty) || 0) * (parseFloat(addDetailRate) || 0))}</span></p></div>

                {/* Price history for this item */}
                {addDetailHistory.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Prices from other projects (click to use)</label>
                    <div className="border rounded-md divide-y max-h-36 overflow-auto">
                      {addDetailHistory.map((h, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setAddDetailRate(h.unit_rate_aed?.toString() ?? '')}>
                          <span className="truncate flex-1 mr-2 text-muted-foreground">{h.historical_projects?.project_name ?? '-'}</span>
                          <span className="font-mono shrink-0">{aed(h.unit_rate_aed)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDetailItem(null)} className="cursor-pointer">Back</Button>
                <Button onClick={confirmAddItem} className="cursor-pointer">Add to BOQ</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Rename Category Dialog ── */}
      <Dialog open={renameCatOpen} onOpenChange={setRenameCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename Category</DialogTitle></DialogHeader>
          <Input value={renameCatValue} onChange={(e) => setRenameCatValue(e.target.value)} className="text-sm" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveRenameCat() }} />
          <DialogFooter><Button variant="outline" onClick={() => setRenameCatOpen(false)} className="cursor-pointer">Cancel</Button><Button onClick={saveRenameCat} className="cursor-pointer">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lock Dialog ── */}
      <Dialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Lock this BOQ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Once locked, this BOQ cannot be edited. Its pricing data will be added to the historical Price Book.</p>
          <DialogFooter><Button variant="outline" onClick={() => setLockConfirmOpen(false)} className="cursor-pointer">Cancel</Button><Button onClick={handleLock} disabled={locking} className="cursor-pointer">{locking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lock BOQ'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
