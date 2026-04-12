export type StyleInfo = {
  key: string
  label: string
  imageUrl: string
  tagline: string
  description: string
  materials: string[]
  finishes: string[]
  bestFor: string
}

/**
 * Rich style data for the 8 aesthetic tiers, ordered from lowest to highest multiplier.
 * Used by the style spectrum bar modal to explain what each tier includes.
 */
export const STYLE_INFO_ORDERED: StyleInfo[] = [
  {
    key: 'minimalist',
    label: 'Minimalist',
    imageUrl: '/intake/cards/style/minimalist.jpg',
    tagline: 'Less is more',
    description: 'A pared-back approach that prioritises function and open space. Every element earns its place, with clean geometry and a restrained palette keeping things calm and clutter-free.',
    materials: [
      'Laminate or melamine cabinets',
      'Basic quartz or solid-surface countertops',
      'Standard chrome fixtures',
      'Vinyl or porcelain tile flooring',
    ],
    finishes: [
      'Matte white and light neutrals',
      'Flush, handleless cabinetry',
      'No ornamentation or mouldings',
      'Recessed lighting throughout',
    ],
    bestFor: 'Budget-conscious projects, rental properties, or anyone who values simplicity over decoration.',
  },
  {
    key: 'scandinavian',
    label: 'Scandinavian',
    imageUrl: '/intake/cards/style/scandinavian.jpg',
    tagline: 'Warm and functional',
    description: 'Light-filled spaces with a cozy undertone. Natural materials meet soft curves and thoughtful storage, creating rooms that feel welcoming without excess.',
    materials: [
      'Light oak or birch veneers',
      'Engineered timber flooring',
      'Ceramic or matte porcelain tile',
      'Simple brushed-steel hardware',
    ],
    finishes: [
      'Warm whites and soft greys',
      'Matte wood-grain textures',
      'Rounded edges and soft profiles',
      'Woven textiles and natural fibres',
    ],
    bestFor: 'Family homes and apartments that need to feel lived-in, warm, and organised.',
  },
  {
    key: 'coastal',
    label: 'Coastal',
    imageUrl: '/intake/cards/style/coastal.jpg',
    tagline: 'Relaxed and airy',
    description: 'Inspired by the shore, this style uses natural textures and a soft blue-white palette to create spaces that breathe. Materials are chosen for durability in humid climates.',
    materials: [
      'Stone or large-format porcelain floors',
      'Shaker-style cabinets',
      'Brushed nickel or brass fixtures',
      'Natural stone or quartz countertops',
    ],
    finishes: [
      'Soft blues, sandy neutrals, crisp whites',
      'Whitewashed or weathered wood accents',
      'Rattan and wicker details',
      'Sheer curtains and natural light emphasis',
    ],
    bestFor: 'Waterfront properties, beach villas, or anyone seeking a calm, resort-inspired atmosphere.',
  },
  {
    key: 'modern',
    label: 'Modern',
    imageUrl: '/intake/cards/style/modern.jpg',
    tagline: 'Clean but refined',
    description: 'The baseline for quality renovation. Sleek surfaces meet balanced contrast with materials that look premium without over-investing. A safe, versatile choice for most projects.',
    materials: [
      'Mid-range quartz countertops',
      'Flat-panel or slab-door cabinetry',
      'Matte black or brushed brass hardware',
      'Engineered wood or porcelain flooring',
    ],
    finishes: [
      'Two-tone palettes (dark + light contrast)',
      'Subtle textures and grain patterns',
      'Integrated handles and push-to-open',
      'Layered lighting (ambient + task + accent)',
    ],
    bestFor: 'Most residential renovations where you want a polished result at a balanced cost.',
  },
  {
    key: 'industrial',
    label: 'Industrial',
    imageUrl: '/intake/cards/style/industrial.jpg',
    tagline: 'Raw and urban',
    description: 'Celebrates exposed structure and honest materials. Concrete, metal, and reclaimed wood come together for a loft-like aesthetic that feels authentic and lived-in.',
    materials: [
      'Polished concrete or cement-look floors',
      'Open metal shelving and frames',
      'Reclaimed or distressed wood surfaces',
      'Exposed ductwork and conduit lighting',
    ],
    finishes: [
      'Charcoal, iron grey, and warm rust tones',
      'Raw metal and matte black surfaces',
      'Edison-style or filament lighting',
      'Visible brick or textured wall treatments',
    ],
    bestFor: 'Lofts, studios, commercial spaces, or homes that embrace a utilitarian edge.',
  },
  {
    key: 'contemporary_arabic',
    label: 'Contemporary Arabic',
    imageUrl: '/intake/cards/style/contemporary-arabic.jpg',
    tagline: 'Heritage meets modernity',
    description: 'Geometric patterns and rich earth tones grounded in regional craft. Traditional motifs are reinterpreted through clean lines and modern proportions, giving spaces a distinct sense of place.',
    materials: [
      'Marble or natural stone accents',
      'Brass and gold-tone fixtures',
      'Custom joinery with arabesque detailing',
      'Premium porcelain or zellige tile',
    ],
    finishes: [
      'Deep earth tones with gold accents',
      'Geometric lattice (mashrabiya) screens',
      'Carved or laser-cut wood panels',
      'Textured plaster and stucco walls',
    ],
    bestFor: 'UAE villas and residences that want to honour regional identity with a modern sensibility.',
  },
  {
    key: 'classic',
    label: 'Classic',
    imageUrl: '/intake/cards/style/classic.jpg',
    tagline: 'Timeless elegance',
    description: 'Rich materials and time-tested proportions. Symmetry, mouldings, and warm wood tones create rooms that feel established and refined, built to age gracefully.',
    materials: [
      'Natural stone countertops (marble, granite)',
      'Solid wood or raised-panel cabinetry',
      'Polished brass or antique-finish hardware',
      'Hardwood or premium marble flooring',
    ],
    finishes: [
      'Crown mouldings and decorative cornices',
      'Wainscoting and wall panelling',
      'Rich, warm colour palettes',
      'Crystal or classic pendant lighting',
    ],
    bestFor: 'Homeowners who value traditional craftsmanship, formal spaces, and enduring design.',
  },
  {
    key: 'maximalist',
    label: 'Maximalist',
    imageUrl: '/intake/cards/style/maximalist.jpg',
    tagline: 'Make a statement',
    description: 'Bold, layered, and unapologetically expressive. Every surface is an opportunity for pattern, texture, or a curated piece. This tier uses the finest materials and bespoke fabrication.',
    materials: [
      'Custom joinery and bespoke cabinetry',
      'Premium marble or natural stone throughout',
      'Designer fixtures and artisan hardware',
      'Bespoke or imported lighting',
    ],
    finishes: [
      'Bold patterns and mixed textures',
      'Metallic accents (gold, brass, copper)',
      'Statement wallpaper or hand-painted murals',
      'Feature pieces and curated art integration',
    ],
    bestFor: 'Luxury villas, penthouses, and spaces designed to impress and express personality.',
  },
]

/** Lookup a style by its key (case-insensitive, space-to-underscore). */
export function getStyleInfo(key: string): StyleInfo | undefined {
  const normalised = key.toLowerCase().replace(/\s+/g, '_')
  return STYLE_INFO_ORDERED.find(s => s.key === normalised)
}
