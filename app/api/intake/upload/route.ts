import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Intake file upload endpoint — signed upload URL pattern.
//
// Why signed URLs: Vercel serverless has a ~4.5 MB body limit, but floor plans
// and CAD files can be 20-50 MB. Instead of routing the file through this API,
// the client asks for a signed upload URL, uploads directly to Supabase Storage,
// then POSTs back to `register` the upload against the lead's metadata.
//
// Request modes:
//   POST /api/intake/upload?action=sign        → Request a signed upload URL.
//     Body: { leadId, sessionId, filename, sizeBytes, mimeType, purpose? }
//     Returns: { uploadUrl, token, path }
//
//   POST /api/intake/upload?action=register    → Register a successfully uploaded file.
//     Body: { leadId, sessionId, path, filename, mimeType, sizeBytes, purpose? }
//     Returns: { file }
//
//   POST /api/intake/upload?action=list        → List existing files for a lead.
//     Body: { leadId, sessionId }
//     Returns: { files }
//
//   DELETE /api/intake/upload                  → Remove an uploaded file.
//     Body: { leadId, sessionId, path }
//
// Ownership is validated on every call by matching (leadId, sessionId) against
// the leads table — same pattern as /api/intake/sync-messages. There is no
// browser auth session in this app.

export const maxDuration = 60
export const runtime = 'nodejs'

const BUCKET = 'intake-documents'
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/vnd.dwg',
  'application/acad',
  'application/x-acad',
  'application/autocad_dwg',
  'application/dwg',
  'application/x-dwg',
  'application/octet-stream',
])
const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|heic|dwg|dxf)$/i

type UploadedFile = {
  path: string
  filename: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  purpose?: string
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || 'file'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

async function validateLeadOwnership(leadId: string, sessionId: string) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('leads')
    .select('id, metadata')
    .eq('id', leadId)
    .eq('session_id', sessionId)
    .single()
  if (error || !data) return null
  return data as { id: string; metadata: Record<string, unknown> | null }
}

function getExistingFiles(metadata: Record<string, unknown> | null): UploadedFile[] {
  const raw = metadata?.uploaded_files
  return Array.isArray(raw) ? (raw as UploadedFile[]) : []
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'sign'

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const leadId = String(body.leadId || '')
  const sessionId = String(body.sessionId || '')

  if (!leadId || !sessionId) {
    return NextResponse.json({ error: 'Missing leadId or sessionId' }, { status: 400 })
  }

  const lead = await validateLeadOwnership(leadId, sessionId)
  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
  }

  const supabase = createServiceClient()

  // ── LIST: return files already uploaded for this lead ──
  if (action === 'list') {
    return NextResponse.json({ files: getExistingFiles(lead.metadata) })
  }

  // ── SIGN: create a signed upload URL the client can PUT a file to ──
  if (action === 'sign') {
    const filename = typeof body.filename === 'string' ? body.filename : ''
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
    }
    if (sizeBytes <= 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }
    if (sizeBytes > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 })
    }
    const mimeOk = mimeType && ALLOWED_MIME.has(mimeType.toLowerCase())
    const extOk = ALLOWED_EXT.test(filename)
    if (!mimeOk && !extOk) {
      return NextResponse.json({ error: `Unsupported file type: ${mimeType || 'unknown'}` }, { status: 400 })
    }

    // Soft cap: 10 files per lead
    const existingCount = getExistingFiles(lead.metadata).length
    if (existingCount >= 10) {
      return NextResponse.json({ error: 'Maximum 10 files per lead reached' }, { status: 400 })
    }

    const safeName = sanitizeFilename(filename)
    const storagePath = `${leadId}/${Date.now()}_${safeName}`

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)

    if (signError || !signed) {
      console.error('[upload] createSignedUploadUrl failed:', signError?.message)
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl: signed.signedUrl,
      token: signed.token,
      path: storagePath,
    })
  }

  // ── REGISTER: record a successful upload in leads.metadata ──
  if (action === 'register') {
    const path = typeof body.path === 'string' ? body.path : ''
    const filename = typeof body.filename === 'string' ? body.filename : ''
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0
    const purpose = typeof body.purpose === 'string' ? body.purpose : 'floor_plans'

    if (!path || !path.startsWith(`${leadId}/`)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    if (!filename) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
    }

    // Verify the file actually landed in storage before recording it.
    const { data: existsData, error: existsError } = await supabase.storage
      .from(BUCKET)
      .list(leadId, {
        search: path.split('/').pop() || '',
      })
    if (existsError || !existsData || existsData.length === 0) {
      return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 404 })
    }

    const uploaded: UploadedFile = {
      path,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes,
      uploadedAt: new Date().toISOString(),
      purpose,
    }

    const existingFiles = getExistingFiles(lead.metadata)
    const newMetadata = {
      ...(lead.metadata || {}),
      uploaded_files: [...existingFiles, uploaded],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('leads')
      .update({ metadata: newMetadata, saved_at: new Date().toISOString() })
      .eq('id', leadId)

    if (updateError) {
      console.error('[upload] leads.metadata update failed:', updateError.message)
      return NextResponse.json({ error: 'Failed to record upload' }, { status: 500 })
    }

    return NextResponse.json({ file: uploaded })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// DELETE /api/intake/upload — remove an uploaded file
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const leadId = String(body.leadId || '')
  const sessionId = String(body.sessionId || '')
  const path = String(body.path || '')

  if (!leadId || !sessionId || !path) {
    return NextResponse.json({ error: 'Missing leadId, sessionId, or path' }, { status: 400 })
  }
  // Guard against path traversal: path must start with the lead's own folder.
  if (!path.startsWith(`${leadId}/`)) {
    return NextResponse.json({ error: 'Path does not belong to this lead' }, { status: 403 })
  }
  const lead = await validateLeadOwnership(leadId, sessionId)
  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path])
  if (removeError) {
    console.error('[upload] storage remove failed:', removeError.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  const existingFiles = getExistingFiles(lead.metadata)
  const newFiles = existingFiles.filter((f) => f.path !== path)
  const newMetadata = {
    ...(lead.metadata || {}),
    uploaded_files: newFiles,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('leads')
    .update({ metadata: newMetadata, saved_at: new Date().toISOString() })
    .eq('id', leadId)

  return NextResponse.json({ success: true })
}
