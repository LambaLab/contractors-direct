import { SCOPE_CATALOG } from '@/lib/scope/catalog'

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
