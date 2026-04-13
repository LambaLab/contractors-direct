import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import type { HistoricalPricingStat, PricingOverride } from '@/lib/pricing/historical'

export type PriceRange = { min: number; max: number }

/** Style tier multipliers — lower styles cost less, premium styles cost more */
export const STYLE_MULTIPLIERS: Record<string, number> = {
  minimalist: 0.85,
  scandinavian: 0.95,
  coastal: 0.95,
  modern: 1.0,
  industrial: 1.0,
  contemporary_arabic: 1.15,
  classic: 1.2,
  maximalist: 1.35,
}

/** Location cost factor — Dubai baseline, other emirates slightly lower */
const LOCATION_FACTORS: Record<string, number> = {
  dubai: 1.0,
  abu_dhabi: 0.95,
  sharjah: 0.85,
  ajman: 0.80,
  ras_al_khaimah: 0.80,
  fujairah: 0.75,
  umm_al_quwain: 0.75,
}

/** Condition multiplier — more work needed = higher cost */
const CONDITION_MULTIPLIERS: Record<string, number> = {
  new: 0.7,           // minimal work, mostly cosmetic
  needs_refresh: 1.0, // standard renovation baseline
  major_renovation: 1.3,
  shell: 1.6,         // building from bare structure
}

/**
 * Room area as a fraction of property size, with min/max caps.
 * Scales with property size so a 7,700 sqft villa gets a ~460 sqft kitchen
 * while a 900 sqft apartment gets ~80 sqft.
 */
const ROOM_AREA_FRACTIONS: Record<string, { fraction: number; min: number; max: number }> = {
  kitchen:          { fraction: 0.06, min: 80,  max: 500 },
  master_bathroom:  { fraction: 0.04, min: 60,  max: 250 },
  family_bathroom:  { fraction: 0.03, min: 50,  max: 150 },
  ensuite_bathroom: { fraction: 0.025, min: 40, max: 120 },
  powder_room:      { fraction: 0.01, min: 25,  max: 60  },
  home_cinema:      { fraction: 0.05, min: 150, max: 400 },
}

/**
 * Scope items that signal property-wide work. If any of these appear in scope,
 * per-sqft items use the full property size.
 */
const PROPERTY_WIDE_SCOPE = new Set(['flooring', 'exterior_painting', 'extensions'])

/** Estimate the area for a single room based on the property size. */
function estimateRoomArea(roomId: string, propertySqft: number): number {
  const config = ROOM_AREA_FRACTIONS[roomId]
  if (!config) return 0
  const raw = config.fraction * propertySqft
  return Math.max(config.min, Math.min(config.max, raw))
}

/**
 * Estimate the effective area for per-sqft pricing.
 * For room-specific renovations (kitchen, bathrooms), uses estimated room area
 * so trades like plumbing/electrical are priced to the rooms, not the whole property.
 * For full-property renovations (flooring, exterior), uses full sqft.
 */
export function getEffectiveArea(scopeIds: string[], propertySqft: number): number {
  // If any property-wide finish items are in scope, use full property size
  if (scopeIds.some(id => PROPERTY_WIDE_SCOPE.has(id))) return propertySqft

  // Count room-specific items
  const roomIds = scopeIds.filter(id => id in ROOM_AREA_FRACTIONS)
  if (roomIds.length === 0) return propertySqft

  // Sum estimated room areas, cap at property size
  const totalRoomArea = roomIds.reduce((sum, id) => sum + estimateRoomArea(id, propertySqft), 0)
  return Math.min(totalRoomArea, propertySqft)
}

/**
 * Calculate base price range from detected scope items.
 * Uses per-sqft pricing where applicable, flat rates otherwise.
 */
export function calculatePriceRange(scopeIds: string[], sizeSqft: number): PriceRange {
  return scopeIds.reduce(
    (acc, id) => {
      const item = SCOPE_CATALOG.find((s) => s.id === id)
      if (!item) return acc

      // Use per-sqft pricing if available, otherwise flat rate
      if (item.pricePerSqftMin > 0 && sizeSqft > 0) {
        return {
          min: acc.min + item.pricePerSqftMin * sizeSqft,
          max: acc.max + item.pricePerSqftMax * sizeSqft,
        }
      }
      return {
        min: acc.min + item.flatMin,
        max: acc.max + item.flatMax,
      }
    },
    { min: 0, max: 0 }
  )
}

/** Apply style tier multiplier to price range */
export function applyStyleMultiplier(base: PriceRange, style: string): PriceRange {
  const multiplier = STYLE_MULTIPLIERS[style.toLowerCase().replace(/\s+/g, '_')] ?? 1.0
  return {
    min: Math.round(base.min * multiplier),
    max: Math.round(base.max * multiplier),
  }
}

/** Apply location cost factor */
export function applyLocationFactor(base: PriceRange, location: string): PriceRange {
  // Try to match location to a known emirate
  const lower = location.toLowerCase()
  let factor = 1.0
  for (const [key, val] of Object.entries(LOCATION_FACTORS)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key.replace(/_/g, ''))) {
      factor = val
      break
    }
  }
  return {
    min: Math.round(base.min * factor),
    max: Math.round(base.max * factor),
  }
}

/** Apply condition multiplier */
export function applyConditionMultiplier(base: PriceRange, condition: string): PriceRange {
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 1.0
  return {
    min: Math.round(base.min * multiplier),
    max: Math.round(base.max * multiplier),
  }
}

/** Apply a general complexity adjustment (0.5 - 2.0) */
export function applyComplexityAdjustment(base: PriceRange, multiplier: number): PriceRange {
  const clamped = Math.max(0.5, Math.min(2.0, multiplier))
  return {
    min: Math.round(base.min * clamped),
    max: Math.round(base.max * clamped),
  }
}

// At 30% confidence: full range. At 100%: range tightened to ~10% spread.
export function tightenPriceRange(base: PriceRange, confidenceScore: number): PriceRange {
  if (confidenceScore <= 30) return base
  const midpoint = (base.min + base.max) / 2
  const halfSpread = (base.max - base.min) / 2
  const tightenFactor = Math.min(1, ((confidenceScore - 30) / 70) * 0.9)
  const newHalfSpread = halfSpread * (1 - tightenFactor)
  return {
    min: Math.round(midpoint - newHalfSpread),
    max: Math.round(midpoint + newHalfSpread),
  }
}

/**
 * Quick ballpark for the journey divider's "Quick Estimate" mode.
 * Uses Core Four + scope selection (no style, no complexity, no tightening).
 *
 * For room-specific renovations (kitchen, bathrooms), per-sqft trade items
 * are priced at estimated room area, not the full property size.
 *
 * When historical pricing stats are available, uses data-driven pricing
 * (with CD overrides > historical P25-P75 > blended > static fallback).
 */
export function computeQuickBallpark(params: {
  scopeIds: string[]
  sizeSqft: number
  condition: string
  location: string
  historicalStats?: HistoricalPricingStat[]
}): PriceRange {
  const effectiveArea = getEffectiveArea(params.scopeIds, params.sizeSqft)
  const base = params.historicalStats && params.historicalStats.length > 0
    ? calculateDataDrivenPriceRange(params.scopeIds, effectiveArea, params.historicalStats)
    : calculatePriceRange(params.scopeIds, effectiveArea)
  const withCondition = applyConditionMultiplier(base, params.condition)
  const withLocation = applyLocationFactor(withCondition, params.location)
  return {
    min: Math.round(withLocation.min * 0.95),
    max: Math.round(withLocation.max * 1.05),
  }
}

/**
 * Calculate price range using historical data + CD overrides, falling back to static catalog.
 *
 * Priority chain:
 * 1. CD override (from pricing_overrides table) - team's preferred rates
 * 2. Historical P25-P75 (from pricing_summary view, 3+ samples)
 * 3. Blended 50/50 historical + static (< 3 samples)
 * 4. Static catalog fallback (no historical data)
 */
/**
 * Units that represent per-sqft rates and can safely be multiplied by area.
 * All other units (lot, nr, lm, set, etc.) are treated as flat rates.
 */
const PER_SQFT_UNITS = new Set(['sqft', 'sq ft', 'sqm', 'sq m', 'sft'])

export function calculateDataDrivenPriceRange(
  scopeIds: string[],
  sizeSqft: number,
  historicalStats: HistoricalPricingStat[],
  overrides?: PricingOverride[]
): PriceRange {
  // Index historical stats by scope_item_id. Prefer sqft-unit entries
  // for per-sqft items so we don't multiply a flat/lot rate by area.
  const statsMap = new Map<string, HistoricalPricingStat>()
  for (const s of historicalStats) {
    const existing = statsMap.get(s.scope_item_id)
    const isSqft = PER_SQFT_UNITS.has((s.unit ?? '').toLowerCase())
    const existingIsSqft = existing && PER_SQFT_UNITS.has((existing.unit ?? '').toLowerCase())
    // Prefer sqft-unit entries; otherwise keep first seen
    if (!existing || (isSqft && !existingIsSqft)) {
      statsMap.set(s.scope_item_id, s)
    }
  }

  const overrideMap = new Map<string, PricingOverride>()
  if (overrides) {
    for (const o of overrides) {
      if (o.scope_item_id) overrideMap.set(o.scope_item_id, o)
    }
  }

  return scopeIds.reduce(
    (acc, id) => {
      const item = SCOPE_CATALOG.find(s => s.id === id)
      if (!item) return acc

      const override = overrideMap.get(id)
      const historical = statsMap.get(id)

      // Determine if the historical rate is actually per-sqft.
      // Only multiply by area when BOTH the catalog item is per-sqft
      // AND the historical unit is a sqft variant. Otherwise treat
      // the historical rate as a flat/lump-sum price.
      const historicalIsSqft = historical && PER_SQFT_UNITS.has((historical.unit ?? '').toLowerCase())
      const canMultiplySqft = sizeSqft > 0 && item.pricePerSqftMin > 0 && historicalIsSqft
      const overrideIsSqft = override && PER_SQFT_UNITS.has((override.unit ?? '').toLowerCase())
      const canMultiplyOverride = sizeSqft > 0 && item.pricePerSqftMin > 0 && overrideIsSqft

      let itemMin: number
      let itemMax: number

      if (override) {
        // Priority 1: CD team override
        if (canMultiplyOverride) {
          itemMin = override.override_min_aed * sizeSqft
          itemMax = override.override_max_aed * sizeSqft
        } else {
          itemMin = override.override_min_aed
          itemMax = override.override_max_aed
        }
      } else if (historical && historical.sample_count >= 3) {
        // Priority 2: Historical IQR (3+ data points)
        if (canMultiplySqft) {
          itemMin = historical.rate_p25 * sizeSqft
          itemMax = historical.rate_p75 * sizeSqft
        } else {
          itemMin = historical.rate_p25
          itemMax = historical.rate_p75
        }
      } else if (historical) {
        // Priority 3: Blend 50/50 with static catalog (< 3 data points)
        const staticMin = item.pricePerSqftMin > 0 && sizeSqft > 0
          ? item.pricePerSqftMin * sizeSqft : item.flatMin
        const staticMax = item.pricePerSqftMax > 0 && sizeSqft > 0
          ? item.pricePerSqftMax * sizeSqft : item.flatMax

        const histMin = canMultiplySqft
          ? historical.rate_min * sizeSqft : historical.rate_min
        const histMax = canMultiplySqft
          ? historical.rate_max * sizeSqft : historical.rate_max

        itemMin = Math.round(0.5 * staticMin + 0.5 * histMin)
        itemMax = Math.round(0.5 * staticMax + 0.5 * histMax)
      } else {
        // Priority 4: Static catalog fallback
        if (item.pricePerSqftMin > 0 && sizeSqft > 0) {
          itemMin = item.pricePerSqftMin * sizeSqft
          itemMax = item.pricePerSqftMax * sizeSqft
        } else {
          itemMin = item.flatMin
          itemMax = item.flatMax
        }
      }

      return {
        min: acc.min + Math.round(itemMin),
        max: acc.max + Math.round(itemMax),
      }
    },
    { min: 0, max: 0 }
  )
}

export function getConfidenceLabel(score: number): string {
  if (score < 30) return 'Low'
  if (score < 55) return 'Fair'
  if (score < 75) return 'Good'
  return 'High'
}

export function isPricingVisible(score: number): boolean {
  return score >= 30
}

export function formatPrice(n: number): string {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}k`
  return `AED ${n}`
}

export function formatPriceRange(range: PriceRange): string {
  return `${formatPrice(range.min)} – ${formatPrice(range.max)}`
}

/**
 * Compute a single midpoint price per style tier.
 * Takes the style-neutral ballpark (from computeQuickBallpark) and applies
 * each style multiplier to the midpoint, giving one representative price per tier.
 */
export function computeStyleMidpoints(baseBallpark: PriceRange): Record<string, number> {
  const mid = (baseBallpark.min + baseBallpark.max) / 2
  const result: Record<string, number> = {}
  for (const [style, multiplier] of Object.entries(STYLE_MULTIPLIERS)) {
    result[style] = Math.round(mid * multiplier)
  }
  return result
}

/**
 * Compute a tight price range for a specific style tier.
 * Takes the style-neutral ballpark, finds the midpoint, applies the style
 * multiplier, then wraps in +/- 15% to account for material/finish variance.
 * Result: ~1.35x spread instead of the 8-10x from the full min-max.
 */
export function computeStyleRange(baseBallpark: PriceRange, styleKey: string): PriceRange {
  const mid = (baseBallpark.min + baseBallpark.max) / 2
  const multiplier = STYLE_MULTIPLIERS[styleKey] ?? 1.0
  const center = mid * multiplier
  const spread = 0.15
  return {
    min: Math.round(center * (1 - spread)),
    max: Math.round(center * (1 + spread)),
  }
}
