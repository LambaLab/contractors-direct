'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Pencil, Check, X, Plus, Search, LayoutGrid, List, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'

type PricingStat = {
  scope_item_id: string
  unit: string | null
  sample_count: number
  rate_min: number
  rate_max: number
  rate_avg: number
  rate_p25: number
  rate_median: number
  rate_p75: number
}

type PricingOverride = {
  id: string
  scope_item_id: string | null
  item_description: string
  unit: string
  override_min_aed: number
  override_max_aed: number
  notes: string | null
  updated_at: string
}

type SampleItem = {
  scope_item_id: string | null
  description: string
  unit: string | null
  unit_rate_aed: number | null
  historical_projects: { project_name: string } | null
}

type ViewMode = 'category' | 'flat'

function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function totalSamples(stats: PricingStat[]): number {
  return stats.reduce((sum, s) => sum + s.sample_count, 0)
}

function groupByCategory(stats: PricingStat[], sampleItems: SampleItem[]) {
  const groups = new Map<string, {
    scopeId: string
    categoryName: string
    stats: PricingStat[]
    samples: SampleItem[]
  }>()

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

// Column layout used everywhere (collapsed + expanded)
const COL_GRID = 'grid-cols-[1fr_100px_140px_50px_36px]'

export default function PriceBookPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PricingStat[]>([])
  const [overrides, setOverrides] = useState<PricingOverride[]>([])
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Per-item editing state
  const [editingKey, setEditingKey] = useState<string | null>(null) // "scopeId:idx" or "new:scopeId"
  const [editRate, setEditRate] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [saving, setSaving] = useState(false)

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

  const handleSaveItemOverride = async (scopeItemId: string, description: string, unit: string, rate: number) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/price-book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_description: description,
          unit,
          scope_item_id: scopeItemId,
          override_min_aed: rate,
          override_max_aed: rate,
          notes: null,
        }),
      })
      if (res.ok) {
        await fetchData()
        setEditingKey(null)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const startEditItem = (key: string, description: string, unit: string, rate: number | null) => {
    setEditingKey(key)
    setEditRate(rate?.toString() ?? '')
    setEditDesc(description)
    setEditUnit(unit)
  }

  const startAddItem = (scopeId: string) => {
    setEditingKey(`new:${scopeId}`)
    setEditDesc('')
    setEditRate('')
    setEditUnit('')
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditRate('')
    setEditDesc('')
    setEditUnit('')
  }

  const submitEdit = (scopeId: string) => {
    const rate = parseFloat(editRate)
    if (isNaN(rate) || rate < 0 || !editDesc.trim()) return
    handleSaveItemOverride(scopeId, editDesc.trim(), editUnit || 'unit', rate)
  }

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
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-white dark:bg-background">
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
            title="Category view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`p-1.5 rounded cursor-pointer transition-colors ${viewMode === 'flat' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Flat list"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs text-muted-foreground">
          {projectCount} projects &middot; {overrides.length} overrides
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-background">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-muted-foreground">No historical pricing data yet.</p>
            <p className="text-xs text-muted-foreground">Import historical BOQs to populate the Price Book.</p>
          </div>
        ) : viewMode === 'category' ? (
          /* ── Category View ── */
          <div>
            {/* Column headers */}
            <div className={`grid ${COL_GRID} gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10`}>
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
                  {/* Category header row */}
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

                  {/* Expanded: line items */}
                  {isOpen && (
                    <div className="border-b">
                      {group.samples.map((sample, idx) => {
                        const itemKey = `${group.scopeId}:${idx}`
                        const isEditing = editingKey === itemKey
                        const override = getOverrideForItem(sample.description, sample.unit ?? '')
                        const displayRate = override ? override.override_min_aed : sample.unit_rate_aed

                        if (isEditing) {
                          return (
                            <div key={idx} className={`grid ${COL_GRID} gap-3 items-center pl-12 pr-6 py-1.5 bg-purple-500/5 border-b border-dashed border-muted/30`}>
                              <span className="text-sm truncate text-muted-foreground">{sample.description}</span>
                              <Input
                                type="number"
                                value={editRate}
                                onChange={(e) => setEditRate(e.target.value)}
                                className="h-7 text-xs font-mono text-right"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') submitEdit(group.scopeId)
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                              />
                              <span className="text-right text-xs text-muted-foreground truncate">
                                {sample.historical_projects?.project_name ?? '-'}
                              </span>
                              <span className="text-right text-xs text-muted-foreground">{sample.unit ?? '-'}</span>
                              <div className="flex items-center gap-0.5 justify-end">
                                <button onClick={() => submitEdit(group.scopeId)} className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer" disabled={saving}>
                                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={cancelEdit} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={idx}
                            className={`grid ${COL_GRID} gap-3 items-center pl-12 pr-6 py-2 border-b border-dashed border-muted/30 hover:bg-muted/10 transition-colors group`}
                          >
                            <span className="text-sm truncate text-muted-foreground" title={sample.description}>{sample.description}</span>
                            <span className={`text-right font-mono text-xs ${override ? 'text-purple-400 font-medium' : ''}`}>
                              {fmt(displayRate)}
                            </span>
                            <span className="text-right text-xs text-muted-foreground truncate" title={sample.historical_projects?.project_name ?? ''}>
                              {sample.historical_projects?.project_name ?? '-'}
                            </span>
                            <span className="text-right text-xs text-muted-foreground">{sample.unit ?? '-'}</span>
                            <div className="flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEditItem(itemKey, sample.description, sample.unit ?? '', displayRate)
                                }}
                                className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-pointer transition-opacity"
                                title="Edit rate"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {/* Add new item row */}
                      {editingKey === `new:${group.scopeId}` ? (
                        <div className={`grid ${COL_GRID} gap-3 items-center pl-12 pr-6 py-1.5 bg-purple-500/5 border-b border-dashed border-muted/30`}>
                          <Input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Item description..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                          <Input
                            type="number"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            placeholder="Rate"
                            className="h-7 text-xs font-mono text-right"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') submitEdit(group.scopeId)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <div />
                          <Input
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            placeholder="sqm"
                            className="h-7 text-xs text-right"
                          />
                          <div className="flex items-center gap-0.5 justify-end">
                            <button onClick={() => submitEdit(group.scopeId)} className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer" disabled={saving}>
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startAddItem(group.scopeId)}
                          className="flex items-center gap-1.5 pl-12 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-b border-dashed border-muted/30 w-full"
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
          /* ── Flat View ── */
          <div>
            {/* Column headers */}
            <div className={`grid ${COL_GRID} gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10`}>
              <span>Item</span>
              <span className="text-right">Avg Rate (AED)</span>
              <span className="text-right">Range (P25-P75)</span>
              <span className="text-right">Unit</span>
              <span></span>
            </div>

            {stats
              .filter(s => {
                if (!searchQuery) return true
                const scopeItem = SCOPE_CATALOG.find(sc => sc.id === s.scope_item_id)
                return (
                  (scopeItem?.name ?? s.scope_item_id).toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.scope_item_id.toLowerCase().includes(searchQuery.toLowerCase())
                )
              })
              .sort((a, b) => a.scope_item_id.localeCompare(b.scope_item_id))
              .map(stat => {
                const scopeItem = SCOPE_CATALOG.find(s => s.id === stat.scope_item_id)

                return (
                  <div
                    key={`${stat.scope_item_id}:${stat.unit}`}
                    className={`grid ${COL_GRID} gap-3 items-center px-6 py-2.5 hover:bg-muted/20 border-b transition-colors`}
                  >
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{scopeItem?.name ?? stat.scope_item_id}</span>
                      <span className="text-[11px] text-muted-foreground">{stat.sample_count} data points</span>
                    </div>
                    <span className="text-xs text-right font-mono">{fmt(stat.rate_avg)}</span>
                    <span className="text-xs text-right font-mono text-muted-foreground">
                      {fmt(stat.rate_p25)} - {fmt(stat.rate_p75)}
                    </span>
                    <span className="text-xs text-right text-muted-foreground">{stat.unit ?? '-'}</span>
                    <div />
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
