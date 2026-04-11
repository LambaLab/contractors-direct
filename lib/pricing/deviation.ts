import type { HistoricalPricingStat } from './historical'

export type DeviationSeverity = 'info' | 'warning' | 'alert'

export interface DeviationFlag {
  categoryName: string
  lineItemIndex: number
  lineItemDescription: string
  generatedRate: number
  historicalAvg: number
  historicalP25: number
  historicalP75: number
  deviationPct: number
  severity: DeviationSeverity
  message: string
}

interface BoqLineItem {
  description: string
  unit: string
  quantity: number
  unit_price_aed: number
  subtotal_aed: number
  historical_avg_rate?: number
  deviation_pct?: number
}

interface BoqCategory {
  name: string
  line_items: BoqLineItem[]
  category_subtotal_aed: number
}

/**
 * Flag BOQ line items that deviate significantly from historical pricing.
 *
 * Thresholds:
 * - info:    >15% deviation from average (within IQR)
 * - warning: >30% deviation or outside P25-P75
 * - alert:   >50% deviation from average
 */
export function flagDeviations(
  boqCategories: BoqCategory[],
  historicalStats: HistoricalPricingStat[]
): DeviationFlag[] {
  const flags: DeviationFlag[] = []

  const statsMap = new Map<string, HistoricalPricingStat>()
  for (const s of historicalStats) {
    // Index by scope_item_id; we'll match by unit too
    const key = `${s.scope_item_id}:${s.unit ?? ''}`
    statsMap.set(key, s)
  }

  for (const category of boqCategories) {
    for (let i = 0; i < category.line_items.length; i++) {
      const item = category.line_items[i]
      if (!item.unit_price_aed || item.unit_price_aed <= 0) continue

      // Try to find matching historical stat
      // First try the item's own historical_avg_rate if Claude provided it
      if (item.historical_avg_rate && item.historical_avg_rate > 0) {
        const deviationPct = ((item.unit_price_aed - item.historical_avg_rate) / item.historical_avg_rate) * 100
        const absDeviation = Math.abs(deviationPct)

        if (absDeviation > 15) {
          const severity: DeviationSeverity =
            absDeviation > 50 ? 'alert' :
            absDeviation > 30 ? 'warning' : 'info'

          const direction = deviationPct > 0 ? 'above' : 'below'

          flags.push({
            categoryName: category.name,
            lineItemIndex: i,
            lineItemDescription: item.description,
            generatedRate: item.unit_price_aed,
            historicalAvg: item.historical_avg_rate,
            historicalP25: item.historical_avg_rate * 0.85, // approximate if not available
            historicalP75: item.historical_avg_rate * 1.15,
            deviationPct: Math.round(deviationPct),
            severity,
            message: `${Math.round(absDeviation)}% ${direction} historical average (AED ${item.historical_avg_rate.toFixed(0)}/${item.unit})`,
          })
        }
        continue
      }

      // Try matching from stats map by iterating through stats
      for (const stat of historicalStats) {
        if (!stat.unit) continue
        if (stat.unit.toLowerCase() !== item.unit.toLowerCase()) continue

        const deviationPct = ((item.unit_price_aed - stat.rate_avg) / stat.rate_avg) * 100
        const absDeviation = Math.abs(deviationPct)
        const outsideIQR = item.unit_price_aed < stat.rate_p25 || item.unit_price_aed > stat.rate_p75

        if (absDeviation > 15 || outsideIQR) {
          const severity: DeviationSeverity =
            absDeviation > 50 ? 'alert' :
            (absDeviation > 30 || outsideIQR) ? 'warning' : 'info'

          const direction = deviationPct > 0 ? 'above' : 'below'

          flags.push({
            categoryName: category.name,
            lineItemIndex: i,
            lineItemDescription: item.description,
            generatedRate: item.unit_price_aed,
            historicalAvg: stat.rate_avg,
            historicalP25: stat.rate_p25,
            historicalP75: stat.rate_p75,
            deviationPct: Math.round(deviationPct),
            severity,
            message: `${Math.round(absDeviation)}% ${direction} historical average (AED ${stat.rate_avg.toFixed(0)}/${stat.unit})`,
          })
          break // only flag once per line item
        }
      }
    }
  }

  return flags
}

/**
 * Count flags by severity for summary display.
 */
export function summarizeDeviations(flags: DeviationFlag[]): {
  total: number
  info: number
  warning: number
  alert: number
  aboveAvg: number
  belowAvg: number
} {
  return {
    total: flags.length,
    info: flags.filter(f => f.severity === 'info').length,
    warning: flags.filter(f => f.severity === 'warning').length,
    alert: flags.filter(f => f.severity === 'alert').length,
    aboveAvg: flags.filter(f => f.deviationPct > 0).length,
    belowAvg: flags.filter(f => f.deviationPct < 0).length,
  }
}
