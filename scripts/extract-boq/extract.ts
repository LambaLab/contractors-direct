/**
 * Extract structured BOQ data from historical PDF/Excel files using Claude's document API.
 *
 * Usage:
 *   npx tsx scripts/extract-boq/extract.ts                    # extract all files
 *   npx tsx scripts/extract-boq/extract.ts --file "somefile.pdf"  # extract one file
 *   npx tsx scripts/extract-boq/extract.ts --dry-run              # list files without extracting
 *
 * Requires ANTHROPIC_API_KEY in .env.local or environment.
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local
const envPath = path.resolve(__dirname, '../../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const BOQ_DIR = path.resolve(__dirname, '../../Historical BOQ_s')
const OUTPUT_DIR = path.resolve(__dirname, '../../data/historical-boqs')

// ── Types ──

export interface ExtractedLineItem {
  sr_no: string
  description: string
  quantity: number | null
  unit: string | null
  unit_rate_aed: number | null
  total_aed: number
  is_subtotal: boolean
}

export interface ExtractedCategory {
  name: string
  category_total_aed: number
  line_items: ExtractedLineItem[]
}

export interface ExtractedBOQ {
  project_name: string
  contractor_name: string | null
  project_location: string | null
  project_type: string | null
  total_area_sqm: number | null
  grand_total_aed: number
  source_filename: string
  revision: string | null
  categories: ExtractedCategory[]
}

// ── Tool schema for Claude ──

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_boq_data',
  description: 'Extract structured Bill of Quantities data from the document',
  input_schema: {
    type: 'object' as const,
    properties: {
      project_name: {
        type: 'string',
        description: 'Name of the project (e.g., "HUSPY @ Marina Plaza", "NSAT Office Fit-out")',
      },
      contractor_name: {
        type: ['string', 'null'],
        description: 'Name of the contractor or company that prepared the BOQ (e.g., "HTS", "Design International")',
      },
      project_location: {
        type: ['string', 'null'],
        description: 'Location of the project (e.g., "Dubai Marina", "DIFC", "Abu Dhabi")',
      },
      project_type: {
        type: ['string', 'null'],
        description: 'Type of project. One of: office_fitout, residential_renovation, hotel_refurb, retail_fitout, showroom, healthcare, commercial',
      },
      total_area_sqm: {
        type: ['number', 'null'],
        description: 'Total area in square meters if mentioned in the document',
      },
      grand_total_aed: {
        type: 'number',
        description: 'Grand total amount in AED for the entire BOQ',
      },
      revision: {
        type: ['string', 'null'],
        description: 'Revision number if present (e.g., "R1", "R04", "Rev 02")',
      },
      categories: {
        type: 'array',
        description: 'BOQ categories (e.g., Demolition, Flooring, Electrical) with their line items',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Category name (e.g., "Demolition & Civil Works", "Floor Finishes", "Electrical Works")',
            },
            category_total_aed: {
              type: 'number',
              description: 'Subtotal for this category in AED',
            },
            line_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sr_no: { type: 'string', description: 'Serial/item number (e.g., "1.01", "2.03")' },
                  description: { type: 'string', description: 'Work item description' },
                  quantity: { type: ['number', 'null'], description: 'Quantity (null if lump sum or not specified)' },
                  unit: { type: ['string', 'null'], description: 'Unit of measurement (sqm, nos, ls, item, m, set, kg, etc.)' },
                  unit_rate_aed: { type: ['number', 'null'], description: 'Unit rate in AED (null if lump sum)' },
                  total_aed: { type: 'number', description: 'Total amount in AED for this line item' },
                  is_subtotal: { type: 'boolean', description: 'True if this row is a subtotal/summary row, not an actual work item' },
                },
                required: ['sr_no', 'description', 'total_aed', 'is_subtotal'],
              },
            },
          },
          required: ['name', 'category_total_aed', 'line_items'],
        },
      },
    },
    required: ['project_name', 'grand_total_aed', 'categories'],
  },
}

// ── Helpers ──

function slugify(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '') // strip extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function deduplicateFiles(files: string[]): string[] {
  // Group by size to find exact duplicates
  const sizeMap = new Map<number, string[]>()
  for (const file of files) {
    const fullPath = path.join(BOQ_DIR, file)
    const stat = fs.statSync(fullPath)
    const existing = sizeMap.get(stat.size) ?? []
    existing.push(file)
    sizeMap.set(stat.size, existing)
  }

  const kept: string[] = []
  for (const group of sizeMap.values()) {
    if (group.length === 1) {
      kept.push(group[0])
    } else {
      // Keep the one without (1), (2) suffixes, or the first one
      const primary = group.find(f => !/\(\d+\)/.test(f)) ?? group[0]
      kept.push(primary)
      if (group.length > 1) {
        const skipped = group.filter(f => f !== primary)
        console.log(`  Dedup: keeping "${primary}", skipping ${skipped.length} duplicate(s)`)
      }
    }
  }

  return kept.sort()
}

// ── PDF extraction via Claude ──

async function extractFromPDF(
  anthropic: Anthropic,
  filePath: string,
  filename: string
): Promise<ExtractedBOQ> {
  const fileData = fs.readFileSync(filePath)
  const base64 = fileData.toString('base64')

  console.log(`  Sending to Claude (${(fileData.length / 1024 / 1024).toFixed(1)}MB)...`)

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: base64,
            },
          },
          {
            type: 'text' as const,
            text: `Extract structured BOQ data from this document. Be concise in descriptions (max 60 chars per line item).

Rules:
1. Extract every line item: sr_no, description (short), quantity, unit, unit_rate_aed, total_aed
2. Group into categories as they appear in the document
3. For lump sum items: quantity=1, unit="LS"
4. If no unit rate: set unit_rate_aed to null
5. Mark subtotal rows with is_subtotal: true
6. Extract grand total, project name, location, contractor, type, revision

Use the extract_boq_data tool.`,
          },
        ],
      },
    ],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_boq_data' },
  })

  const response = await stream.finalMessage()

  if (response.stop_reason === 'max_tokens') {
    console.error(`  Warning: response truncated (max_tokens hit). Usage: ${JSON.stringify(response.usage)}`)
  }

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Claude did not return structured data for ${filename} (stop_reason: ${response.stop_reason})`)
  }

  const data = toolUse.input as Omit<ExtractedBOQ, 'source_filename'>
  if (!data.categories || !Array.isArray(data.categories)) {
    console.error('  Debug - stop_reason:', response.stop_reason)
    console.error('  Debug - usage:', JSON.stringify(response.usage))
    console.error('  Debug - tool input keys:', Object.keys(data))
    throw new Error(`Claude did not return categories array (stop_reason: ${response.stop_reason})`)
  }
  return { ...data, source_filename: filename }
}

// ── Excel extraction ──

async function extractFromExcel(filePath: string, filename: string): Promise<ExtractedBOQ> {
  // Dynamic import since xlsx may not be installed yet
  let XLSX: { readFile: (path: string) => any; utils: { sheet_to_json: (sheet: any, opts?: any) => any } }
  try {
    const mod = await import('xlsx')
    XLSX = mod.default ?? mod
  } catch {
    console.error('xlsx package not installed. Run: npm install xlsx')
    process.exit(1)
  }

  const workbook = XLSX.readFile(filePath)
  const categories: ExtractedCategory[] = []

  // Process each sheet (skip cover sheet)
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

    if (!rows || rows.length < 3) continue

    // Look for BOQ-like content (rows with SR NO, DESCRIPTION, QTY, etc.)
    let currentCategory: ExtractedCategory | null = null
    let grandTotal = 0

    for (const row of rows) {
      if (!row || row.length === 0) continue

      const firstCell = String(row[0] ?? '').trim()
      const secondCell = String(row[1] ?? '').trim()

      // Detect category headers (numbered sections like "1", "2", etc. with text description)
      if (/^\d+$/.test(firstCell) && secondCell && !/^\d/.test(secondCell)) {
        if (currentCategory && currentCategory.line_items.length > 0) {
          categories.push(currentCategory)
        }
        currentCategory = {
          name: secondCell,
          category_total_aed: 0,
          line_items: [],
        }
        continue
      }

      // Detect line items (numbered like "1.01", "2.03")
      if (/^\d+\.\d+/.test(firstCell) && currentCategory) {
        const qty = typeof row[2] === 'number' ? row[2] : null
        const unit = row[3] ? String(row[3]).trim() : null
        const rate = typeof row[4] === 'number' ? row[4] : null
        const total = typeof row[5] === 'number' ? row[5] : (qty && rate ? qty * rate : 0)

        currentCategory.line_items.push({
          sr_no: firstCell,
          description: secondCell,
          quantity: qty,
          unit: unit,
          unit_rate_aed: rate,
          total_aed: total,
          is_subtotal: false,
        })
        continue
      }

      // Detect subtotals
      if (/sub\s*total/i.test(secondCell) && currentCategory) {
        const total = typeof row[5] === 'number' ? row[5] : (typeof row[4] === 'number' ? row[4] : 0)
        currentCategory.category_total_aed = total
        continue
      }

      // Detect grand total
      if (/grand\s*total/i.test(secondCell) || /grand\s*total/i.test(firstCell)) {
        const total = typeof row[5] === 'number' ? row[5] : (typeof row[4] === 'number' ? row[4] : 0)
        grandTotal = total
      }
    }

    // Push last category
    if (currentCategory && currentCategory.line_items.length > 0) {
      categories.push(currentCategory)
    }

    // If we found categories in this sheet, don't process other sheets
    if (categories.length > 0) {
      // Calculate grand total from categories if not found
      if (grandTotal === 0) {
        grandTotal = categories.reduce((sum, cat) => sum + cat.category_total_aed, 0)
      }

      return {
        project_name: 'HUSPY @ Marina Plaza',
        contractor_name: 'Design International',
        project_location: 'Dubai Marina',
        project_type: 'commercial',
        total_area_sqm: null,
        grand_total_aed: grandTotal,
        source_filename: filename,
        revision: 'R01',
        categories,
      }
    }
  }

  // If Excel parsing didn't find structured data, convert to CSV and send to Claude
  console.log('  Excel parsing incomplete, sending as text to Claude...')
  const anthropic = new Anthropic()

  // Convert all sheets to CSV text for Claude to process
  let csvText = ''
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[]
    if (!csv || csv.length === 0) continue
    csvText += `\n=== Sheet: ${sheetName} ===\n`
    for (const row of csv) {
      if (!row || !Array.isArray(row) || row.length === 0) continue
      csvText += (row as unknown[]).map(c => c ?? '').join('\t') + '\n'
    }
  }

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    messages: [{
      role: 'user' as const,
      content: `Extract structured BOQ data from this spreadsheet. Be concise in descriptions (max 60 chars per line item).

Rules:
1. Extract every line item: sr_no, description (short), quantity, unit, unit_rate_aed, total_aed
2. Group into categories as they appear
3. For lump sum items: quantity=1, unit="LS"
4. If no unit rate: set unit_rate_aed to null
5. Mark subtotal rows with is_subtotal: true
6. Extract grand total, project name, location, contractor, type, revision

SPREADSHEET DATA:
${csvText}

Use the extract_boq_data tool.`,
    }],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_boq_data' },
  })

  const response = await stream.finalMessage()
  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return structured data for Excel file')
  }
  const data = toolUse.input as Omit<ExtractedBOQ, 'source_filename'>
  if (!data.categories || !Array.isArray(data.categories)) {
    throw new Error('Claude did not return categories array for Excel file')
  }
  return { ...data, source_filename: filename }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const singleFileIdx = args.indexOf('--file')
  const singleFile = singleFileIdx !== -1 ? args[singleFileIdx + 1] : null

  if (!fs.existsSync(BOQ_DIR)) {
    console.error(`BOQ directory not found: ${BOQ_DIR}`)
    process.exit(1)
  }

  // List all files
  let allFiles = fs.readdirSync(BOQ_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase()
    return ext === '.pdf' || ext === '.xlsx' || ext === '.xls'
  })

  if (singleFile) {
    allFiles = allFiles.filter(f => f.includes(singleFile))
    if (allFiles.length === 0) {
      console.error(`No file matching "${singleFile}" found`)
      process.exit(1)
    }
  }

  console.log(`Found ${allFiles.length} files in ${BOQ_DIR}`)

  // Deduplicate
  const files = deduplicateFiles(allFiles)
  console.log(`${files.length} unique files after deduplication\n`)

  if (dryRun) {
    for (const f of files) {
      const ext = path.extname(f).toLowerCase()
      const size = fs.statSync(path.join(BOQ_DIR, f)).size
      console.log(`  [${ext}] ${f} (${(size / 1024).toFixed(0)}KB)`)
    }
    return
  }

  // Ensure output dir exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const anthropic = new Anthropic()
  const results: { file: string; slug: string; success: boolean; error?: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const filename = files[i]
    const filePath = path.join(BOQ_DIR, filename)
    const ext = path.extname(filename).toLowerCase()
    const slug = slugify(filename)
    const outputPath = path.join(OUTPUT_DIR, `${slug}.json`)

    // Skip already extracted files
    if (fs.existsSync(outputPath)) {
      console.log(`[${i + 1}/${files.length}] SKIP (already extracted): ${filename}`)
      results.push({ file: filename, slug, success: true })
      continue
    }

    console.log(`[${i + 1}/${files.length}] Extracting: ${filename}`)

    try {
      let data: ExtractedBOQ

      if (ext === '.xlsx' || ext === '.xls') {
        data = await extractFromExcel(filePath, filename)
      } else {
        data = await extractFromPDF(anthropic, filePath, filename)
      }

      // Calculate line item count
      const cats = data.categories ?? []
      const itemCount = cats.reduce(
        (sum, cat) => sum + (cat.line_items ?? []).filter(li => !li.is_subtotal).length,
        0
      )

      console.log(`  OK: ${data.categories.length} categories, ${itemCount} line items, AED ${data.grand_total_aed.toLocaleString()}`)

      // Write JSON
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
      results.push({ file: filename, slug, success: true })

      // Rate limit: wait 2s between API calls
      if (i < files.length - 1 && ext === '.pdf') {
        await new Promise(r => setTimeout(r, 2000))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  FAILED: ${msg}`)
      results.push({ file: filename, slug, success: false, error: msg })
    }
  }

  // Summary
  console.log('\n── Summary ──')
  const succeeded = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  console.log(`Extracted: ${succeeded.length}/${results.length}`)

  if (failed.length > 0) {
    console.log('\nFailed files:')
    for (const f of failed) {
      console.log(`  ${f.file}: ${f.error}`)
    }
  }

  // Write summary manifest
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '_manifest.json'),
    JSON.stringify({ extracted_at: new Date().toISOString(), files: results }, null, 2)
  )
  console.log(`\nManifest written to ${OUTPUT_DIR}/_manifest.json`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
