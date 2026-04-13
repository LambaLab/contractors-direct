'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Pencil, Plus, Search, LayoutGrid, List, Loader2, Upload, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'

// ── Types ──

type SampleItem = {
  scope_item_id: string | null
  description: string
  unit: string | null
  unit_rate_aed: number | null
  historical_projects: { project_name: string } | null
}

type PricingOverride = {
  id: string
  scope_item_id: string | null
  item_description: string
  unit: string
  override_min_aed: number
  override_max_aed: number
  notes: string | null
}

type PricingStat = {
  scope_item_id: string
  unit: string | null
  sample_count: number
  rate_avg: number
  rate_p25: number
  rate_p75: number
}

type CategoryGroup = {
  scopeId: string
  categoryName: string
  stats: PricingStat[]
  samples: SampleItem[]
}

// ── Unit conversion ──

const SQFT_PER_SQM = 10.764
const SQM_UNITS = new Set(['sqm', 'sq m', 'm2', 'm²'])
const SQFT_UNITS = new Set(['sqft', 'sq ft', 'sft'])

function isAreaUnit(unit: string | null): boolean {
  if (!unit) return false
  const u = unit.toLowerCase()
  return SQM_UNITS.has(u) || SQFT_UNITS.has(u)
}

function convertRate(rate: number | null | undefined, fromUnit: string | null, toUnit: 'sqft' | 'sqm'): number | null {
  if (rate == null) return null
  if (!fromUnit) return rate
  const from = fromUnit.toLowerCase()
  const fromIsSqm = SQM_UNITS.has(from)
  const fromIsSqft = SQFT_UNITS.has(from)
  if (!fromIsSqm && !fromIsSqft) return rate
  if (toUnit === 'sqft' && fromIsSqm) return rate * SQFT_PER_SQM
  if (toUnit === 'sqm' && fromIsSqft) return rate / SQFT_PER_SQM
  return rate
}

function unconvertRate(rate: number, displayUnit: 'sqft' | 'sqm', originalUnit: string): number {
  const from = originalUnit.toLowerCase()
  const fromIsSqm = SQM_UNITS.has(from)
  const fromIsSqft = SQFT_UNITS.has(from)
  if (!fromIsSqm && !fromIsSqft) return rate
  if (displayUnit === 'sqft' && fromIsSqm) return rate / SQFT_PER_SQM
  if (displayUnit === 'sqm' && fromIsSqft) return rate * SQFT_PER_SQM
  return rate
}

function unitLabel(originalUnit: string | null, toUnit: 'sqft' | 'sqm'): string {
  if (!originalUnit) return '-'
  if (isAreaUnit(originalUnit)) return toUnit
  return originalUnit
}

// ── Helpers ──

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function totalSamples(stats: PricingStat[]): number {
  return stats.reduce((sum, s) => sum + s.sample_count, 0)
}

function groupByCategory(stats: PricingStat[], sampleItems: SampleItem[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>()
  for (const stat of stats) {
    const scopeItem = SCOPE_CATALOG.find(s => s.id === stat.scope_item_id)
    const key = stat.scope_item_id
    const existing = groups.get(key)
    if (existing) {
      existing.stats.push(stat)
    } else {
      groups.set(key, {
        scopeId: key,
        categoryName: scopeItem?.name ?? key,
        stats: [stat],
        samples: sampleItems.filter(s => s.scope_item_id === key),
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName))
}

// Consistent column grid
const COL = 'grid-cols-[1fr_100px_140px_50px_36px]'

// ── Main Component ──

export default function PriceBookPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PricingStat[]>([])
  const [overrides, setOverrides] = useState<PricingOverride[]>([])
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [viewMode, setViewMode] = useState<'category' | 'flat'>('category')
  const [displayUnit, setDisplayUnit] = useState<'sqft' | 'sqm'>('sqft')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState<SampleItem | null>(null)
  const [editScopeId, setEditScopeId] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Add item state
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addDesc, setAddDesc] = useState('')
  const [addRate, setAddRate] = useState('')
  const [addUnit, setAddUnit] = useState('')

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [uploadResult, setUploadResult] = useState<{ extracted: any; summary: any } | null>(null)
  const [uploadFilename, setUploadFilename] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/price-book')
      if (res.ok) {
        const data = await res.json()
        setStats(data.summary)
        setOverrides(data.overrides)
        setSampleItems(data.sampleItems)
        setProjectCount(data.projectCount)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Edit handlers ──

  const openEditDialog = (item: SampleItem, scopeId: string) => {
    const override = overrides.find(o => o.item_description === item.description && o.unit === (item.unit ?? ''))
    const rawRate = override ? override.override_min_aed : item.unit_rate_aed
    const converted = convertRate(rawRate, item.unit, displayUnit)
    setEditItem(item)
    setEditScopeId(scopeId)
    setEditDesc(item.description)
    setEditRate(converted != null ? Math.round(converted).toString() : '')
    setEditUnit(unitLabel(item.unit, displayUnit))
    setEditNotes(override?.notes ?? '')
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    const displayRate = parseFloat(editRate)
    if (isNaN(displayRate) || displayRate < 0 || !editDesc.trim()) return
    // Convert the displayed rate back to the original stored unit
    const originalUnit = editItem?.unit ?? ''
    const storageRate = unconvertRate(displayRate, displayUnit, originalUnit)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/price-book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_description: editDesc.trim(),
          unit: originalUnit || 'unit',
          scope_item_id: editScopeId,
          override_min_aed: storageRate,
          override_max_aed: storageRate,
          notes: editNotes || null,
        }),
      })
      if (res.ok) {
        await fetchData()
        setEditOpen(false)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  // ── Add item handlers ──

  const handleAddItem = async (scopeId: string) => {
    const rate = parseFloat(addRate)
    if (isNaN(rate) || rate < 0 || !addDesc.trim()) return
    // Store in the display unit (new items are entered in whatever unit is shown)
    const storeUnit = addUnit || displayUnit
    setSaving(true)
    try {
      const res = await fetch('/api/admin/price-book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_description: addDesc.trim(),
          unit: storeUnit,
          scope_item_id: scopeId,
          override_min_aed: rate,
          override_max_aed: rate,
          notes: 'Manually added',
        }),
      })
      if (res.ok) {
        await fetchData()
        setAddingTo(null)
        setAddDesc('')
        setAddRate('')
        setAddUnit('')
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  // ── Upload handlers ──
  // Upload runs in the background. Closing the modal does NOT cancel it.
  // A toast-style banner shows progress and re-opens the review dialog when ready.

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFilename(file.name)
    setUploading(true)
    setUploadResult(null)
    setUploadOpen(true)

    const formData = new FormData()
    formData.append('file', file)
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Fire and forget - runs even if modal is closed
    fetch('/api/admin/price-book/upload', { method: 'POST', body: formData })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setUploadResult(data)
        } else {
          const err = await res.json().catch(() => ({ error: 'Failed to process PDF' }))
          setUploadResult({ extracted: null, summary: { error: err.error ?? 'Failed to process PDF' } })
        }
      })
      .catch(() => {
        setUploadResult({ extracted: null, summary: { error: 'Upload failed' } })
      })
      .finally(() => {
        setUploading(false)
        // Re-open the dialog to show results if user closed it
        setUploadOpen(true)
      })
  }

  const handleImport = async () => {
    if (!uploadResult?.extracted) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/price-book/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted: uploadResult.extracted, filename: uploadFilename }),
      })
      if (res.ok) {
        await fetchData()
        setUploadOpen(false)
        setUploadResult(null)
      }
    } catch { /* ignore */ }
    setImporting(false)
  }

  // ── Helpers ──

  const toggleCategory = (scopeId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(scopeId)) next.delete(scopeId)
      else next.add(scopeId)
      return next
    })
  }

  const getOverrideForItem = (desc: string, unit: string): PricingOverride | undefined => {
    return overrides.find(o => o.item_description === desc && o.unit === unit)
  }

  // Find similar items for history in the edit dialog
  const getHistoryForItem = (desc: string, unit: string): SampleItem[] => {
    const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3)
    if (words.length === 0) return []
    return sampleItems
      .filter(s =>
        s.description !== desc &&
        s.unit === unit &&
        words.some(w => s.description.toLowerCase().includes(w))
      )
      .slice(0, 6)
  }

  const categories = groupByCategory(stats, sampleItems)
  const filteredCategories = searchQuery
    ? categories.filter(c =>
        c.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.samples.some(s => s.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : categories

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            onClick={() => setViewMode('category')}
            className={`p-1.5 rounded cursor-pointer transition-colors ${viewMode === 'category' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`p-1.5 rounded cursor-pointer transition-colors ${viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            onClick={() => setDisplayUnit('sqft')}
            className={`px-2 py-1 rounded text-xs cursor-pointer transition-colors ${displayUnit === 'sqft' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            sqft
          </button>
          <button
            onClick={() => setDisplayUnit('sqm')}
            className={`px-2 py-1 rounded text-xs cursor-pointer transition-colors ${displayUnit === 'sqm' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            sqm
          </button>
        </div>

        <span className="text-xs text-muted-foreground">
          {projectCount} projects &middot; {overrides.length} overrides
        </span>

        <div className="ml-auto">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs cursor-pointer gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload BOQ
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-muted-foreground">No historical pricing data yet.</p>
            <p className="text-xs text-muted-foreground">Upload BOQ files to populate the Price Book.</p>
          </div>
        ) : viewMode === 'category' ? (
          <div>
            {/* Column headers - solid background */}
            <div className={`grid ${COL} gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-background sticky top-0 z-10`}>
              <span>Item</span>
              <span className="text-right">Rate (AED)</span>
              <span className="text-right">Source</span>
              <span className="text-right">Unit</span>
              <span></span>
            </div>

            {filteredCategories.map(group => {
              const isOpen = expandedCategories.has(group.scopeId)
              const total = totalSamples(group.stats)

              return (
                <div key={group.scopeId}>
                  {/* Category header */}
                  <div
                    className="flex items-center gap-2 px-6 py-3 hover:bg-muted/30 cursor-pointer border-b transition-colors"
                    onClick={() => toggleCategory(group.scopeId)}
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                    }
                    <span className="font-semibold text-sm">{group.categoryName}</span>
                    <span className="text-xs text-muted-foreground ml-1">{total} items</span>
                  </div>

                  {/* Expanded items */}
                  {isOpen && (
                    <div className="border-b">
                      {group.samples.map((sample, idx) => {
                        const override = getOverrideForItem(sample.description, sample.unit ?? '')
                        const rawRate = override ? override.override_min_aed : sample.unit_rate_aed
                        const displayRate = convertRate(rawRate, sample.unit, displayUnit)

                        return (
                          <div
                            key={idx}
                            className={`grid ${COL} gap-3 items-center pl-12 pr-6 py-2 border-b border-dashed border-muted/30 hover:bg-muted/10 transition-colors group cursor-pointer`}
                            onClick={() => openEditDialog(sample, group.scopeId)}
                          >
                            <span className="text-sm truncate text-muted-foreground" title={sample.description}>
                              {sample.description}
                            </span>
                            <span className={`text-right font-mono text-xs ${override ? 'text-purple-400 font-medium' : ''}`}>
                              {fmt(displayRate)}
                            </span>
                            <span className="text-right text-xs text-muted-foreground truncate" title={sample.historical_projects?.project_name ?? ''}>
                              {sample.historical_projects?.project_name ?? '-'}
                            </span>
                            <span className="text-right text-xs text-muted-foreground">{unitLabel(sample.unit, displayUnit)}</span>
                            <div className="flex justify-end">
                              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
                            </div>
                          </div>
                        )
                      })}

                      {/* Add item */}
                      {addingTo === group.scopeId ? (
                        <div className={`grid ${COL} gap-3 items-center pl-12 pr-6 py-1.5 bg-purple-500/5 border-b border-dashed border-muted/30`}>
                          <Input
                            value={addDesc}
                            onChange={(e) => setAddDesc(e.target.value)}
                            placeholder="Item description..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                          <Input
                            type="number"
                            value={addRate}
                            onChange={(e) => setAddRate(e.target.value)}
                            placeholder="Rate"
                            className="h-7 text-xs font-mono text-right"
                          />
                          <div />
                          <Input
                            value={addUnit}
                            onChange={(e) => setAddUnit(e.target.value)}
                            placeholder={displayUnit}
                            className="h-7 text-xs text-right"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddItem(group.scopeId)
                              if (e.key === 'Escape') setAddingTo(null)
                            }}
                          />
                          <div className="flex gap-0.5 justify-end">
                            <Button size="sm" onClick={() => handleAddItem(group.scopeId)} disabled={saving} className="h-7 text-[10px] px-2 cursor-pointer">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTo(group.scopeId)}
                          className="flex items-center gap-1.5 pl-12 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add item
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* Flat view */
          <div>
            <div className={`grid grid-cols-[1fr_80px_100px_100px_50px] gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-background sticky top-0 z-10`}>
              <span>Category</span>
              <span className="text-right">Avg Rate</span>
              <span className="text-right">Range</span>
              <span className="text-right">Data Points</span>
              <span className="text-right">Unit</span>
            </div>
            {stats
              .sort((a, b) => a.scope_item_id.localeCompare(b.scope_item_id))
              .filter(s => {
                if (!searchQuery) return true
                const name = SCOPE_CATALOG.find(sc => sc.id === s.scope_item_id)?.name ?? s.scope_item_id
                return name.toLowerCase().includes(searchQuery.toLowerCase())
              })
              .map(stat => (
                <div
                  key={`${stat.scope_item_id}:${stat.unit}`}
                  className="grid grid-cols-[1fr_80px_100px_100px_50px] gap-3 items-center px-6 py-2.5 hover:bg-muted/20 border-b transition-colors"
                >
                  <span className="text-sm truncate">{SCOPE_CATALOG.find(s => s.id === stat.scope_item_id)?.name ?? stat.scope_item_id}</span>
                  <span className="text-xs text-right font-mono">{fmt(convertRate(stat.rate_avg, stat.unit, displayUnit))}</span>
                  <span className="text-xs text-right font-mono text-muted-foreground">{fmt(convertRate(stat.rate_p25, stat.unit, displayUnit))} - {fmt(convertRate(stat.rate_p75, stat.unit, displayUnit))}</span>
                  <span className="text-xs text-right text-muted-foreground">{stat.sample_count}</span>
                  <span className="text-xs text-right text-muted-foreground">{unitLabel(stat.unit, displayUnit)}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* ── Background processing banner ── */}
      {uploading && !uploadOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-background border border-purple-500/30 rounded-lg px-4 py-3 shadow-lg cursor-pointer hover:border-purple-500/50 transition-colors"
          onClick={() => setUploadOpen(true)}
        >
          <Loader2 className="w-4 h-4 animate-spin text-purple-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Processing {uploadFilename}</p>
            <p className="text-xs text-muted-foreground">Click to view progress</p>
          </div>
        </div>
      )}

      {/* ── Edit Item Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rate (AED)</label>
                <Input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Source</label>
              <div className="text-sm text-muted-foreground px-3 py-2 bg-muted/30 rounded-md">
                {editItem?.historical_projects?.project_name ?? 'Unknown'}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes about this price" className="text-sm" />
            </div>

            {/* Price history */}
            {editItem && (() => {
              const history = getHistoryForItem(editItem.description, editItem.unit ?? '')
              if (history.length === 0) return null
              return (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Similar items from other projects</label>
                  <div className="border rounded-md divide-y max-h-36 overflow-auto">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="truncate text-muted-foreground flex-1 mr-2">{h.historical_projects?.project_name ?? '-'}</span>
                        <span className="font-mono shrink-0">{fmt(convertRate(h.unit_rate_aed, h.unit, displayUnit))} AED/{unitLabel(h.unit, displayUnit)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="cursor-pointer">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upload BOQ Dialog ── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {uploading ? 'Processing BOQ...' : uploadResult ? 'BOQ Extracted' : 'Upload BOQ'}
            </DialogTitle>
          </DialogHeader>

          {uploading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">Extracting pricing data from {uploadFilename}...</p>
              <p className="text-xs text-muted-foreground">This may take 1-2 minutes for large documents.</p>
              <button
                onClick={() => setUploadOpen(false)}
                className="mt-2 text-xs text-purple-400 hover:text-purple-300 cursor-pointer underline underline-offset-2"
              >
                Close and continue in background. We will notify you when it is ready.
              </button>
            </div>
          )}

          {!uploading && uploadResult && (
            <>
              {uploadResult.summary.error ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-destructive">{uploadResult.summary.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/30 rounded-md">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Project</p>
                      <p className="text-sm font-medium truncate">{uploadResult.summary.project_name}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-md">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Total</p>
                      <p className="text-sm font-medium font-mono">AED {fmt(uploadResult.summary.grand_total_aed)}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-md">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Categories</p>
                      <p className="text-sm font-medium">{uploadResult.summary.category_count}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-md">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Line Items</p>
                      <p className="text-sm font-medium">{uploadResult.summary.item_count}</p>
                    </div>
                  </div>

                  {/* Preview of categories */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Categories extracted:</p>
                    <div className="border rounded-md divide-y max-h-48 overflow-auto">
                      {(uploadResult.extracted.categories ?? []).map((cat: { name: string; line_items?: { is_subtotal?: boolean }[]; category_total_aed?: number }, i: number) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="truncate flex-1 mr-2">{cat.name}</span>
                          <span className="text-muted-foreground shrink-0">
                            {(cat.line_items ?? []).filter(li => !li.is_subtotal).length} items
                          </span>
                          <span className="font-mono ml-3 shrink-0">{fmt(cat.category_total_aed)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!uploading && uploadResult && !uploadResult.summary.error && (
            <DialogFooter>
              <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadResult(null) }} className="cursor-pointer">
                Discard
              </Button>
              <Button onClick={handleImport} disabled={importing} className="cursor-pointer">
                {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Import {uploadResult.summary.item_count} items
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
