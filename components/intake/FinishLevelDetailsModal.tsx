'use client'

import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { calculateEstimate } from '@/lib/estimator/calculate'
import {
  AC_RATES_BY_FINISH,
  FACADE_RATE_PER_SQM,
  FINISH_LABELS,
  FINISH_MULTIPLIERS,
  GLAZING_RATES_BY_FINISH,
  OPTIONAL_SCOPE_RATES,
} from '@/lib/estimator/rates'
import type { EstimatorInputs, FinishLevel } from '@/lib/estimator/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: FinishLevel | null
  inputs: EstimatorInputs | null
  locationFactor: number
  locationName: string
}

const DESCRIPTIONS: Record<FinishLevel, { tagline: string; description: string; materials: string[] }> = {
  basic: {
    tagline: 'Developer-grade, budget-conscious',
    description:
      'Essentials done well, no frills. Suitable for rentals, investment properties, and light refreshes where value and durability matter more than statement finishes.',
    materials: [
      'Laminate or ceramic flooring',
      'Emulsion paint throughout',
      'Stock kitchen cabinetry',
      'Standard fixtures and fittings',
    ],
  },
  standard: {
    tagline: 'The UAE mid-market default',
    description:
      'Solid materials, clean finishes, and durable fittings throughout. The level most Dubai apartments and family villas settle on for their primary residence.',
    materials: [
      'Porcelain tiles or quality engineered wood',
      'Washable premium paint',
      'Mid-range branded appliances (Bosch, Siemens)',
      'Chrome/brushed fittings, quartz countertops',
    ],
  },
  premium: {
    tagline: 'High-end, design-forward',
    description:
      'Branded appliances, natural stone surfaces, custom joinery, and considered detailing. Typical for Palm / Emirates Hills / downtown villas.',
    materials: [
      'Natural stone or large-format porcelain',
      'Bespoke joinery and wardrobes',
      'High-end appliances (Miele, Gaggenau)',
      'Designer fixtures, rain showers',
    ],
  },
  luxury: {
    tagline: 'Top-tier, bespoke throughout',
    description:
      'Imported marble, custom metalwork, statement lighting, and no compromise on finishes. Rare, usually for marquee villas or signature residences.',
    materials: [
      'Imported marble or feature stone',
      'Bespoke lacquered cabinetry',
      'Top-tier appliances (Sub-Zero, La Cornue)',
      'Custom lighting and smart home integration',
    ],
  },
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function FinishLevelDetailsModal({
  open,
  onOpenChange,
  tier,
  inputs,
  locationFactor,
  locationName,
}: Props) {
  if (!tier || !inputs) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="bg-[#1e1e1e] text-[rgba(255,255,255,0.9)] border border-[rgba(255,255,255,0.08)] sm:max-w-md p-0 overflow-hidden"
          showCloseButton={false}
        >
          <DialogHeader className="p-5">
            <DialogTitle className="text-white">Finish tier</DialogTitle>
            <DialogDescription>Details not available.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const info = DESCRIPTIONS[tier]
  const tierInputs: EstimatorInputs = { ...inputs, finishLevel: tier }
  const breakdown = calculateEstimate(tierInputs)
  const finalAdj = Math.round(breakdown.finalBudgetAed * locationFactor)
  const perSqm =
    tierInputs.builtUpAreaSqm > 0
      ? Math.round(finalAdj / tierInputs.builtUpAreaSqm)
      : 0

  const acRate = AC_RATES_BY_FINISH[tier]
  const glazingRate = GLAZING_RATES_BY_FINISH[tier]
  const finishMultiplier = FINISH_MULTIPLIERS[tier]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#1e1e1e] text-[rgba(255,255,255,0.9)] border border-[rgba(255,255,255,0.08)] sm:max-w-md p-0 overflow-hidden"
        showCloseButton={false}
      >
        <div className="relative p-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
          <DialogClose className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-semibold text-white">
              {FINISH_LABELS[tier]} finish
            </DialogTitle>
            <DialogDescription className="text-sm italic text-[rgba(255,255,255,0.5)]">
              &ldquo;{info.tagline}&rdquo;
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                Estimated budget
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[11px] font-mono tracking-widest text-[#7367ff]">AED</span>
                <span className="text-3xl font-bold text-white tabular-nums">
                  {fmt(finalAdj)}
                </span>
              </div>
              {perSqm > 0 && (
                <p className="text-xs text-[rgba(255,255,255,0.5)] mt-1">
                  AED {fmt(perSqm)} / sqm on {tierInputs.builtUpAreaSqm} sqm in {locationName}
                </p>
              )}
            </div>

            <p className="text-sm text-[rgba(255,255,255,0.65)] leading-relaxed">
              {info.description}
            </p>

            <div className="space-y-1.5">
              <h4 className="text-[11px] font-medium uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                Typical materials at this tier
              </h4>
              <ul className="space-y-1">
                {info.materials.map((m) => (
                  <li
                    key={m}
                    className="text-sm text-[rgba(255,255,255,0.75)] flex items-start gap-2"
                  >
                    <span className="text-[rgba(255,255,255,0.25)] mt-0.5 flex-shrink-0">&middot;</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[11px] font-medium uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                Rates at {FINISH_LABELS[tier]}
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Row label="Finish multiplier" value={`× ${finishMultiplier.toFixed(2)}`} />
                <Row
                  label="AC / HVAC per unit"
                  value={`AED ${fmt(acRate)}`}
                />
                <Row
                  label="Glazing / sqm"
                  value={`AED ${fmt(glazingRate)}`}
                />
                <Row
                  label="Painting / sqm"
                  value={`AED ${OPTIONAL_SCOPE_RATES.paintingPerSqm}`}
                />
                <Row
                  label="Façade painting / sqm"
                  value={`AED ${fmt(FACADE_RATE_PER_SQM)}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[11px] font-medium uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
                Breakdown at {FINISH_LABELS[tier]}
              </h4>
              <div className="space-y-1 text-sm">
                <BRow
                  label="Core construction cost"
                  value={`AED ${fmt(breakdown.coreConstructionCost * locationFactor)}`}
                />
                <BRow
                  label={`× ${breakdown.complexityFactor.toFixed(2)} complexity`}
                  value={`AED ${fmt(breakdown.adjustedCoreCost * locationFactor)}`}
                  muted
                />
                {breakdown.directAllowances.total > 0 && (
                  <BRow
                    label="Direct allowances"
                    value={`AED ${fmt(breakdown.directAllowances.total * locationFactor)}`}
                  />
                )}
                <BRow
                  label="PM fee (5%)"
                  value={`AED ${fmt(breakdown.pmFee * locationFactor)}`}
                />
                <BRow
                  label="Authority fee"
                  value={`AED ${fmt(breakdown.authorityFee * locationFactor)}`}
                />
                <BRow
                  label="Contingency (10%)"
                  value={`AED ${fmt(breakdown.contingency * locationFactor)}`}
                />
                <div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.08)]">
                  <BRow
                    label="Final estimated budget"
                    value={`AED ${fmt(finalAdj)}`}
                    accent
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[rgba(255,255,255,0.55)]">{label}</span>
      <span className="text-right text-white font-mono tabular-nums">{value}</span>
    </>
  )
}

function BRow({
  label,
  value,
  muted,
  accent,
}: {
  label: string
  value: string
  muted?: boolean
  accent?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-[rgba(255,255,255,0.4)]' : 'text-[rgba(255,255,255,0.7)]'}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${
          accent ? 'text-[#7367ff] font-semibold' : muted ? 'text-[rgba(255,255,255,0.55)]' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
