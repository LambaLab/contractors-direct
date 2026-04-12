export type QuickReplyOption = {
  label: string
  description?: string
  icon?: string
  value: string
  /** Only used when QuickReplies.style === 'cards'. Path under /public (e.g. "/intake/cards/property-type/villa.jpg"). */
  imageUrl?: string
  /** Only used when QuickReplies.style === 'cards'. Short accessibility text. */
  imageAlt?: string
}

export type QuickReplies = {
  style: 'list' | 'pills' | 'cards' | 'sqft' | 'budget' | 'scope_grid'
  multiSelect?: boolean
  allowCustom?: boolean
  options: QuickReplyOption[]
  /** For scope_grid style only. Limits the grid to items relevant to this project context (e.g. "kitchen", "bathroom"). If empty or absent, all items are shown. */
  scopeContext?: string
}

/**
 * A file uploaded via the intake FileUploadWidget. Stored in the intake-documents
 * Supabase Storage bucket and referenced in leads.metadata.uploaded_files.
 */
export type UploadedFile = {
  /** Storage path, e.g. "{leadId}/1712345678_floorplan.pdf" */
  path: string
  /** Original filename as chosen by the user */
  filename: string
  mimeType: string
  sizeBytes: number
  /** ISO timestamp */
  uploadedAt: string
  /** Which prompt triggered the upload */
  purpose?: 'floor_plans' | 'site_photos' | string
}
