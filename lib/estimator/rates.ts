import type {
  Complexity,
  FinishLevel,
  ProjectType,
  RoomType,
} from './types'

// Source of truth: dubai_residential_budget_estimator_v5.xlsx (Rate_Cards sheet).
// Update these constants when the rate card changes.

export const PROJECT_BASE_COSTS: Record<ProjectType, number> = {
  apartment_refresh: 25_000,
  apartment_full_renovation: 45_000,
  villa_partial_renovation: 70_000,
  villa_full_renovation: 120_000,
  extension_remodelling: 95_000,
  villa_new_build: 0,
}

export const ROOM_BASE_RATES: Record<RoomType, number> = {
  bedroom: 18_000,
  bathroom: 45_000,
  kitchen: 75_000,
  living_room: 28_000,
  dining_room: 20_000,
  maid_room: 16_000,
  utility_laundry: 12_000,
  corridor_entry: 10_000,
}

export const FINISH_MULTIPLIERS: Record<FinishLevel, number> = {
  basic: 0.85,
  standard: 1,
  premium: 1.2,
  luxury: 1.5,
}

export const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  light_refurbishment: 0.9,
  standard_renovation: 1,
  major_renovation: 1.25,
  structural_alteration: 1.6,
}

export const OPTIONAL_SCOPE_RATES = {
  flooringPerSqm: 220,
  paintingPerSqm: 35,
  ceilingsPerSqm: 180,
  doorsPerUnit: 2_500,
  wardrobesPerUnit: 15_000,
} as const

export const AC_RATES_BY_FINISH: Record<FinishLevel, number> = {
  basic: 9_000,
  standard: 12_000,
  premium: 15_000,
  luxury: 20_000,
}

export const GLAZING_RATES_BY_FINISH: Record<FinishLevel, number> = {
  basic: 350,
  standard: 400,
  premium: 450,
  luxury: 500,
}

export const FACADE_RATE_PER_SQM = 80

export const EXTENSION_RATE_PER_SQM = 5_000
export const VILLA_NEW_BUILD_RATE_PER_SQM = 7_000

export const PM_FEE_RATE = 0.05
export const CONTINGENCY_RATE = 0.1
export const AUTHORITY_FEE = 20_000

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  apartment_refresh: 'Apartment refresh',
  apartment_full_renovation: 'Apartment full renovation',
  villa_partial_renovation: 'Villa partial renovation',
  villa_full_renovation: 'Villa full renovation',
  extension_remodelling: 'Extension / remodelling',
  villa_new_build: 'Villa, build new',
}

export const FINISH_LABELS: Record<FinishLevel, string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
}

export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  light_refurbishment: 'Light refurbishment',
  standard_renovation: 'Standard renovation',
  major_renovation: 'Major renovation',
  structural_alteration: 'Structural alteration',
}

export const ROOM_LABELS: Record<RoomType, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  living_room: 'Living room',
  dining_room: 'Dining room',
  maid_room: 'Maid room',
  utility_laundry: 'Utility / Laundry',
  corridor_entry: 'Corridor / Entry',
}

export const ROOM_ORDER: RoomType[] = [
  'bedroom',
  'bathroom',
  'kitchen',
  'living_room',
  'dining_room',
  'maid_room',
  'utility_laundry',
  'corridor_entry',
]

export const PROJECT_TYPE_ORDER: ProjectType[] = [
  'apartment_refresh',
  'apartment_full_renovation',
  'villa_partial_renovation',
  'villa_full_renovation',
  'extension_remodelling',
  'villa_new_build',
]

export const FINISH_ORDER: FinishLevel[] = ['basic', 'standard', 'premium', 'luxury']

export const COMPLEXITY_ORDER: Complexity[] = [
  'light_refurbishment',
  'standard_renovation',
  'major_renovation',
  'structural_alteration',
]
