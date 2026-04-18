'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AC_RATES_BY_FINISH,
  COMPLEXITY_LABELS,
  COMPLEXITY_ORDER,
  FACADE_RATE_PER_SQM,
  FINISH_LABELS,
  FINISH_MULTIPLIERS,
  FINISH_ORDER,
  GLAZING_RATES_BY_FINISH,
  OPTIONAL_SCOPE_RATES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ORDER,
  ROOM_BASE_RATES,
  ROOM_LABELS,
  ROOM_ORDER,
} from '@/lib/estimator/rates'
import type {
  Complexity,
  EstimatorInputs,
  FinishLevel,
  ProjectType,
  RoomType,
} from '@/lib/estimator/types'
import {
  displayToSqm,
  formatRatePerArea,
  sqmToDisplay,
  unitLabel,
  useEstimatorUnit,
} from '@/lib/estimator/units'

type Props = {
  inputs: EstimatorInputs
  onChange: (next: EstimatorInputs) => void
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function clampInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 0) return 0
  return n
}
function clampNum(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n < 0) return 0
  return n
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.02]">
      <header className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/5">
        <h2 className="font-heading text-[11px] uppercase tracking-[0.18em] text-foreground/70">
          {title}
        </h2>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

const triggerClass =
  'w-full h-9 bg-white/[0.04] border-white/10 text-foreground hover:bg-white/[0.06] focus-visible:border-primary focus-visible:ring-primary/25'
const inputClass =
  'w-full h-9 bg-white/[0.04] border-white/10 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
const readonlyValueClass =
  'w-full h-9 flex items-center justify-end gap-1 pr-1 text-foreground/70 font-mono tabular-nums text-sm'

export function EstimatorProjectInputs({ inputs, onChange }: Props) {
  const { unit } = useEstimatorUnit()
  const update = <K extends keyof EstimatorInputs>(key: K, value: EstimatorInputs[K]) => {
    onChange({ ...inputs, [key]: value })
  }
  const showExtension = inputs.projectType === 'extension_remodelling'

  const builtUpDisplay = Math.round(sqmToDisplay(inputs.builtUpAreaSqm, unit))
  const extensionDisplay = Math.round(sqmToDisplay(inputs.extensionAreaSqm, unit))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Field label="Project Type">
          <Select
            value={inputs.projectType}
            onValueChange={(v) => update('projectType', v as ProjectType)}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {PROJECT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Finish Level">
          <Select
            value={inputs.finishLevel}
            onValueChange={(v) => update('finishLevel', v as FinishLevel)}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINISH_ORDER.map((f) => (
                <SelectItem key={f} value={f}>
                  {FINISH_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Complexity">
          <Select
            value={inputs.complexity}
            onValueChange={(v) => update('complexity', v as Complexity)}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLEXITY_ORDER.map((c) => (
                <SelectItem key={c} value={c}>
                  {COMPLEXITY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={`Built-up Area (${unitLabel(unit)})`}>
          <Input
            type="number"
            min={0}
            value={builtUpDisplay || ''}
            onChange={(e) => update('builtUpAreaSqm', displayToSqm(clampNum(e.target.value), unit))}
            placeholder="0"
            className={inputClass}
          />
        </Field>
        {showExtension && (
          <Field label={`Extension Area (${unitLabel(unit)})`}>
            <Input
              type="number"
              min={0}
              value={extensionDisplay || ''}
              onChange={(e) => update('extensionAreaSqm', displayToSqm(clampNum(e.target.value), unit))}
              placeholder="0"
              className={inputClass}
            />
          </Field>
        )}
    </div>
  )
}

export function EstimatorForm({ inputs, onChange }: Props) {
  const { unit } = useEstimatorUnit()
  const u = unitLabel(unit)
  const update = <K extends keyof EstimatorInputs>(key: K, value: EstimatorInputs[K]) => {
    onChange({ ...inputs, [key]: value })
  }
  const updateRoom = (type: RoomType, qty: number) => {
    onChange({ ...inputs, rooms: { ...inputs.rooms, [type]: qty } })
  }

  const disableRooms = inputs.projectType === 'villa_new_build'
  const isFull =
    inputs.projectType === 'apartment_full_renovation' ||
    inputs.projectType === 'villa_full_renovation'
  const isNewBuild = inputs.projectType === 'villa_new_build'

  const finishFactor = FINISH_MULTIPLIERS[inputs.finishLevel]
  const finishName = FINISH_LABELS[inputs.finishLevel]

  // Auto-calculated scope quantities (mirrors Excel B26/B27/B28 formulas)
  const flooringSqm = isFull ? inputs.builtUpAreaSqm : 0
  const paintingSqm = isNewBuild ? 0 : inputs.builtUpAreaSqm
  const ceilingsSqm = isFull ? inputs.builtUpAreaSqm : 0

  // Finish-adjusted per-unit rates for items that flow through Core
  const flooringRate = OPTIONAL_SCOPE_RATES.flooringPerSqm * finishFactor
  const ceilingsRate = OPTIONAL_SCOPE_RATES.ceilingsPerSqm * finishFactor
  const doorsRate = OPTIONAL_SCOPE_RATES.doorsPerUnit * finishFactor
  const wardrobesRate = OPTIONAL_SCOPE_RATES.wardrobesPerUnit * finishFactor
  // Painting and façade are direct allowances: flat (no finish adjustment)
  const paintingRate = OPTIONAL_SCOPE_RATES.paintingPerSqm
  const facadeRate = FACADE_RATE_PER_SQM
  // AC and glazing have their own finish-specific rates
  const acRate = AC_RATES_BY_FINISH[inputs.finishLevel]
  const glazingRate = GLAZING_RATES_BY_FINISH[inputs.finishLevel]

  return (
    <div className="space-y-4">
      <Section
        title="Room Counts"
        hint={
          disableRooms
            ? 'Not used for villa new builds'
            : `Rates shown at ${finishName} finish`
        }
      >
        <div>
          <div
            className={`hidden md:grid grid-cols-[minmax(0,1.6fr)_120px_110px_120px] gap-3 px-1 pb-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground`}
          >
            <div>Room Type</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Rate</div>
            <div className="text-right">Room Cost</div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {ROOM_ORDER.map((type) => {
              const qty = inputs.rooms[type] ?? 0
              const rate = ROOM_BASE_RATES[type] * finishFactor
              const cost = qty * rate
              return (
                <div
                  key={type}
                  className="grid grid-cols-[minmax(0,1.6fr)_120px_110px_120px] gap-3 items-center py-2.5 md:px-1 md:py-2"
                >
                  <div className="text-sm text-foreground/85">{ROOM_LABELS[type]}</div>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={disableRooms}
                    value={qty || ''}
                    onChange={(e) => updateRoom(type, clampInt(e.target.value))}
                    placeholder="0"
                    className={`${inputClass} text-right disabled:opacity-40`}
                  />
                  <div className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                    AED {fmt(rate)}
                  </div>
                  <div
                    className={`text-right font-mono tabular-nums text-sm ${
                      cost > 0 ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}
                  >
                    AED {fmt(cost)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="Optional Scope Inputs" hint={`Rates shown at ${finishName} finish`}>
        <div>
          <div
            className={`hidden md:grid grid-cols-[minmax(0,1.6fr)_120px_100px_110px_120px] gap-3 px-1 pb-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground`}
          >
            <div>Scope</div>
            <div>Primary Input</div>
            <div>Secondary</div>
            <div className="text-right">Rate</div>
            <div className="text-right">Scope Cost</div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            <ScopeRow
              label="Flooring replacement"
              sublabel="auto for full renovations"
              primary={
                <div className={readonlyValueClass}>
                  <span>{fmt(sqmToDisplay(flooringSqm, unit))}</span>
                  <span className="text-[11px] text-muted-foreground">{u}</span>
                </div>
              }
              rateDisplay={`AED ${formatRatePerArea(flooringRate, unit)}`}
              cost={flooringSqm * flooringRate}
            />

            <ScopeRow
              label="Internal painting"
              sublabel="auto · flat rate"
              primary={
                <div className={readonlyValueClass}>
                  <span>{fmt(sqmToDisplay(paintingSqm, unit))}</span>
                  <span className="text-[11px] text-muted-foreground">{u}</span>
                </div>
              }
              rateDisplay={`AED ${formatRatePerArea(paintingRate, unit)}`}
              cost={paintingSqm * paintingRate}
            />

            <ScopeRow
              label="Ceilings"
              sublabel="auto for full renovations"
              primary={
                <div className={readonlyValueClass}>
                  <span>{fmt(sqmToDisplay(ceilingsSqm, unit))}</span>
                  <span className="text-[11px] text-muted-foreground">{u}</span>
                </div>
              }
              rateDisplay={`AED ${formatRatePerArea(ceilingsRate, unit)}`}
              cost={ceilingsSqm * ceilingsRate}
            />

            <ScopeRow
              label="Doors"
              sublabel="qty"
              primary={
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={inputs.doors || ''}
                  onChange={(e) => update('doors', clampInt(e.target.value))}
                  placeholder="0"
                  className={`${inputClass} text-right`}
                />
              }
              rate={doorsRate}
              cost={inputs.doors * doorsRate}
            />

            <ScopeRow
              label="Wardrobes / joinery"
              sublabel="qty"
              primary={
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={inputs.wardrobes || ''}
                  onChange={(e) => update('wardrobes', clampInt(e.target.value))}
                  placeholder="0"
                  className={`${inputClass} text-right`}
                />
              }
              rate={wardrobesRate}
              cost={inputs.wardrobes * wardrobesRate}
            />

            <ScopeRow
              label="AC / HVAC upgrade"
              sublabel="per unit · finish-specific rate"
              primary={
                <Select
                  value={inputs.acUpgrade ? 'yes' : 'no'}
                  onValueChange={(v) => update('acUpgrade', v === 'yes')}
                >
                  <SelectTrigger className={triggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              }
              secondary={
                <Input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!inputs.acUpgrade}
                  value={inputs.acUnits || ''}
                  onChange={(e) => update('acUnits', clampInt(e.target.value))}
                  placeholder="units"
                  className={`${inputClass} text-right disabled:opacity-40`}
                />
              }
              rate={acRate}
              cost={inputs.acUpgrade ? inputs.acUnits * acRate : 0}
            />

            <ScopeRow
              label="Glazing replacement"
              sublabel={`per property ${u} · finish-specific`}
              primary={
                <Select
                  value={inputs.glazingReplacement ? 'yes' : 'no'}
                  onValueChange={(v) => update('glazingReplacement', v === 'yes')}
                >
                  <SelectTrigger className={triggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              }
              rateDisplay={`AED ${formatRatePerArea(glazingRate, unit)}`}
              cost={
                inputs.glazingReplacement ? inputs.builtUpAreaSqm * glazingRate : 0
              }
            />

            <ScopeRow
              label="Façade painting"
              sublabel={`per property ${u} · flat rate`}
              primary={
                <Select
                  value={inputs.facadePainting ? 'yes' : 'no'}
                  onValueChange={(v) => update('facadePainting', v === 'yes')}
                >
                  <SelectTrigger className={triggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              }
              rateDisplay={`AED ${formatRatePerArea(facadeRate, unit)}`}
              cost={inputs.facadePainting ? inputs.builtUpAreaSqm * facadeRate : 0}
            />
          </div>
        </div>
      </Section>
    </div>
  )
}

function ScopeRow({
  label,
  sublabel,
  primary,
  secondary,
  rate,
  rateDisplay,
  cost,
}: {
  label: string
  sublabel?: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  rate?: number
  rateDisplay?: string
  cost: number
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_120px_100px_110px_120px] gap-3 items-center py-2.5 md:px-1 md:py-2">
      <div>
        <div className="text-sm text-foreground/90">{label}</div>
        {sublabel && (
          <div className="text-[11px] text-muted-foreground/80">{sublabel}</div>
        )}
      </div>
      <div>{primary}</div>
      <div>{secondary ?? null}</div>
      <div className="text-right font-mono tabular-nums text-xs text-muted-foreground">
        {rateDisplay ?? (rate != null ? `AED ${fmt(rate)}` : '')}
      </div>
      <div
        className={`text-right font-mono tabular-nums text-sm ${
          cost > 0 ? 'text-foreground' : 'text-muted-foreground/60'
        }`}
      >
        AED {fmt(cost)}
      </div>
    </div>
  )
}
