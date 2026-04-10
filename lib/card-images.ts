/**
 * Static map from QR option values to card images. Used by CardChoiceCarousel
 * to look up imageUrl/imageAlt when the AI sends style:'cards' without
 * embedding URLs in the tool output. This keeps the AI prompt short (Haiku-
 * friendly) while the frontend handles the visual layer.
 */

type CardImageEntry = {
  imageUrl: string
  imageAlt: string
}

const CARD_IMAGES: Record<string, CardImageEntry> = {
  // Property type (Phase 1, Q1)
  villa:         { imageUrl: '/intake/cards/property-type/villa.jpg', imageAlt: 'Modern Dubai villa exterior' },
  apartment:     { imageUrl: '/intake/cards/property-type/apartment.jpg', imageAlt: 'Dubai high-rise apartment building' },
  townhouse:     { imageUrl: '/intake/cards/property-type/townhouse.jpg', imageAlt: 'Row of modern townhouses' },
  penthouse:     { imageUrl: '/intake/cards/property-type/penthouse.jpg', imageAlt: 'Penthouse living room with skyline view' },
  office:        { imageUrl: '/intake/cards/property-type/office.jpg', imageAlt: 'Modern open-plan office' },
  retail:        { imageUrl: '/intake/cards/property-type/retail.jpg', imageAlt: 'Modern retail shopfront' },
  warehouse:     { imageUrl: '/intake/cards/property-type/warehouse.jpg', imageAlt: 'Clean modern warehouse interior' },

  // Condition — residential (Phase 1, Q4)
  new:               { imageUrl: '/intake/cards/condition-residential/new.jpg', imageAlt: 'Newly finished modern interior' },
  needs_refresh:     { imageUrl: '/intake/cards/condition-residential/needs-refresh.jpg', imageAlt: 'Lived-in apartment interior' },
  major_renovation:  { imageUrl: '/intake/cards/condition-residential/major-renovation.jpg', imageAlt: 'Dated kitchen ready for renovation' },
  shell:             { imageUrl: '/intake/cards/condition-residential/shell.jpg', imageAlt: 'Bare concrete shell interior' },

  // Condition — commercial (Phase 1, Q4)
  fitted:          { imageUrl: '/intake/cards/condition-commercial/fitted.jpg', imageAlt: 'Fully fitted office space' },
  semi_fitted:     { imageUrl: '/intake/cards/condition-commercial/semi-fitted.jpg', imageAlt: 'Partially fitted commercial space' },
  shell_and_core:  { imageUrl: '/intake/cards/condition-commercial/shell-and-core.jpg', imageAlt: 'Shell and core commercial space' },

  // Style preference (Phase 2)
  Modern:               { imageUrl: '/intake/cards/style/modern.jpg', imageAlt: 'Modern minimalist living room' },
  'Contemporary Arabic': { imageUrl: '/intake/cards/style/contemporary-arabic.jpg', imageAlt: 'Contemporary Arabic majlis interior' },
  Scandinavian:         { imageUrl: '/intake/cards/style/scandinavian.jpg', imageAlt: 'Scandi living room with light wood' },
  Industrial:           { imageUrl: '/intake/cards/style/industrial.jpg', imageAlt: 'Industrial loft with exposed brick' },
  Classic:              { imageUrl: '/intake/cards/style/classic.jpg', imageAlt: 'Classic traditional interior' },
  Maximalist:           { imageUrl: '/intake/cards/style/maximalist.jpg', imageAlt: 'Maximalist colourful interior' },
  Coastal:              { imageUrl: '/intake/cards/style/coastal.jpg', imageAlt: 'Coastal beach-inspired interior' },
  Minimalist:           { imageUrl: '/intake/cards/style/minimalist.jpg', imageAlt: 'Minimalist all-white interior' },

  // Flooring material (Phase 2)
  marble:          { imageUrl: '/intake/cards/flooring/marble.jpg', imageAlt: 'Polished marble floor' },
  porcelain:       { imageUrl: '/intake/cards/flooring/porcelain.jpg', imageAlt: 'Large format porcelain tiles' },
  engineered_wood: { imageUrl: '/intake/cards/flooring/engineered-wood.jpg', imageAlt: 'Engineered wood plank flooring' },
  vinyl:           { imageUrl: '/intake/cards/flooring/vinyl.jpg', imageAlt: 'Luxury vinyl plank flooring' },
  natural_stone:   { imageUrl: '/intake/cards/flooring/natural-stone.jpg', imageAlt: 'Natural stone floor tiles' },

  // Countertop material (Phase 2)
  quartz:          { imageUrl: '/intake/cards/countertops/quartz.jpg', imageAlt: 'White quartz kitchen countertop' },
  // marble already mapped above (flooring), same image works for countertops context
  porcelain_slab:  { imageUrl: '/intake/cards/countertops/porcelain-slab.jpg', imageAlt: 'Porcelain slab kitchen countertop' },
  granite:         { imageUrl: '/intake/cards/countertops/granite.jpg', imageAlt: 'Granite kitchen countertop' },
}

/**
 * Enrich a QR option with imageUrl/imageAlt from the static map if the option
 * doesn't already have one set. Called by the hook before passing cards-style
 * QR to the UI.
 */
export function enrichCardOption(
  option: { value: string; imageUrl?: string; imageAlt?: string }
): { imageUrl?: string; imageAlt?: string } {
  if (option.imageUrl) return { imageUrl: option.imageUrl, imageAlt: option.imageAlt }
  const entry = CARD_IMAGES[option.value]
  if (entry) return entry
  return {}
}
