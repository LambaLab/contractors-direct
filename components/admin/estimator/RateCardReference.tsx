'use client'

import {
  AC_RATES_BY_FINISH,
  AUTHORITY_FEE,
  COMPLEXITY_LABELS,
  COMPLEXITY_MULTIPLIERS,
  COMPLEXITY_ORDER,
  CONTINGENCY_RATE,
  EXTENSION_RATE_PER_SQM,
  FACADE_RATE_PER_SQM,
  FINISH_LABELS,
  FINISH_MULTIPLIERS,
  FINISH_ORDER,
  GLAZING_RATES_BY_FINISH,
  OPTIONAL_SCOPE_RATES,
  PM_FEE_RATE,
  PROJECT_BASE_COSTS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ORDER,
  ROOM_BASE_RATES,
  ROOM_LABELS,
  ROOM_ORDER,
  VILLA_NEW_BUILD_RATE_PER_SQM,
} from '@/lib/estimator/rates'
import type { FinishLevel } from '@/lib/estimator/types'

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// Access factors are part of the source spreadsheet's rate card, but not yet
// wired into the calculator. Shown here for reference only.
const ACCESS_LEVELS: { label: string; factor: number }[] = [
  { label: 'Easy access', factor: 1.0 },
  { label: 'Occupied unit', factor: 1.1 },
  { label: 'Tight building rules', factor: 1.15 },
  { label: 'Difficult logistics', factor: 1.2 },
]

type Row = {
  category: string
  item: string
  unit: string
  standard: number | null // null = no rate (label row)
  finishRates: Record<FinishLevel, number | null> // null = blank cell
  note?: string
}

function buildRows(): Row[] {
  const rows: Row[] = []

  for (const t of PROJECT_TYPE_ORDER) {
    rows.push({
      category: 'Project Base Cost',
      item: PROJECT_TYPE_LABELS[t],
      unit: 'AED / project',
      standard: PROJECT_BASE_COSTS[t],
      finishRates: { basic: null, standard: null, premium: null, luxury: null },
    })
  }

  for (const r of ROOM_ORDER) {
    const base = ROOM_BASE_RATES[r]
    rows.push({
      category: 'Room Rate',
      item: ROOM_LABELS[r],
      unit: r === 'corridor_entry' ? 'AED / zone' : 'AED / room',
      standard: base,
      finishRates: {
        basic: base * FINISH_MULTIPLIERS.basic,
        standard: base * FINISH_MULTIPLIERS.standard,
        premium: base * FINISH_MULTIPLIERS.premium,
        luxury: base * FINISH_MULTIPLIERS.luxury,
      },
    })
  }

  // Optional Scope
  const flooring = OPTIONAL_SCOPE_RATES.flooringPerSqm
  rows.push({
    category: 'Optional Scope',
    item: 'Flooring replacement',
    unit: 'AED / sqm',
    standard: flooring,
    finishRates: {
      basic: flooring * FINISH_MULTIPLIERS.basic,
      standard: flooring * FINISH_MULTIPLIERS.standard,
      premium: flooring * FINISH_MULTIPLIERS.premium,
      luxury: flooring * FINISH_MULTIPLIERS.luxury,
    },
  })
  const painting = OPTIONAL_SCOPE_RATES.paintingPerSqm
  rows.push({
    category: 'Optional Scope',
    item: 'Painting (full repaint override)',
    unit: 'AED / property sqm',
    standard: painting,
    finishRates: {
      basic: painting,
      standard: painting,
      premium: painting,
      luxury: painting,
    },
    note: 'Flat rate, not adjusted by finish',
  })
  const ceilings = OPTIONAL_SCOPE_RATES.ceilingsPerSqm
  rows.push({
    category: 'Optional Scope',
    item: 'Ceilings',
    unit: 'AED / sqm',
    standard: ceilings,
    finishRates: {
      basic: ceilings * FINISH_MULTIPLIERS.basic,
      standard: ceilings * FINISH_MULTIPLIERS.standard,
      premium: ceilings * FINISH_MULTIPLIERS.premium,
      luxury: ceilings * FINISH_MULTIPLIERS.luxury,
    },
  })
  const doors = OPTIONAL_SCOPE_RATES.doorsPerUnit
  rows.push({
    category: 'Optional Scope',
    item: 'Doors',
    unit: 'AED / door',
    standard: doors,
    finishRates: {
      basic: doors * FINISH_MULTIPLIERS.basic,
      standard: doors * FINISH_MULTIPLIERS.standard,
      premium: doors * FINISH_MULTIPLIERS.premium,
      luxury: doors * FINISH_MULTIPLIERS.luxury,
    },
  })
  const wardrobes = OPTIONAL_SCOPE_RATES.wardrobesPerUnit
  rows.push({
    category: 'Optional Scope',
    item: 'Wardrobes / joinery',
    unit: 'AED / unit',
    standard: wardrobes,
    finishRates: {
      basic: wardrobes * FINISH_MULTIPLIERS.basic,
      standard: wardrobes * FINISH_MULTIPLIERS.standard,
      premium: wardrobes * FINISH_MULTIPLIERS.premium,
      luxury: wardrobes * FINISH_MULTIPLIERS.luxury,
    },
  })
  rows.push({
    category: 'Optional Scope',
    item: 'AC / HVAC upgrade per unit',
    unit: 'AED / unit',
    standard: AC_RATES_BY_FINISH.standard,
    finishRates: { ...AC_RATES_BY_FINISH },
    note: 'Finish-specific rate, applied directly',
  })
  rows.push({
    category: 'Optional Scope',
    item: 'Glazing replacement allowance',
    unit: 'AED / property sqm',
    standard: GLAZING_RATES_BY_FINISH.standard,
    finishRates: { ...GLAZING_RATES_BY_FINISH },
    note: 'Finish-specific rate, applied directly',
  })
  rows.push({
    category: 'External Works',
    item: 'Façade painting allowance',
    unit: 'AED / property sqm',
    standard: FACADE_RATE_PER_SQM,
    finishRates: {
      basic: FACADE_RATE_PER_SQM,
      standard: FACADE_RATE_PER_SQM,
      premium: FACADE_RATE_PER_SQM,
      luxury: FACADE_RATE_PER_SQM,
    },
    note: 'Flat rate, not adjusted by finish',
  })

  // Area-based
  rows.push({
    category: 'Area-Based',
    item: 'Extension / remodelling works',
    unit: 'AED / sqm',
    standard: EXTENSION_RATE_PER_SQM,
    finishRates: {
      basic: EXTENSION_RATE_PER_SQM * FINISH_MULTIPLIERS.basic,
      standard: EXTENSION_RATE_PER_SQM * FINISH_MULTIPLIERS.standard,
      premium: EXTENSION_RATE_PER_SQM * FINISH_MULTIPLIERS.premium,
      luxury: EXTENSION_RATE_PER_SQM * FINISH_MULTIPLIERS.luxury,
    },
  })
  rows.push({
    category: 'Area-Based',
    item: 'Villa, build new',
    unit: 'AED / sqm',
    standard: VILLA_NEW_BUILD_RATE_PER_SQM,
    finishRates: {
      basic: VILLA_NEW_BUILD_RATE_PER_SQM * FINISH_MULTIPLIERS.basic,
      standard: VILLA_NEW_BUILD_RATE_PER_SQM * FINISH_MULTIPLIERS.standard,
      premium: VILLA_NEW_BUILD_RATE_PER_SQM * FINISH_MULTIPLIERS.premium,
      luxury: VILLA_NEW_BUILD_RATE_PER_SQM * FINISH_MULTIPLIERS.luxury,
    },
  })

  return rows
}

// 7-column grid matching Excel: Item | Unit | Standard | Basic | Standard | Premium | Luxury
const GRID =
  'grid-cols-[minmax(0,2fr)_140px_120px_repeat(4,minmax(90px,1fr))]'

export function RateCardReference() {
  const rows = buildRows()

  // Group consecutive rows by category for the section headers
  const sections: { label: string; rows: Row[] }[] = []
  for (const row of rows) {
    const last = sections[sections.length - 1]
    if (last && last.label === row.category) last.rows.push(row)
    else sections.push({ label: row.category, rows: [row] })
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      {/* Main rate table */}
      <div className="min-w-0 rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <header className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/5">
          <h2 className="font-heading text-[11px] uppercase tracking-[0.18em] text-foreground/70">
            Rate Cards (Illustrative Dubai / UAE benchmarks)
          </h2>
          <p className="text-[11px] text-muted-foreground hidden md:block">
            Read-only. Edit
            <span className="mx-1 font-mono text-foreground/80">lib/estimator/rates.ts</span>
            to change.
          </p>
        </header>

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className={`grid ${GRID} gap-3 px-5 py-2.5 border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-muted-foreground`}
            >
              <div>Item</div>
              <div>Unit</div>
              <div className="text-right">Standard Rate</div>
              <div className="text-right">Basic</div>
              <div className="text-right">Standard</div>
              <div className="text-right">Premium</div>
              <div className="text-right">Luxury</div>
            </div>

            {sections.map((s) => (
              <div key={s.label}>
                <div className="px-5 py-2 bg-primary/[0.06] border-b border-white/5">
                  <p className="font-heading text-[10px] uppercase tracking-[0.22em] text-primary/80">
                    {s.label}
                  </p>
                </div>
                {s.rows.map((r, i) => (
                  <div
                    key={`${s.label}-${i}`}
                    className={`grid ${GRID} gap-3 items-baseline px-5 py-2 border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors`}
                  >
                    <div>
                      <div className="text-sm text-foreground/90">{r.item}</div>
                      {r.note && (
                        <div className="text-[11px] text-muted-foreground/80">{r.note}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.unit}</div>
                    <div className="text-right font-mono tabular-nums text-sm text-foreground">
                      {r.standard != null ? `AED ${fmt(r.standard)}` : '—'}
                    </div>
                    {FINISH_ORDER.map((f) => (
                      <div
                        key={f}
                        className="text-right font-mono tabular-nums text-sm text-foreground/80"
                      >
                        {r.finishRates[f] != null ? `AED ${fmt(r.finishRates[f]!)}` : '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Factors & Constants sidebar */}
      <aside className="min-w-0 space-y-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <header className="px-5 pt-4 pb-3 border-b border-white/5">
            <h2 className="font-heading text-[11px] uppercase tracking-[0.18em] text-foreground/70">
              Factors & Constants
            </h2>
          </header>

          <div>
            <FactorGroup title="Finish Factor">
              {FINISH_ORDER.map((f) => (
                <FactorRow
                  key={f}
                  label={FINISH_LABELS[f]}
                  value={`× ${FINISH_MULTIPLIERS[f].toFixed(2)}`}
                  percent={`${(FINISH_MULTIPLIERS[f] * 100).toFixed(1)}%`}
                />
              ))}
            </FactorGroup>

            <FactorGroup title="Complexity">
              {COMPLEXITY_ORDER.map((c) => (
                <FactorRow
                  key={c}
                  label={COMPLEXITY_LABELS[c]}
                  value={`× ${COMPLEXITY_MULTIPLIERS[c].toFixed(2)}`}
                  percent={`${(COMPLEXITY_MULTIPLIERS[c] * 100).toFixed(1)}%`}
                />
              ))}
            </FactorGroup>

            <FactorGroup title="Access" note="Reference only, not yet applied">
              {ACCESS_LEVELS.map((a) => (
                <FactorRow
                  key={a.label}
                  label={a.label}
                  value={`× ${a.factor.toFixed(2)}`}
                  percent={`${(a.factor * 100).toFixed(1)}%`}
                  muted
                />
              ))}
            </FactorGroup>

            <FactorGroup title="Add-ons">
              <FactorRow
                label="Contractor OH&P"
                value="included"
                percent="0.0%"
                muted
              />
              <FactorRow
                label="Project management fee"
                value={`${(PM_FEE_RATE * 100).toFixed(1)}%`}
              />
              <FactorRow
                label="Contingency"
                value={`${(CONTINGENCY_RATE * 100).toFixed(1)}%`}
              />
              <FactorRow
                label="Authority fee"
                value={`AED ${fmt(AUTHORITY_FEE)}`}
              />
            </FactorGroup>
          </div>
        </div>
      </aside>
    </div>
  )
}

function FactorGroup({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 px-5 py-2 bg-primary/[0.06] border-b border-white/5">
        <p className="font-heading text-[10px] uppercase tracking-[0.22em] text-primary/80">
          {title}
        </p>
        {note && <p className="text-[10px] text-muted-foreground/80">{note}</p>}
      </div>
      {children}
    </div>
  )
}

function FactorRow({
  label,
  value,
  percent,
  muted,
}: {
  label: string
  value: string
  percent?: string
  muted?: boolean
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-baseline px-5 py-2 border-b border-white/[0.04] text-sm">
      <span className={muted ? 'text-muted-foreground/80' : 'text-foreground/90'}>
        {label}
      </span>
      {percent && (
        <span className="font-mono tabular-nums text-xs text-muted-foreground">
          {percent}
        </span>
      )}
      <span
        className={`font-mono tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {value}
      </span>
    </div>
  )
}
