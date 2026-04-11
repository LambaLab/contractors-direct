import { createServiceClient } from '@/lib/supabase/server'

/**
 * Pricing statistics for a scope item from historical data.
 */
export interface HistoricalPricingStat {
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

/**
 * CD team override for a specific item + unit.
 */
export interface PricingOverride {
  item_description: string
  unit: string
  scope_item_id: string | null
  override_min_aed: number
  override_max_aed: number
  notes: string | null
}

/**
 * Fetch pricing summary stats from the materialized view.
 * Returns aggregated historical pricing per scope_item_id + unit.
 */
export async function getPricingSummary(): Promise<HistoricalPricingStat[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pricing_summary' as 'historical_projects')
    .select('*')

  if (error || !data) return []
  return data as unknown as HistoricalPricingStat[]
}

/**
 * Fetch historical pricing for a specific scope item.
 */
export async function getHistoricalPricing(params: {
  scopeItemId: string
  unit?: string
}): Promise<HistoricalPricingStat | null> {
  const supabase = createServiceClient()

  let query = supabase
    .from('pricing_summary' as 'historical_projects')
    .select('*')
    .eq('scope_item_id', params.scopeItemId)

  if (params.unit) {
    query = query.eq('unit', params.unit.toLowerCase())
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) return null
  return data as unknown as HistoricalPricingStat
}

/**
 * Fetch all CD team pricing overrides.
 */
export async function getPricingOverrides(): Promise<PricingOverride[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pricing_overrides')
    .select('item_description, unit, scope_item_id, override_min_aed, override_max_aed, notes')

  if (error || !data) return []
  return data
}

/**
 * Get overrides indexed by scope_item_id for fast lookup.
 */
export async function getOverridesByScopeItem(): Promise<Map<string, PricingOverride[]>> {
  const overrides = await getPricingOverrides()
  const map = new Map<string, PricingOverride[]>()
  for (const o of overrides) {
    if (!o.scope_item_id) continue
    const existing = map.get(o.scope_item_id) ?? []
    existing.push(o)
    map.set(o.scope_item_id, existing)
  }
  return map
}

/**
 * Build a compact historical context string for injection into AI prompts.
 * Includes both historical stats and CD overrides where available.
 */
export async function getHistoricalContext(scopeIds: string[]): Promise<string> {
  const [summary, overrides] = await Promise.all([
    getPricingSummary(),
    getPricingOverrides(),
  ])

  if (summary.length === 0 && overrides.length === 0) return ''

  const relevantStats = summary.filter(s => scopeIds.includes(s.scope_item_id))
  const overrideMap = new Map<string, PricingOverride[]>()
  for (const o of overrides) {
    if (!o.scope_item_id) continue
    const existing = overrideMap.get(o.scope_item_id) ?? []
    existing.push(o)
    overrideMap.set(o.scope_item_id, existing)
  }

  const lines: string[] = [
    `HISTORICAL PRICING REFERENCE (from completed UAE fit-out projects):`,
    '',
  ]

  // Group by scope item
  const scopeGroups = new Map<string, HistoricalPricingStat[]>()
  for (const stat of relevantStats) {
    const existing = scopeGroups.get(stat.scope_item_id) ?? []
    existing.push(stat)
    scopeGroups.set(stat.scope_item_id, existing)
  }

  for (const scopeId of scopeIds) {
    const stats = scopeGroups.get(scopeId) ?? []
    const scopeOverrides = overrideMap.get(scopeId) ?? []

    if (stats.length === 0 && scopeOverrides.length === 0) continue

    lines.push(`${scopeId}:`)

    for (const stat of stats) {
      const unit = stat.unit ?? 'unit'
      lines.push(`  Historical: ${stat.rate_p25.toFixed(0)}-${stat.rate_p75.toFixed(0)} AED/${unit} (${stat.sample_count} projects, avg ${stat.rate_avg.toFixed(0)})`)
    }

    for (const o of scopeOverrides) {
      lines.push(`  CD Rate: ${o.override_min_aed}-${o.override_max_aed} AED/${o.unit}`)
    }

    lines.push('')
  }

  if (lines.length <= 2) return '' // only header, no actual data

  lines.push('Use CD Rates when available, otherwise use Historical ranges as reference.')
  lines.push('If deviating significantly, note the reason in assumptions.')

  return lines.join('\n')
}

/**
 * Fetch similar historical line items for a given description + unit.
 * Used by the admin historical reference panel.
 */
export async function findSimilarHistoricalItems(params: {
  description: string
  unit?: string
  scopeItemId?: string
  limit?: number
}): Promise<Array<{
  description: string
  quantity: number | null
  unit: string | null
  unit_rate_aed: number | null
  total_aed: number
  project_name: string
  project_location: string | null
}>> {
  const supabase = createServiceClient()
  const searchLimit = params.limit ?? 10

  // Build query joining line items with projects
  let query = supabase
    .from('historical_line_items')
    .select(`
      description,
      quantity,
      unit,
      unit_rate_aed,
      total_aed,
      historical_projects!historical_line_items_project_id_fkey (
        project_name,
        project_location
      )
    `)
    .eq('is_subtotal', false)
    .gt('unit_rate_aed', 0)

  if (params.scopeItemId) {
    query = query.eq('scope_item_id', params.scopeItemId)
  }

  if (params.unit) {
    query = query.eq('unit', params.unit.toLowerCase())
  }

  // Text search on normalized description
  if (params.description) {
    const searchTerms = params.description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .slice(0, 4)

    for (const term of searchTerms) {
      query = query.ilike('normalized_description', `%${term}%`)
    }
  }

  const { data, error } = await query.limit(searchLimit)

  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(item => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_rate_aed: item.unit_rate_aed,
    total_aed: item.total_aed,
    project_name: item.historical_projects?.project_name ?? 'Unknown',
    project_location: item.historical_projects?.project_location ?? null,
  }))
}
