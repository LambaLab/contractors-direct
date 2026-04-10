'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, FileText, Clock } from 'lucide-react'
import type { UploadedFile } from '@/lib/intake-types'

type Props = {
  leadId: string
  sessionId: string
  purpose: 'floor_plans' | 'site_photos'
  existingFiles: UploadedFile[]
  completed?: boolean
  onFileUploaded: (file: UploadedFile) => void
  onDone: () => void
  onSkip: () => void
}

type LocalUpload = {
  id: string
  file: File
  status: 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  path?: string
}

const MAX_BYTES = 50 * 1024 * 1024
const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.heic,.dwg,.dxf,application/pdf,image/png,image/jpeg,image/webp,image/heic'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileUploadWidget({
  leadId,
  sessionId,
  purpose,
  existingFiles,
  completed = false,
  onFileUploaded,
  onDone,
  onSkip,
}: Props) {
  const [uploads, setUploads] = useState<LocalUpload[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const purposeLabel = purpose === 'site_photos' ? 'Share site photos' : 'Upload floor plans or CAD files'
  const purposeHint = purpose === 'site_photos'
    ? 'Photos of the space help contractors understand the condition. JPG, PNG, or HEIC.'
    : 'CAD or architectural drawings preferred, PDFs work fine too. Up to 50 MB per file.'

  const hasAnySuccess = existingFiles.length > 0 || uploads.some((u) => u.status === 'done')

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (completed) return
      const arr = Array.from(files)
      if (arr.length === 0) return

      for (const file of arr) {
        if (file.size > MAX_BYTES) {
          setUploads((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              file,
              status: 'error',
              progress: 0,
              error: 'File exceeds 50 MB limit',
            },
          ])
          continue
        }
        const uploadId = crypto.randomUUID()
        setUploads((prev) => [
          ...prev,
          { id: uploadId, file, status: 'uploading', progress: 0 },
        ])

        try {
          // 1. Ask the server for a signed upload URL
          const signRes = await fetch('/api/intake/upload?action=sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId,
              sessionId,
              filename: file.name,
              sizeBytes: file.size,
              mimeType: file.type || 'application/octet-stream',
              purpose,
            }),
          })
          if (!signRes.ok) {
            const err = (await signRes.json().catch(() => ({ error: 'Failed to get upload URL' }))) as {
              error?: string
            }
            throw new Error(err.error || 'Failed to get upload URL')
          }
          const { uploadUrl, path } = (await signRes.json()) as {
            uploadUrl: string
            token: string
            path: string
          }

          // 2. PUT the file directly to Supabase Storage
          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
          })
          if (!putRes.ok) {
            throw new Error(`Upload failed (${putRes.status})`)
          }

          // 3. Register the upload with our API so it lands in leads.metadata
          const regRes = await fetch('/api/intake/upload?action=register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId,
              sessionId,
              path,
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              purpose,
            }),
          })
          if (!regRes.ok) {
            const err = (await regRes.json().catch(() => ({ error: 'Register failed' }))) as {
              error?: string
            }
            throw new Error(err.error || 'Register failed')
          }
          const { file: uploaded } = (await regRes.json()) as { file: UploadedFile }

          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'done', progress: 100, path } : u
            )
          )
          onFileUploaded(uploaded)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed'
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: msg } : u
            )
          )
        }
      }
    },
    [leadId, sessionId, purpose, onFileUploaded, completed]
  )

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = '' // allow re-selecting the same file
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (completed) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!completed) setIsDragging(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  // Completed state: collapsed summary
  if (completed) {
    return (
      <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] bg-[var(--ov-surface-subtle,rgba(255,255,255,0.03))] p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--ov-text-muted,#727272)]">
          {existingFiles.length > 0 ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                {existingFiles.length} {existingFiles.length === 1 ? 'file' : 'files'} uploaded
              </span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              <span>You can share files with your account manager later.</span>
            </>
          )}
        </div>
        {existingFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {existingFiles.map((f) => (
              <li key={f.path} className="flex items-center gap-2 text-xs text-[var(--ov-text,#ffffff)]">
                <FileText className="w-3.5 h-3.5 text-[var(--ov-text-muted,#727272)]" />
                <span className="truncate">{f.filename}</span>
                <span className="text-[var(--ov-text-muted,#727272)] flex-shrink-0">
                  {formatBytes(f.sizeBytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] bg-[var(--ov-surface-subtle,rgba(255,255,255,0.03))] p-4 space-y-3">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-[var(--ov-text,#ffffff)]">{purposeLabel}</p>
        <p className="text-xs text-[var(--ov-text-muted,#727272)] mt-0.5">{purposeHint}</p>
      </div>

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`w-full rounded-xl border-2 border-dashed px-4 py-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
          isDragging
            ? 'border-brand-purple bg-[var(--ov-accent-soft,rgba(115,103,255,0.08))]'
            : 'border-[var(--ov-border,rgba(255,255,255,0.12))] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))]'
        }`}
      >
        <Upload className="w-5 h-5 text-[var(--ov-text-muted,#727272)]" />
        <p className="text-xs text-[var(--ov-text,#ffffff)]">
          <span className="text-brand-purple font-medium">Click to upload</span>
          <span className="text-[var(--ov-text-muted,#727272)]"> or drag and drop</span>
        </p>
        <p className="text-[10px] text-[var(--ov-text-muted,#727272)]">PDF, DWG, JPG, PNG up to 50 MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onInputChange}
          className="hidden"
        />
      </button>

      {/* Existing files (from previous session) */}
      {existingFiles.length > 0 && (
        <ul className="space-y-1.5">
          {existingFiles.map((f) => (
            <li
              key={f.path}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--ov-surface-subtle,rgba(255,255,255,0.04))]"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-[var(--ov-text,#ffffff)] truncate flex-1">{f.filename}</span>
              <span className="text-[10px] text-[var(--ov-text-muted,#727272)] flex-shrink-0">
                {formatBytes(f.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Active uploads (this session) */}
      {uploads.length > 0 && (
        <ul className="space-y-1.5">
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--ov-surface-subtle,rgba(255,255,255,0.04))]"
            >
              {u.status === 'uploading' && (
                <div className="w-4 h-4 rounded-full border-2 border-brand-purple border-t-transparent animate-spin flex-shrink-0" />
              )}
              {u.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
              {u.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--ov-text,#ffffff)] truncate">{u.file.name}</p>
                {u.status === 'error' && (
                  <p className="text-[10px] text-red-400 truncate">{u.error}</p>
                )}
              </div>
              <span className="text-[10px] text-[var(--ov-text-muted,#727272)] flex-shrink-0">
                {formatBytes(u.file.size)}
              </span>
              {u.status === 'error' && (
                <button
                  type="button"
                  onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                  className="text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)]"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 px-3 py-2 rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-border,rgba(255,255,255,0.20))] transition-colors cursor-pointer"
        >
          Share later
        </button>
        {hasAnySuccess && (
          <button
            type="button"
            onClick={onDone}
            className="flex-1 px-3 py-2 rounded-xl bg-brand-purple text-brand-dark text-xs font-medium hover:bg-brand-purple/90 transition-colors cursor-pointer"
          >
            I&apos;m done uploading
          </button>
        )}
      </div>
    </div>
  )
}
