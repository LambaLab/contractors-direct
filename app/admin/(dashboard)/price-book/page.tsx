'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Pencil, X, Search, LayoutGrid, List, Loader2 } from 'lucide-react'
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

// Group items by scope category for category view
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

export default function PriceBookPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PricingStat[]>([])
  const [overrides, setOverrides] = useState<PricingOverride[]>([])
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editMin, setEditMin] = useState('')
  const [editMax, setEditMax] = useState('')
  const [editNotes, setEditNotes] = useState('')
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

  const handleSaveOverride = async (scopeItemId: string, description: string, unit: string) => {
    const min = parseFloat(editMin)
    const max = parseFloat(editMax)
    if (isNaN(min) || isNaN(max) || min < 0 || max < 0 || min > max) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/price-book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_description: description,
          unit,
          scope_item_id: scopeItemId,
          override_min_aed: min,
          override_max_aed: max,
          notes: editNotes || null,
        }),
      })
      if (res.ok) {
        await fetchData()
        setEditingItem(null)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleClearOverride = async (overrideId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/price-book', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: overrideId }),
      })
      if (res.ok) {
        await fetchData()
        setEditingItem(null)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const startEdit = (key: string, existingOverride?: PricingOverride) => {
    setEditingItem(key)
    setEditMin(existingOverride?.override_min_aed?.toString() ?? '')
    setEditMax(existingOverride?.override_max_aed?.toString() ?? '')
    setEditNotes(existingOverride?.notes ?? '')
  }

  const toggleCategory = (scopeId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(scopeId)) next.delete(scopeId)
      else next.add(scopeId)
      return next
    })
  }

  const getOverrideForScope = (scopeId: string): PricingOverride | undefined => {
    return overrides.find(o => o.scope_item_id === scopeId)
  }

  const categories = groupByCategory(stats, sampleItems)
  const filteredCategories = searchQuery
    ? categories.filter(c =>
        c.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.samples.some(s => s.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : categories

  // Flat view: all stats as rows
  const flatRows = stats
    .filter(s => {
      if (!searchQuery) return true
      const scopeItem = SCOPE_CATALOG.find(sc => sc.id === s.scope_item_id)
      return (
        (scopeItem?.name ?? s.scope_item_id).toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.scope_item_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })
    .sort((a, b) => a.scope_item_id.localeCompare(b.scope_item_id))

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
            {stats.length} items &middot; {overrides.length} overrides
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
              {filteredCategories.map(group => {
                const isOpen = expandedCategories.has(group.scopeId)
                const override = getOverrideForScope(group.scopeId)
                const primaryStat = group.stats[0]

                return (
                  <div key={group.scopeId}>
                    {/* Category header */}
                    <div
                      className="grid grid-cols-[1fr_120px_120px_120px_80px_60px] gap-2 items-center px-6 py-3 hover:bg-muted/30 cursor-pointer border-b transition-colors"
                      onClick={() => toggleCategory(group.scopeId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        }
                        <span className="font-semibold text-sm">{group.categoryName}</span>
                        <span className="text-xs text-muted-foreground">({group.stats.length} unit types)</span>
                      </div>
                      <span className="text-xs text-muted-foreground text-right">{primaryStat?.unit ?? '-'}</span>
                      <span className="text-xs text-right font-mono">
                        {primaryStat ? `${primaryStat.rate_p25.toFixed(0)}-${primaryStat.rate_p75.toFixed(0)}` : '-'}
                      </span>
                      <span className={`text-xs text-right font-mono ${override ? 'text-purple-600 font-medium' : 'text-muted-foreground'}`}>
                        {override ? `${override.override_min_aed}-${override.override_max_aed}` : '(auto)'}
                      </span>
                      <span className="text-xs text-right text-muted-foreground">
                        {primaryStat?.sample_count ?? 0} proj
                      </span>
                      <div className="flex justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(group.scopeId, override) }}
                          className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title="Edit override"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: show sample items and edit form */}
                    {isOpen && (
                      <div className="border-b">
                        {/* Column headers for expanded section */}
                        <div className="grid grid-cols-[1fr_80px_100px_80px] gap-2 pl-12 pr-6 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70 bg-zinc-50/50 dark:bg-zinc-900/30">
                          <span>Description</span>
                          <span className="text-right">Rate (AED)</span>
                          <span className="text-right">Project</span>
                          <span className="text-right">Unit</span>
                        </div>

                        {/* Sample line items from historical data */}
                        {group.samples.slice(0, 8).map((sample, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-[1fr_80px_100px_80px] gap-2 items-center pl-12 pr-6 py-2 border-b border-dashed text-sm"
                          >
                            <span className="truncate text-muted-foreground">{sample.description}</span>
                            <span className="text-right font-mono text-xs">
                              {sample.unit_rate_aed?.toFixed(0) ?? '-'}
                            </span>
                            <span className="text-right text-xs text-muted-foreground truncate">
                              {sample.historical_projects?.project_name ?? '-'}
                            </span>
                            <span className="text-right text-xs text-muted-foreground">{sample.unit ?? '-'}</span>
                          </div>
                        ))}

                        {group.samples.length > 8 && (
                          <div className="pl-12 pr-6 py-1.5 text-xs text-muted-foreground">
                            +{group.samples.length - 8} more items
                          </div>
                        )}

                        {/* Edit override form */}
                        {editingItem === group.scopeId && (
                          <div className="pl-12 pr-6 py-4 bg-purple-50/50 dark:bg-purple-500/5 border-t">
                            <div className="flex items-start gap-4 max-w-xl">
                              <div className="flex-1 space-y-3">
                                <div className="text-xs text-muted-foreground">
                                  Historical: {primaryStat ? `${primaryStat.rate_p25.toFixed(0)}-${primaryStat.rate_p75.toFixed(0)} AED/${primaryStat.unit ?? 'unit'}` : 'No data'} ({primaryStat?.sample_count ?? 0} projects)
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-muted-foreground w-16">Min Rate</label>
                                  <Input
                                    type="number"
                                    value={editMin}
                                    onChange={(e) => setEditMin(e.target.value)}
                                    placeholder="0"
                                    className="h-8 w-28 text-sm font-mono"
                                  />
                                  <span className="text-xs text-muted-foreground">AED/{primaryStat?.unit ?? 'unit'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-muted-foreground w-16">Max Rate</label>
                                  <Input
                                    type="number"
                                    value={editMax}
                                    onChange={(e) => setEditMax(e.target.value)}
                                    placeholder="0"
                                    className="h-8 w-28 text-sm font-mono"
                                  />
                                  <span className="text-xs text-muted-foreground">AED/{primaryStat?.unit ?? 'unit'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-muted-foreground w-16">Notes</label>
                                  <Input
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="e.g., Prices increased Q1 2026"
                                    className="h-8 text-sm flex-1"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 pt-5">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveOverride(group.scopeId, group.categoryName, primaryStat?.unit ?? 'unit')}
                                  disabled={saving}
                                  className="text-xs cursor-pointer"
                                >
                                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                </Button>
                                {override && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleClearOverride(override.id)}
                                    disabled={saving}
                                    className="text-xs cursor-pointer text-destructive"
                                  >
                                    Clear
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingItem(null)}
                                  className="text-xs cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
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
              <div className="grid grid-cols-[1fr_80px_120px_120px_80px_60px] gap-2 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10">
                <span>Item</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Historical Range</span>
                <span className="text-right">CD Rate</span>
                <span className="text-right">Sources</span>
                <span></span>
              </div>

              {flatRows.map(stat => {
                const scopeItem = SCOPE_CATALOG.find(s => s.id === stat.scope_item_id)
                const override = getOverrideForScope(stat.scope_item_id)
                const key = `${stat.scope_item_id}:${stat.unit}`

                return (
                  <div key={key}>
                    <div className="grid grid-cols-[1fr_80px_120px_120px_80px_60px] gap-2 items-center px-6 py-2.5 hover:bg-muted/20 border-b transition-colors">
                      <span className="text-sm truncate">{scopeItem?.name ?? stat.scope_item_id}</span>
                      <span className="text-xs text-right text-muted-foreground">{stat.unit ?? '-'}</span>
                      <span className="text-xs text-right font-mono">
                        {stat.rate_p25.toFixed(0)}-{stat.rate_p75.toFixed(0)} AED
                      </span>
                      <span className={`text-xs text-right font-mono ${override ? 'text-purple-600 font-medium' : 'text-muted-foreground'}`}>
                        {override ? `${override.override_min_aed}-${override.override_max_aed} AED` : '(auto)'}
                      </span>
                      <span className="text-xs text-right text-muted-foreground">{stat.sample_count} proj</span>
                      <div className="flex justify-end">
                        <button
                          onClick={() => startEdit(key, override)}
                          className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title="Edit override"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline edit form */}
                    {editingItem === key && (
                      <div className="px-6 py-4 bg-purple-50/50 dark:bg-purple-500/5 border-b">
                        <div className="flex items-start gap-4 max-w-xl">
                          <div className="flex-1 space-y-3">
                            <div className="text-xs text-muted-foreground">
                              Historical: {stat.rate_p25.toFixed(0)}-{stat.rate_p75.toFixed(0)} AED/{stat.unit ?? 'unit'} ({stat.sample_count} projects)
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Min Rate</label>
                              <Input
                                type="number"
                                value={editMin}
                                onChange={(e) => setEditMin(e.target.value)}
                                placeholder="0"
                                className="h-8 w-28 text-sm font-mono"
                              />
                              <span className="text-xs text-muted-foreground">AED/{stat.unit ?? 'unit'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Max Rate</label>
                              <Input
                                type="number"
                                value={editMax}
                                onChange={(e) => setEditMax(e.target.value)}
                                placeholder="0"
                                className="h-8 w-28 text-sm font-mono"
                              />
                              <span className="text-xs text-muted-foreground">AED/{stat.unit ?? 'unit'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-16">Notes</label>
                              <Input
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="e.g., Prices increased Q1 2026"
                                className="h-8 text-sm flex-1"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 pt-5">
                            <Button
                              size="sm"
                              onClick={() => handleSaveOverride(stat.scope_item_id, scopeItem?.name ?? stat.scope_item_id, stat.unit ?? 'unit')}
                              disabled={saving}
                              className="text-xs cursor-pointer"
                            >
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                            </Button>
                            {override && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleClearOverride(override.id)}
                                disabled={saving}
                                className="text-xs cursor-pointer text-destructive"
                              >
                                Clear
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingItem(null)}
                              className="text-xs cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
  )
}
