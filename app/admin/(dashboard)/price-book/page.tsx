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

/** Format number with commas: 15480 -> "15,480" */
function fmt(n: number | null | undefined): string {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Format range: "1,466 - 3,292" */
function fmtRange(min: number, max: number): string {
  return `${fmt(min)} - ${fmt(max)}`
}

/** Total sample count across all stats in a group */
function totalSamples(stats: PricingStat[]): number {
  return stats.reduce((sum, s) => sum + s.sample_count, 0)
}

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
          {projectCount} projects &middot; {stats.length} items &middot; {overrides.length} overrides
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
            <div className="grid grid-cols-[1fr_100px_80px_40px] gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10">
              <span>Category</span>
              <span className="text-right">Avg Rate (AED)</span>
              <span className="text-right">Data Points</span>
              <span></span>
            </div>

            {filteredCategories.map(group => {
              const isOpen = expandedCategories.has(group.scopeId)
              const override = getOverrideForScope(group.scopeId)
              const total = totalSamples(group.stats)
              // Compute weighted average across all unit types
              const weightedAvg = group.stats.reduce((sum, s) => sum + s.rate_avg * s.sample_count, 0) / (total || 1)

              return (
                <div key={group.scopeId}>
                  {/* Category header row */}
                  <div
                    className="grid grid-cols-[1fr_100px_80px_40px] gap-3 items-center px-6 py-3 hover:bg-muted/30 cursor-pointer border-b transition-colors"
                    onClick={() => toggleCategory(group.scopeId)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                      }
                      <span className="font-semibold text-sm">{group.categoryName}</span>
                      {override && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">Override</span>
                      )}
                    </div>
                    <span className="text-xs text-right font-mono">
                      {fmt(weightedAvg)}
                    </span>
                    <span className="text-xs text-right text-muted-foreground">
                      {total} from {group.stats.length} units
                    </span>
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(group.scopeId, override) }}
                        className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Set price override"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: show sample items and edit form */}
                  {isOpen && (
                    <div className="border-b bg-zinc-50/30 dark:bg-zinc-900/20">
                      {/* Column headers for expanded section */}
                      <div className="grid grid-cols-[1fr_120px_160px_60px] gap-3 pl-12 pr-6 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70 border-b border-dashed">
                        <span>Description</span>
                        <span className="text-right">Rate (AED)</span>
                        <span className="text-right">Project</span>
                        <span className="text-right">Unit</span>
                      </div>

                      {/* Sample line items from historical data */}
                      {group.samples.slice(0, 12).map((sample, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_120px_160px_60px] gap-3 items-center pl-12 pr-6 py-2 border-b border-dashed border-muted/30 text-sm"
                        >
                          <span className="truncate text-muted-foreground">{sample.description}</span>
                          <span className="text-right font-mono text-xs">
                            {fmt(sample.unit_rate_aed)}
                          </span>
                          <span className="text-right text-xs text-muted-foreground truncate">
                            {sample.historical_projects?.project_name ?? '-'}
                          </span>
                          <span className="text-right text-xs text-muted-foreground">{sample.unit ?? '-'}</span>
                        </div>
                      ))}

                      {group.samples.length > 12 && (
                        <div className="pl-12 pr-6 py-1.5 text-xs text-muted-foreground">
                          +{group.samples.length - 12} more items
                        </div>
                      )}

                      {/* Edit override form */}
                      {editingItem === group.scopeId && (
                        <EditOverrideForm
                          stats={group.stats}
                          override={override}
                          editMin={editMin}
                          editMax={editMax}
                          editNotes={editNotes}
                          saving={saving}
                          onMinChange={setEditMin}
                          onMaxChange={setEditMax}
                          onNotesChange={setEditNotes}
                          onSave={() => handleSaveOverride(group.scopeId, group.categoryName, group.stats[0]?.unit ?? 'unit')}
                          onClear={override ? () => handleClearOverride(override.id) : undefined}
                          onCancel={() => setEditingItem(null)}
                        />
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
            <div className="grid grid-cols-[1fr_60px_120px_120px_80px_40px] gap-3 px-6 py-2 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 border-b bg-zinc-50/50 dark:bg-zinc-900/30 sticky top-0 z-10">
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
                  <div className="grid grid-cols-[1fr_60px_120px_120px_80px_40px] gap-3 items-center px-6 py-2.5 hover:bg-muted/20 border-b transition-colors">
                    <span className="text-sm truncate">{scopeItem?.name ?? stat.scope_item_id}</span>
                    <span className="text-xs text-right text-muted-foreground">{stat.unit ?? '-'}</span>
                    <span className="text-xs text-right font-mono">
                      {fmtRange(stat.rate_p25, stat.rate_p75)}
                    </span>
                    <span className={`text-xs text-right font-mono ${override ? 'text-purple-400 font-medium' : 'text-muted-foreground'}`}>
                      {override ? fmtRange(override.override_min_aed, override.override_max_aed) : '-'}
                    </span>
                    <span className="text-xs text-right text-muted-foreground">{stat.sample_count} proj</span>
                    <div className="flex justify-end">
                      <button
                        onClick={() => startEdit(key, override)}
                        className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Set price override"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingItem === key && (
                    <EditOverrideForm
                      stats={[stat]}
                      override={override}
                      editMin={editMin}
                      editMax={editMax}
                      editNotes={editNotes}
                      saving={saving}
                      onMinChange={setEditMin}
                      onMaxChange={setEditMax}
                      onNotesChange={setEditNotes}
                      onSave={() => handleSaveOverride(stat.scope_item_id, scopeItem?.name ?? stat.scope_item_id, stat.unit ?? 'unit')}
                      onClear={override ? () => handleClearOverride(override.id) : undefined}
                      onCancel={() => setEditingItem(null)}
                    />
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

/** Reusable override editor form */
function EditOverrideForm({ stats, override, editMin, editMax, editNotes, saving, onMinChange, onMaxChange, onNotesChange, onSave, onClear, onCancel }: {
  stats: PricingStat[]
  override?: PricingOverride
  editMin: string
  editMax: string
  editNotes: string
  saving: boolean
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  onNotesChange: (v: string) => void
  onSave: () => void
  onClear?: () => void
  onCancel: () => void
}) {
  const primaryStat = stats[0]
  const unit = primaryStat?.unit ?? 'unit'

  return (
    <div className="px-6 pl-12 py-4 bg-purple-500/5 border-t border-purple-500/10">
      <div className="flex items-start gap-6 max-w-lg">
        <div className="flex-1 space-y-3">
          <div className="text-xs text-muted-foreground">
            Historical: {primaryStat ? `${fmt(primaryStat.rate_p25)} - ${fmt(primaryStat.rate_p75)} AED/${unit}` : 'No data'} ({primaryStat?.sample_count ?? 0} data points)
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-16 shrink-0">Min Rate</label>
            <Input
              type="number"
              value={editMin}
              onChange={(e) => onMinChange(e.target.value)}
              placeholder="0"
              className="h-8 w-28 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground shrink-0">AED/{unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-16 shrink-0">Max Rate</label>
            <Input
              type="number"
              value={editMax}
              onChange={(e) => onMaxChange(e.target.value)}
              placeholder="0"
              className="h-8 w-28 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground shrink-0">AED/{unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-16 shrink-0">Notes</label>
            <Input
              value={editNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="e.g., Prices increased Q1 2026"
              className="h-8 text-sm flex-1"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-5">
          <Button size="sm" onClick={onSave} disabled={saving} className="text-xs cursor-pointer">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
          </Button>
          {onClear && (
            <Button size="sm" variant="ghost" onClick={onClear} disabled={saving} className="text-xs cursor-pointer text-destructive">
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs cursor-pointer">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
