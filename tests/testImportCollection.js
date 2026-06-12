/**
 * testImportCollection.js
 *
 * Standalone test for the Discogs importCollection flow.
 * Run with: node api/tests/testImportCollection.js
 *
 * Set DISCOGS_USERNAME and USER_ID before running.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const pool = require('../config/dbconfig')

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DISCOGS_USERNAME = 'YOUR_NAME'   // <-- change this
const USER_ID          = 0                          // <-- change to Groovist users_id
const DRY_RUN          = true                       // true = no DB writes, just logs
// ─────────────────────────────────────────────────────────────────────────────

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE  = 'https://api.discogs.com'
const PER_PAGE      = 100

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Fetch one page of the user's Discogs collection ──────────────────────────
async function fetchCollectionPage(username, page) {
    const url = `${DISCOGS_BASE}/users/${username}/collection/folders/0/releases?page=${page}&per_page=${PER_PAGE}&token=${DISCOGS_TOKEN}`
    log(`→ GET ${url}`)
    const res = await fetch(url, { headers: { 'User-Agent': 'Groovist/1.0 +https://groovist.co' } })
    log(`← status ${res.status}`)
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Discogs collection fetch failed (${res.status}): ${text}`)
    }
    return res.json()
}

// ── Fetch a single release from Discogs ──────────────────────────────────────
async function fetchRelease(discogsId) {
    const url = `${DISCOGS_BASE}/releases/${discogsId}?token=${DISCOGS_TOKEN}`
    log(`  → GET release ${discogsId}`)
    const res = await fetch(url, { headers: { 'User-Agent': 'Groovist/1.0 +https://groovist.co' } })
    log(`  ← release ${discogsId} status ${res.status}`)
    if (!res.ok) return null
    return res.json()
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    log('=== Discogs Import Test ===')
    log(`User ID:          ${USER_ID}`)
    log(`Discogs Username: ${DISCOGS_USERNAME}`)
    log(`Dry Run:          ${DRY_RUN}`)
    log(`DISCOGS_TOKEN:    ${DISCOGS_TOKEN ? 'present ✓' : 'MISSING ✗'}`)
    log('')

    if (!DISCOGS_TOKEN) {
        log('ERROR: DISCOGS_TOKEN not set in .env')
        process.exit(1)
    }
    if (!DISCOGS_USERNAME || DISCOGS_USERNAME === 'YOUR_DISCOGS_USERNAME') {
        log('ERROR: Set DISCOGS_USERNAME at the top of this file')
        process.exit(1)
    }
    if (!USER_ID) {
        log('ERROR: Set USER_ID at the top of this file')
        process.exit(1)
    }

    // ── Step 1: Check how many Discogs albums the user already has ────────────
    log('Step 1: Checking existing Discogs albums in Groovist for this user...')
    const [[{ already_imported }]] = await pool.query(
        `SELECT COUNT(*) AS already_imported
         FROM user_albums ua
         JOIN albums a ON ua.album_id = a.album_id
         WHERE ua.users_id = ? AND a.source = 'discogs'`,
        [USER_ID]
    )
    log(`  already_imported = ${already_imported}`)
    const resumePage = already_imported > 0 ? Math.floor(already_imported / PER_PAGE) + 1 : 1
    log(`  resume page = ${resumePage}`)
    log('')

    // ── Step 2: Fetch the resume page from Discogs ────────────────────────────
    log(`Step 2: Fetching page ${resumePage} from Discogs...`)
    let firstPage
    try {
        firstPage = await fetchCollectionPage(DISCOGS_USERNAME, resumePage)
    } catch (err) {
        log(`ERROR fetching collection page: ${err.message}`)
        await pool.end()
        process.exit(1)
    }

    const total      = firstPage.pagination.items
    const totalPages = firstPage.pagination.pages
    log(`  total albums in Discogs collection: ${total}`)
    log(`  total pages: ${totalPages}`)
    log(`  releases on this page: ${firstPage.releases?.length}`)
    log('')

    if (resumePage > totalPages) {
        log('RESULT: All pages already imported. Nothing left to do.')
        await pool.end()
        return
    }

    // ── Step 3: Process the first release on the page as a sample ────────────
    log('Step 3: Sampling first release on this page...')
    const sample = firstPage.releases[0]
    const discogsId = sample?.basic_information?.id || sample?.id
    log(`  first item discogsId = ${discogsId}`)
    log(`  title = ${sample?.basic_information?.title || sample?.title}`)
    log('')

    // ── Step 4: Check if sample album exists in Groovist albums table ─────────
    log('Step 4: Checking if sample album exists in albums table...')
    const [existingAlbum] = await pool.query(
        `SELECT album_id, title FROM albums WHERE discogs_id = ?`,
        [discogsId]
    )
    if (existingAlbum.length > 0) {
        log(`  EXISTS in albums table → album_id=${existingAlbum[0].album_id} title="${existingAlbum[0].title}"`)
    } else {
        log(`  NOT in albums table — would fetch from Discogs API and insert`)
        if (!DRY_RUN) {
            log('  (skipping actual insert in this test)')
        }
    }
    log('')

    // ── Step 5: Check if sample is in user's collection ───────────────────────
    if (existingAlbum.length > 0) {
        log('Step 5: Checking if sample album is in user collection...')
        const [existingUserAlbum] = await pool.query(
            `SELECT user_album_id FROM user_albums WHERE users_id = ? AND album_id = ?`,
            [USER_ID, existingAlbum[0].album_id]
        )
        if (existingUserAlbum.length > 0) {
            log(`  ALREADY in user collection → user_album_id=${existingUserAlbum[0].user_album_id}`)
        } else {
            log(`  NOT in user collection — would be added`)
        }
        log('')
    }

    // ── Step 6: Full scan summary using BULK queries ─────────────────────────
    log(`Step 6: Bulk-scanning all ${firstPage.releases.length} releases on page ${resumePage}...`)
    const t6start = Date.now()

    const allIds = firstPage.releases
        .map(item => item.basic_information?.id || item.id)
        .filter(Boolean)

    const placeholders = allIds.map(() => '?').join(',')
    const [albumRows] = await pool.query(
        `SELECT album_id, discogs_id FROM albums WHERE discogs_id IN (${placeholders})`,
        allIds
    )
    const albumMap = {}
    for (const row of albumRows) albumMap[row.discogs_id] = row.album_id
    const knownIds = Object.values(albumMap)

    let inUserCollection = 0
    const userOwnedSet = new Set()
    if (knownIds.length > 0) {
        const idPlaceholders = knownIds.map(() => '?').join(',')
        const [userRows] = await pool.query(
            `SELECT album_id FROM user_albums WHERE users_id = ? AND album_id IN (${idPlaceholders})`,
            [USER_ID, ...knownIds]
        )
        for (const row of userRows) {
            userOwnedSet.add(row.album_id)
            inUserCollection++
        }
    }

    const inDb     = albumRows.length
    const notInDb  = allIds.length - inDb
    const wouldImport = notInDb + (inDb - inUserCollection)
    log(`  Bulk queries completed in ${Date.now() - t6start}ms`)

    log(`  Albums already in Groovist DB:       ${inDb}`)
    log(`  Albums NOT yet in Groovist DB:        ${notInDb}`)
    log(`  Already in user's collection:         ${inUserCollection}`)
    log(`  Would be imported this batch:         ${wouldImport}`)
    log('')
    log(`  Pages remaining after this batch:     ${totalPages - resumePage}`)
    log(`  Estimated albums remaining:           ~${(totalPages - resumePage) * PER_PAGE}`)
    log('')

    if (wouldImport === 0 && (totalPages - resumePage) === 0) {
        log('RESULT: Collection is fully imported.')
    } else if (wouldImport === 0) {
        log('RESULT: This page has nothing new — resume page calculation may be off.')
        log(`  already_imported=${already_imported}, resumePage=${resumePage}, totalPages=${totalPages}`)
        log('  Try checking if the Discogs collection order has changed.')
    } else {
        log(`RESULT: Ready to import. ${wouldImport} new albums on page ${resumePage}, ~${(totalPages - resumePage) * PER_PAGE} more across remaining pages.`)
    }

    await pool.end()
}

main().catch(err => {
    log(`FATAL: ${err.message}`)
    console.error(err)
    process.exit(1)
})
