import {
  AC_RATES_BY_FINISH,
  AUTHORITY_FEE,
  COMPLEXITY_MULTIPLIERS,
  CONTINGENCY_RATE,
  EXTENSION_RATE_PER_SQM,
  FACADE_RATE_PER_SQM,
  FINISH_MULTIPLIERS,
  GLAZING_RATES_BY_FINISH,
  OPTIONAL_SCOPE_RATES,
  PM_FEE_RATE,
  PROJECT_BASE_COSTS,
  ROOM_BASE_RATES,
  ROOM_ORDER,
  VILLA_NEW_BUILD_RATE_PER_SQM,
} from './rates'
import type {
  EstimatorBreakdown,
  EstimatorInputs,
  RoomCostLine,
} from './types'

// Mirrors the Excel Estimate sheet. Room costs + optional scope + area-based
// cost form the "core", which is scaled by finish and complexity multipliers.
// Painting, AC, glazing, and facade are direct allowances: added flat, never
// multiplied. PM fee is 5% of (adjusted core + allowances); authority fee is
// a fixed 20,000 AED; contingency is 10% of the subtotal.
export function calculateEstimate(inputs: EstimatorInputs): EstimatorBreakdown {
  const isNewBuild = inputs.projectType === 'villa_new_build'
  const isFullRenovation =
    inputs.projectType === 'apartment_full_renovation' ||
    inputs.projectType === 'villa_full_renovation'

  const finishFactor = FINISH_MULTIPLIERS[inputs.finishLevel]
  const complexityFactor = COMPLEXITY_MULTIPLIERS[inputs.complexity]

  // Finish factor is pre-applied to every Core component (rooms, scope,
  // area-based, project base cost). Complexity is applied globally at the end.
  // This is mathematically identical to the Excel's global multiply, but it
  // lets the form display finish-adjusted per-item rates.
  const roomCosts: RoomCostLine[] = ROOM_ORDER.map((type) => {
    const qty = Math.max(0, inputs.rooms[type] ?? 0)
    const ratePerRoom = ROOM_BASE_RATES[type] * finishFactor
    return { type, qty, ratePerRoom, subtotal: qty * ratePerRoom }
  })
  const baseRoomCosts = roomCosts.reduce((sum, r) => sum + r.subtotal, 0)

  const area = Math.max(0, inputs.builtUpAreaSqm)
  const extensionArea = Math.max(0, inputs.extensionAreaSqm)

  const flooring = isFullRenovation
    ? area * OPTIONAL_SCOPE_RATES.flooringPerSqm * finishFactor
    : 0
  const ceilings = isFullRenovation
    ? area * OPTIONAL_SCOPE_RATES.ceilingsPerSqm * finishFactor
    : 0
  const doorsCost =
    Math.max(0, inputs.doors) * OPTIONAL_SCOPE_RATES.doorsPerUnit * finishFactor
  const wardrobesCost =
    Math.max(0, inputs.wardrobes) * OPTIONAL_SCOPE_RATES.wardrobesPerUnit * finishFactor
  const optionalScopeTotal = flooring + ceilings + doorsCost + wardrobesCost

  let areaBasedCost = 0
  if (inputs.projectType === 'extension_remodelling') {
    areaBasedCost = extensionArea * EXTENSION_RATE_PER_SQM * finishFactor
  } else if (isNewBuild) {
    areaBasedCost = area * VILLA_NEW_BUILD_RATE_PER_SQM * finishFactor
  }

  const projectBaseCost = isNewBuild
    ? 0
    : PROJECT_BASE_COSTS[inputs.projectType] * finishFactor

  const coreConstructionCost = isNewBuild
    ? areaBasedCost + optionalScopeTotal
    : projectBaseCost + baseRoomCosts + areaBasedCost + optionalScopeTotal

  const adjustedCoreCost = coreConstructionCost * complexityFactor

  const painting = isNewBuild ? 0 : area * OPTIONAL_SCOPE_RATES.paintingPerSqm
  const acHvac = inputs.acUpgrade
    ? Math.max(0, inputs.acUnits) * AC_RATES_BY_FINISH[inputs.finishLevel]
    : 0
  const glazing = inputs.glazingReplacement
    ? area * GLAZING_RATES_BY_FINISH[inputs.finishLevel]
    : 0
  const facade = inputs.facadePainting ? area * FACADE_RATE_PER_SQM : 0
  const directAllowancesTotal = painting + acHvac + glazing + facade

  const pmFee = (adjustedCoreCost + directAllowancesTotal) * PM_FEE_RATE
  const authorityFee = AUTHORITY_FEE
  const subtotalBeforeContingency =
    adjustedCoreCost + directAllowancesTotal + pmFee + authorityFee
  const contingency = subtotalBeforeContingency * CONTINGENCY_RATE
  const finalBudgetAed = subtotalBeforeContingency + contingency
  const budgetPerSqm = area > 0 ? finalBudgetAed / area : 0

  return {
    projectBaseCost,
    roomCosts,
    baseRoomCosts,
    optionalScope: {
      flooring,
      ceilings,
      doors: doorsCost,
      wardrobes: wardrobesCost,
      total: optionalScopeTotal,
    },
    areaBasedCost,
    coreConstructionCost,
    finishFactor,
    complexityFactor,
    adjustedCoreCost,
    directAllowances: {
      painting,
      acHvac,
      glazing,
      facade,
      total: directAllowancesTotal,
    },
    pmFee,
    authorityFee,
    subtotalBeforeContingency,
    contingency,
    finalBudgetAed,
    budgetPerSqm,
  }
}

export function defaultEstimatorInputs(): EstimatorInputs {
  return {
    projectType: 'apartment_full_renovation',
    finishLevel: 'standard',
    complexity: 'standard_renovation',
    builtUpAreaSqm: 250,
    extensionAreaSqm: 0,
    rooms: {
      bedroom: 2,
      bathroom: 3,
      kitchen: 1,
      living_room: 1,
      dining_room: 1,
      maid_room: 1,
      utility_laundry: 1,
      corridor_entry: 1,
    },
    doors: 0,
    wardrobes: 0,
    acUpgrade: false,
    acUnits: 0,
    glazingReplacement: false,
    facadePainting: false,
  }
}
