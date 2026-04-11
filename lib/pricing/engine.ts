import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import type { HistoricalPricingStat, PricingOverride } from '@/lib/pricing/historical'

export type PriceRange = { min: number; max: number }

/** Style tier multipliers — lower styles cost less, premium styles cost more */
const STYLE_MULTIPLIERS: Record<string, number> = {
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
  const tightenFactor = ((confidenceScore - 30) / 70) * 0.9
  const newHalfSpread = halfSpread * (1 - tightenFactor)
  return {
    min: Math.round(midpoint - newHalfSpread),
    max: Math.round(midpoint + newHalfSpread),
  }
}

/**
 * Quick ballpark for the journey divider's "Quick Estimate" mode.
 * Uses Core Four + scope selection (no style, no complexity, no tightening).
 * Widens the range by 10% each direction to account for missing detail.
 */
export function computeQuickBallpark(params: {
  scopeIds: string[]
  sizeSqft: number
  condition: string
  location: string
}): PriceRange {
  const base = calculatePriceRange(params.scopeIds, params.sizeSqft)
  const withCondition = applyConditionMultiplier(base, params.condition)
  const withLocation = applyLocationFactor(withCondition, params.location)
  return {
    min: Math.round(withLocation.min * 0.90),
    max: Math.round(withLocation.max * 1.10),
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
export function calculateDataDrivenPriceRange(
  scopeIds: string[],
  sizeSqft: number,
  historicalStats: HistoricalPricingStat[],
  overrides?: PricingOverride[]
): PriceRange {
  const statsMap = new Map<string, HistoricalPricingStat>()
  for (const s of historicalStats) {
    statsMap.set(s.scope_item_id, s)
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

      let itemMin: number
      let itemMax: number

      if (override) {
        // Priority 1: CD team override
        if (sizeSqft > 0 && item.pricePerSqftMin > 0) {
          itemMin = override.override_min_aed * sizeSqft
          itemMax = override.override_max_aed * sizeSqft
        } else {
          itemMin = override.override_min_aed
          itemMax = override.override_max_aed
        }
      } else if (historical && historical.sample_count >= 3) {
        // Priority 2: Historical IQR (3+ data points)
        if (sizeSqft > 0 && item.pricePerSqftMin > 0) {
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

        const histMin = sizeSqft > 0 && item.pricePerSqftMin > 0
          ? historical.rate_min * sizeSqft : historical.rate_min
        const histMax = sizeSqft > 0 && item.pricePerSqftMax > 0
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

export function formatPriceRange(range: PriceRange): string {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}k`
    return `AED ${n}`
  }
  return `${fmt(range.min)} – ${fmt(range.max)}`
}
