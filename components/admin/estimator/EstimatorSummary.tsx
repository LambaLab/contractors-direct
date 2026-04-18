'use client'

import {
  COMPLEXITY_LABELS,
  FINISH_LABELS,
  PROJECT_TYPE_LABELS,
} from '@/lib/estimator/rates'
import type { EstimatorBreakdown, EstimatorInputs } from '@/lib/estimator/types'
import {
  formatRatePerArea,
  sqmToDisplay,
  unitLabel,
  useEstimatorUnit,
} from '@/lib/estimator/units'

type Props = {
  inputs: EstimatorInputs
  breakdown: EstimatorBreakdown
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Row({
  label,
  value,
  muted,
  strong,
  accent,
  indent,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
  accent?: boolean
  indent?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${
        indent ? 'pl-3' : ''
      }`}
    >
      <span
        className={[
          strong ? 'text-foreground font-medium' : '',
          muted ? 'text-muted-foreground' : 'text-foreground/85',
        ].join(' ')}
      >
        {label}
      </span>
      <span
        className={[
          'font-mono tabular-nums',
          accent ? 'text-primary font-semibold text-base' : '',
          strong ? 'text-foreground font-semibold' : '',
          muted && !strong ? 'text-muted-foreground' : 'text-foreground',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-heading text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1 mt-3">
      {children}
    </p>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/85">{value}</span>
    </div>
  )
}

export function EstimatorSummary({ inputs, breakdown }: Props) {
  const { unit } = useEstimatorUnit()
  const u = unitLabel(unit)
  const b = breakdown

  const basis =
    inputs.projectType === 'villa_new_build'
      ? 'Area-based new build benchmark'
      : inputs.projectType === 'extension_remodelling'
        ? 'Area-based extension benchmark'
        : 'Room-based renovation benchmark'

  return (
    <aside className="space-y-4">
      {/* Hero card */}
      <div className="rounded-xl border border-primary/25 bg-gradient-to-b from-primary/[0.10] to-transparent overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <p className="font-heading text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Final Estimated Budget
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[11px] font-mono tracking-widest text-primary/80">AED</span>
            <span className="font-heading text-4xl md:text-5xl font-bold tabular-nums text-foreground tracking-tight">
              {fmt(b.finalBudgetAed)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {b.budgetPerSqm > 0
              ? `AED ${formatRatePerArea(b.budgetPerSqm, unit)} / ${u} on ${fmt(sqmToDisplay(inputs.builtUpAreaSqm, unit))} ${u}`
              : `Enter a built-up area to see a per-${u} figure`}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-black/20">
          <MetaRow label="Project Type" value={PROJECT_TYPE_LABELS[inputs.projectType]} />
          <MetaRow label="Finish" value={FINISH_LABELS[inputs.finishLevel]} />
          <MetaRow label="Complexity" value={COMPLEXITY_LABELS[inputs.complexity]} />
          <MetaRow label="Basis" value={basis} />
          <MetaRow label="Authority Fee" value={`Included (AED ${fmt(b.authorityFee)})`} />
        </div>
      </div>

      {/* Calculated factors table */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02]">
        <header className="px-5 pt-4 pb-3 border-b border-white/5">
          <h2 className="font-heading text-[11px] uppercase tracking-[0.18em] text-foreground/70">
            Calculated Factors & Summary
          </h2>
        </header>

        <div className="px-5 py-4">
          <SectionLabel>Cost build-up</SectionLabel>
          <Row label="Base Cost" value={`AED ${fmt(b.projectBaseCost)}`} />
          <Row label="Room Costs" value={`AED ${fmt(b.baseRoomCosts)}`} />
          <Row
            label="Optional Scope Costs"
            value={`AED ${fmt(b.optionalScope.total + b.directAllowances.total)}`}
          />
          <Row label="Area-Based Cost" value={`AED ${fmt(b.areaBasedCost)}`} />

          <div className="mt-2 pt-2 border-t border-white/5">
            <Row
              label="Core Construction Cost"
              value={`AED ${fmt(b.coreConstructionCost)}`}
              strong
            />
          </div>

          <SectionLabel>Multipliers</SectionLabel>
          <Row
            label="Finish Factor"
            value={`× ${b.finishFactor.toFixed(2)} (applied above)`}
            muted
          />
          <Row
            label="Complexity Factor"
            value={`× ${b.complexityFactor.toFixed(2)}`}
            muted
          />
          <div className="mt-2 pt-2 border-t border-white/5">
            <Row
              label="Adjusted Core Cost"
              value={`AED ${fmt(b.adjustedCoreCost)}`}
              strong
            />
          </div>

          <SectionLabel>Direct Allowances</SectionLabel>
          <Row
            label="Internal painting"
            value={`AED ${fmt(b.directAllowances.painting)}`}
            muted
            indent
          />
          <Row
            label="AC / HVAC"
            value={`AED ${fmt(b.directAllowances.acHvac)}`}
            muted
            indent
          />
          <Row
            label="Glazing"
            value={`AED ${fmt(b.directAllowances.glazing)}`}
            muted
            indent
          />
          <Row
            label="Façade painting"
            value={`AED ${fmt(b.directAllowances.facade)}`}
            muted
            indent
          />
          <div className="mt-2 pt-2 border-t border-white/5">
            <Row
              label="Direct Allowances"
              value={`AED ${fmt(b.directAllowances.total)}`}
              strong
            />
          </div>

          <SectionLabel>Fees</SectionLabel>
          <Row
            label="Project Management Fee (5%)"
            value={`AED ${fmt(b.pmFee)}`}
          />
          <Row label="Authority Fee" value={`AED ${fmt(b.authorityFee)}`} />

          <div className="mt-2 pt-2 border-t border-white/5">
            <Row
              label="Subtotal Before Contingency"
              value={`AED ${fmt(b.subtotalBeforeContingency)}`}
              strong
            />
          </div>

          <Row label="Contingency (10%)" value={`AED ${fmt(b.contingency)}`} />

          <div className="mt-3 pt-3 border-t border-primary/25">
            <Row
              label="Final Estimated Budget"
              value={`AED ${fmt(b.finalBudgetAed)}`}
              accent
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
