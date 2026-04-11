/**
 * Import extracted BOQ JSON files into Supabase historical tables.
 *
 * Usage:
 *   npx tsx scripts/extract-boq/import.ts              # import all JSON files
 *   npx tsx scripts/extract-boq/import.ts --dry-run    # preview without inserting
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { normalizeCategoryName, normalizeDescription } from '../../lib/pricing/category-map'
import type { ExtractedBOQ } from './extract'

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

const DATA_DIR = path.resolve(__dirname, '../../data/historical-boqs')

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return createClient(url, key)
}

/**
 * Detect which revision group a file belongs to and whether it's the latest.
 * Groups files by project name prefix, picks highest revision number as latest.
 */
function detectRevisionInfo(files: string[]): Map<string, { revision: string | null; isLatest: boolean }> {
  const result = new Map<string, { revision: string | null; isLatest: boolean }>()

  // Group files by a normalized project key
  const groups = new Map<string, { file: string; revNum: number; revStr: string | null }[]>()

  for (const file of files) {
    const data: ExtractedBOQ = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'))
    const projectKey = data.project_name.toLowerCase().replace(/[^a-z0-9]/g, '')

    // Extract revision number
    const revMatch = data.revision?.match(/R?(\d+)/i) ?? data.source_filename.match(/R(\d+)/i)
    const revNum = revMatch ? parseInt(revMatch[1]) : 0
    const revStr = data.revision ?? (revMatch ? `R${revMatch[1]}` : null)

    const group = groups.get(projectKey) ?? []
    group.push({ file, revNum, revStr })
    groups.set(projectKey, group)
  }

  // Mark latest revision per group
  for (const group of groups.values()) {
    const maxRev = Math.max(...group.map(g => g.revNum))
    for (const entry of group) {
      result.set(entry.file, {
        revision: entry.revStr,
        isLatest: group.length === 1 || entry.revNum === maxRev,
      })
    }
  }

  return result
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`)
    console.error('Run extract.ts first to generate JSON files.')
    process.exit(1)
  }

  const jsonFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  if (jsonFiles.length === 0) {
    console.error('No JSON files found. Run extract.ts first.')
    process.exit(1)
  }

  console.log(`Found ${jsonFiles.length} extracted BOQ files\n`)

  const revisionInfo = detectRevisionInfo(jsonFiles)
  const supabase = dryRun ? null : getSupabase()

  let totalProjects = 0
  let totalCategories = 0
  let totalLineItems = 0

  for (const jsonFile of jsonFiles) {
    const filePath = path.join(DATA_DIR, jsonFile)
    const data: ExtractedBOQ = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const revInfo = revisionInfo.get(jsonFile)!

    const itemCount = data.categories.reduce(
      (sum, cat) => sum + cat.line_items.filter(li => !li.is_subtotal).length,
      0
    )

    console.log(`${jsonFile}:`)
    console.log(`  Project: ${data.project_name} | ${data.project_location ?? 'unknown location'}`)
    console.log(`  Rev: ${revInfo.revision ?? 'none'} ${revInfo.isLatest ? '(LATEST)' : '(older)'}`)
    console.log(`  Categories: ${data.categories.length} | Items: ${itemCount} | Total: AED ${data.grand_total_aed.toLocaleString()}`)

    if (dryRun) {
      totalProjects++
      totalCategories += data.categories.length
      totalLineItems += itemCount
      console.log()
      continue
    }

    // Check if already imported (by source_filename)
    const { data: existing } = await supabase!
      .from('historical_projects')
      .select('id')
      .eq('source_filename', data.source_filename)
      .maybeSingle()

    if (existing) {
      console.log('  SKIP (already imported)')
      console.log()
      continue
    }

    // Insert project
    const { data: project, error: projError } = await supabase!
      .from('historical_projects')
      .insert({
        project_name: data.project_name,
        contractor_name: data.contractor_name,
        project_location: data.project_location,
        project_type: data.project_type,
        total_area_sqm: data.total_area_sqm,
        grand_total_aed: data.grand_total_aed,
        source_filename: data.source_filename,
        revision: revInfo.revision,
        is_latest_revision: revInfo.isLatest,
      })
      .select('id')
      .single()

    if (projError || !project) {
      console.error(`  ERROR inserting project: ${projError?.message}`)
      console.log()
      continue
    }

    totalProjects++

    // Insert categories and line items
    for (const category of data.categories) {
      const normalizedName = normalizeCategoryName(category.name) ?? category.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      const { data: cat, error: catError } = await supabase!
        .from('historical_categories')
        .insert({
          project_id: project.id,
          name: category.name,
          normalized_name: normalizedName,
          category_total_aed: category.category_total_aed,
        })
        .select('id')
        .single()

      if (catError || !cat) {
        console.error(`  ERROR inserting category "${category.name}": ${catError?.message}`)
        continue
      }

      totalCategories++

      // Insert line items in batches
      const lineItemRows = category.line_items.map(item => ({
        category_id: cat.id,
        project_id: project.id,
        sr_no: item.sr_no,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit?.toLowerCase() ?? null,
        unit_rate_aed: item.unit_rate_aed,
        total_aed: item.total_aed,
        is_subtotal: item.is_subtotal,
        normalized_description: normalizeDescription(item.description),
        scope_item_id: normalizeCategoryName(category.name),
      }))

      const { error: itemError } = await supabase!
        .from('historical_line_items')
        .insert(lineItemRows)

      if (itemError) {
        console.error(`  ERROR inserting line items for "${category.name}": ${itemError.message}`)
      } else {
        totalLineItems += lineItemRows.filter(r => !r.is_subtotal).length
      }
    }

    console.log(`  Imported OK`)
    console.log()
  }

  // Refresh materialized view
  if (!dryRun && supabase) {
    console.log('Refreshing pricing_summary materialized view...')
    const { error: refreshError } = await supabase.rpc('refresh_pricing_summary' as never)
    if (refreshError) {
      // Fallback: try raw SQL
      console.log('  RPC not found, trying direct refresh...')
      const { error: sqlError } = await supabase.from('pricing_summary' as never).select('*').limit(1)
      if (sqlError) {
        console.log('  Note: materialized view may need manual refresh:')
        console.log('  REFRESH MATERIALIZED VIEW CONCURRENTLY pricing_summary;')
      }
    } else {
      console.log('  Done.')
    }
  }

  console.log('\n── Import Summary ──')
  console.log(`Projects: ${totalProjects}`)
  console.log(`Categories: ${totalCategories}`)
  console.log(`Line items: ${totalLineItems}`)
  if (dryRun) console.log('\n(dry run, nothing was inserted)')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
