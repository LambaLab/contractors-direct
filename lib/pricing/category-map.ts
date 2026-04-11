/**
 * Maps historical BOQ category names (from PDFs) to scope catalog IDs.
 * This is the bridge between extracted historical data and the existing SCOPE_CATALOG.
 *
 * Keys are lowercase patterns matched against the historical category name.
 * Values are the scope catalog IDs from lib/scope/catalog.ts.
 *
 * Some historical categories map to multiple scope items (e.g., MEP covers
 * electrical + plumbing + HVAC). In those cases we use the primary mapping.
 */

const CATEGORY_PATTERNS: [RegExp, string][] = [
  // Structural
  [/demolition|strip.?out|removal/i, 'demolition'],
  [/extension|addition/i, 'extensions'],
  [/window|glazing|glass/i, 'windows_glazing'],

  // Finishes
  [/kitchen/i, 'kitchen'],
  [/appliance/i, 'appliances'],
  [/floor|flooring|skirting/i, 'flooring'],
  [/til(e|ing)/i, 'tiling'],
  [/paint|wall\s*(finish|treatment)|wallpaper/i, 'paint_walls'],
  [/exterior.*paint/i, 'exterior_painting'],
  [/ceil(ing|ings)|gypsum|bulkhead/i, 'false_ceiling'],
  [/wardrobe|closet/i, 'wardrobes'],
  [/bathroom|washroom|wc|sanitary|powder\s*room/i, 'master_bathroom'],
  [/joinery|carpentry|woodwork|cabinet|millwork/i, 'joinery'],
  [/door|hardware/i, 'joinery'],

  // Systems
  [/electric(al)?|power|wiring|distribution/i, 'electrical'],
  [/plumb(ing)?|drainage|water\s*supply/i, 'plumbing'],
  [/hvac|air\s*condition|ac\b|duct/i, 'hvac'],
  [/light(ing)?|luminaire|led/i, 'lighting'],

  // Specialty
  [/smart|automation|home\s*auto/i, 'smart_home'],
  [/cinema|theater|theatre/i, 'home_cinema'],
  [/balcon/i, 'balconies'],
  [/garden|terrace|deck/i, 'garden_terrace'],
  [/landscape|irrigation|pergola/i, 'landscaping'],

  // MEP (broad category that spans multiple scope items)
  [/^mep/i, 'electrical'],

  // Partitions map to structural (no direct catalog item, closest is demolition)
  [/partition/i, 'demolition'],

  // Civil defence / fire protection (no direct catalog item)
  [/civil\s*defen[cs]e|fire/i, 'electrical'],

  // Signage (no direct catalog item, closest is joinery)
  [/signage/i, 'joinery'],

  // Furniture (no direct catalog item)
  [/furniture/i, 'joinery'],
]

/**
 * Normalize a historical BOQ category name to a scope catalog ID.
 * Returns null if no match is found.
 */
export function normalizeCategoryName(categoryName: string): string | null {
  for (const [pattern, scopeId] of CATEGORY_PATTERNS) {
    if (pattern.test(categoryName)) {
      return scopeId
    }
  }
  return null
}

/**
 * Normalize a description to lowercase, trimmed, single-spaced for similarity matching.
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
