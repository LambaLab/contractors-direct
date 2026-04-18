import type {
  Complexity,
  EstimatorInputs,
  FinishLevel,
  ProjectType,
  RoomType,
} from './types'

export type ProjectNature =
  | 'refresh'
  | 'partial_renovation'
  | 'full_renovation'
  | 'extension'
  | 'new_build'

export interface IntakeInputs {
  projectNature: ProjectNature
  propertyType: string // villa | apartment | townhouse | penthouse | office | retail | warehouse
  sizeSqft: number
  finishLevel: FinishLevel
}

const SQFT_TO_SQM = 0.0929

function isVillaLike(propertyType: string): boolean {
  return /^(villa|townhouse)$/i.test(propertyType)
}

function isCommercial(propertyType: string): boolean {
  return /^(office|retail|warehouse|commercial)$/i.test(propertyType)
}

function mapProjectType(propertyType: string, nature: ProjectNature): ProjectType {
  if (nature === 'new_build') return 'villa_new_build'
  if (nature === 'extension') return 'extension_remodelling'
  if (isVillaLike(propertyType)) {
    if (nature === 'full_renovation') return 'villa_full_renovation'
    // refresh + partial_renovation both map to villa_partial_renovation
    return 'villa_partial_renovation'
  }
  // apartment / penthouse / everything else residential
  if (nature === 'full_renovation') return 'apartment_full_renovation'
  return 'apartment_refresh'
}

function mapComplexity(nature: ProjectNature): Complexity {
  switch (nature) {
    case 'refresh':
      return 'light_refurbishment'
    case 'full_renovation':
      return 'major_renovation'
    case 'partial_renovation':
    case 'extension':
    case 'new_build':
      return 'standard_renovation'
  }
}

function inferRooms(propertyType: string, sqm: number, nature: ProjectNature): Record<RoomType, number> {
  const villa = isVillaLike(propertyType)
  const empty: Record<RoomType, number> = {
    bedroom: 0,
    bathroom: 0,
    kitchen: 0,
    living_room: 0,
    dining_room: 0,
    maid_room: 0,
    utility_laundry: 0,
    corridor_entry: 0,
  }

  // Studio (≤50 sqm apartment): open-plan, no separate kitchen / living
  // priced at full room rates. Refresh on a studio drops to project base +
  // light fixtures only.
  if (!villa && sqm > 0 && sqm <= 50) {
    if (nature === 'refresh') return empty
    return { ...empty, bedroom: 1, bathroom: 1 }
  }

  // Refresh = light cosmetic only (paint + minor fixture work). Don't price
  // the entire property's room stack at full reno rates — pick a token room
  // count so the calculator produces a number in the cosmetic range. The
  // user can dig deeper for room-by-room scoping.
  if (nature === 'refresh') {
    return {
      ...empty,
      bedroom: villa ? 2 : 1,
      bathroom: villa ? 2 : 1,
    }
  }

  let bedroom = 1
  let bathroom = 1
  const kitchen = 1
  const living_room = 1
  let dining_room = 0
  let maid_room = 0
  let utility_laundry = 0
  let corridor_entry = 0

  if (villa) {
    if (sqm <= 150) {
      bedroom = 2
      bathroom = 2
      utility_laundry = 1
    } else if (sqm <= 280) {
      bedroom = 3
      bathroom = 3
      dining_room = 1
      utility_laundry = 1
    } else if (sqm <= 450) {
      bedroom = 4
      bathroom = 4
      dining_room = 1
      maid_room = 1
      utility_laundry = 1
      corridor_entry = 1
    } else if (sqm <= 600) {
      bedroom = 5
      bathroom = 5
      dining_room = 1
      maid_room = 1
      utility_laundry = 1
      corridor_entry = 1
    } else {
      // Estate-scale villa: 6+ bedrooms typical
      bedroom = 7
      bathroom = 7
      dining_room = 1
      maid_room = 1
      utility_laundry = 1
      corridor_entry = 1
    }
  } else {
    if (sqm <= 70) {
      bedroom = 1
      bathroom = 1
    } else if (sqm <= 130) {
      bedroom = 2
      bathroom = 2
    } else if (sqm <= 220) {
      bedroom = 3
      bathroom = 3
      dining_room = 1
      utility_laundry = 1
    } else {
      bedroom = 4
      bathroom = 4
      dining_room = 1
      maid_room = 1
      utility_laundry = 1
      corridor_entry = 1
    }
  }

  return {
    bedroom,
    bathroom,
    kitchen,
    living_room,
    dining_room,
    maid_room,
    utility_laundry,
    corridor_entry,
  }
}

export function intakeToEstimatorInputs(intake: IntakeInputs): EstimatorInputs {
  const sqm = Math.max(0, Math.round(intake.sizeSqft * SQFT_TO_SQM))
  const projectType = mapProjectType(intake.propertyType, intake.projectNature)
  const complexity = mapComplexity(intake.projectNature)
  const rooms = inferRooms(intake.propertyType, sqm, intake.projectNature)
  const isNewBuild = intake.projectNature === 'new_build'
  const isExtension = intake.projectNature === 'extension'
  const commercial = isCommercial(intake.propertyType)

  // Commercial fit-out: residential room rates (bedroom, kitchen, wardrobe)
  // are nonsensical here. Route through extension_remodelling for the
  // area-based cost shape, but with rates calibrated to UAE commercial
  // benchmarks (~3,500 AED/sqm fit-out, ~1,500 AED/sqm refresh) instead of
  // the residential-extension rate of 5,000 AED/sqm.
  if (commercial) {
    const isRefresh = intake.projectNature === 'refresh'
    const isFullFitOut = intake.projectNature === 'full_renovation' || intake.projectNature === 'new_build'
    // Refresh: light cosmetic, no project base. Full fit-out: standard
    // shell-and-core to fitted rate. Anything in between: partial fit-out.
    const areaBaseRate = isRefresh ? 1_500 : isFullFitOut ? 3_500 : 2_500
    const projectBaseOverride = isRefresh ? 0 : 95_000

    return {
      projectType: 'extension_remodelling',
      finishLevel: intake.finishLevel,
      complexity,
      builtUpAreaSqm: sqm,
      extensionAreaSqm: sqm,
      rooms: {
        bedroom: 0,
        bathroom: 0,
        kitchen: 0,
        living_room: 0,
        dining_room: 0,
        maid_room: 0,
        utility_laundry: 0,
        corridor_entry: 0,
      },
      doors: 0,
      wardrobes: 0,
      acUpgrade: false,
      acUnits: 0,
      glazingReplacement: false,
      facadePainting: false,
      areaBaseRate,
      projectBaseOverride,
    }
  }

  // Extension: the user's stated sqft is the AREA OF THE NEW ADDITION, not
  // the existing property. The calculator multiplies extensionAreaSqm by
  // EXTENSION_RATE_PER_SQM (the build-from-scratch rate), so leaving rooms
  // populated would double-count the existing house. Zero them out, treat
  // builtUpAreaSqm as the extension area too (so painting hits the new
  // addition only), and add one door for the new room.
  if (isExtension) {
    return {
      projectType,
      finishLevel: intake.finishLevel,
      complexity,
      builtUpAreaSqm: sqm,
      extensionAreaSqm: sqm,
      rooms: {
        bedroom: 0,
        bathroom: 0,
        kitchen: 0,
        living_room: 0,
        dining_room: 0,
        maid_room: 0,
        utility_laundry: 0,
        corridor_entry: 0,
      },
      doors: 1,
      wardrobes: 0,
      acUpgrade: false,
      acUnits: 0,
      glazingReplacement: false,
      facadePainting: false,
    }
  }

  return {
    projectType,
    finishLevel: intake.finishLevel,
    complexity,
    builtUpAreaSqm: sqm,
    extensionAreaSqm: 0,
    rooms: isNewBuild
      ? {
          bedroom: 0,
          bathroom: 0,
          kitchen: 0,
          living_room: 0,
          dining_room: 0,
          maid_room: 0,
          utility_laundry: 0,
          corridor_entry: 0,
        }
      : rooms,
    doors: isNewBuild ? 0 : rooms.bedroom + 2,
    wardrobes: isNewBuild ? 0 : rooms.bedroom,
    acUpgrade: false,
    acUnits: 0,
    glazingReplacement: false,
    facadePainting: false,
  }
}

// Scope items that are "on" by default at intake time, based on the project
// nature. Matches what calculateEstimate auto-includes (flooring / painting /
// ceilings for full renos; painting-only otherwise). User can uncheck later.
export function defaultScopeForNature(nature: ProjectNature): string[] {
  if (nature === 'new_build') return []
  if (nature === 'full_renovation') return ['flooring', 'paint_walls', 'false_ceiling']
  // refresh, partial, extension
  return ['paint_walls']
}
