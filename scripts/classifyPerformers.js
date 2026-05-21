/**
 * classifyPerformers.js
 * Hits the Discogs API for each performer in the database and
 * classifies them as either 'artist' or 'band' based
 * on the Discogs artist type field
 *
 * Also saves the Discogs artist ID for use in subsequent scripts
 *
 * Run with: node scripts/classifyPerformers.js
 *
 * DISCOGS API TYPES:
 * - 'person'               => artist
 * - 'group'                => band
 * - 'orchestra', 'choir'   => band
 * - 'unknown'              => leave as is
 */

require('dotenv').config()
const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DELAY_MS = 1100

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const searchDiscogs = async (name) => {
    try {
        // Step 1 — search for the artist
        const searchUrl = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(name)}&type=artist&token=${DISCOGS_TOKEN}`
        const searchResponse = await fetch(searchUrl)

        if (searchResponse.status === 429) {
            console.log('Rate limited — waiting 60s...')
            await sleep(60000)
            return searchDiscogs(name)
        }

        if (!searchResponse.ok) return null

        const searchData = await searchResponse.json()
        if (!searchData.results || searchData.results.length === 0) return null

        const exactMatch = searchData.results.find(
            r => r.title?.toLowerCase() === name.toLowerCase()
        )
        const bestMatch = exactMatch || searchData.results[0]

        await sleep(DELAY_MS) // rate limit between requests

        // Step 2 — fetch full artist profile to get actual type
        const artistUrl = `${DISCOGS_BASE}/artists/${bestMatch.id}?token=${DISCOGS_TOKEN}`
        const artistResponse = await fetch(artistUrl)

        if (artistResponse.status === 429) {
            console.log('Rate limited — waiting 60s...')
            await sleep(60000)
            return searchDiscogs(name)
        }

        if (!artistResponse.ok) return { ...bestMatch, type: 'unknown' }

        const artistData = await artistResponse.json()

        // Return combined data with correct type and members
        return {
            id: bestMatch.id,
            title: bestMatch.title,
            type: artistData.type || 'unknown',  // ← actual type from artist profile
            profile: artistData.profile || '',
            images: artistData.images || [],
            members: artistData.members || [],
            groups: artistData.groups || [],
        }

    } catch (err) {
        console.error(`Failed to search Discogs for "${name}":`, err.message)
        return null
    }
}

const classifyPerformers = async () => {
    console.log('Starting performer classification')
    console.log('==================================')

    const con = await pool.getConnection()

    try {
        // Fetch all performers currently classified as artist
        // that don't have a discogs_id yet
        const [performers] = await con.execute(
            `SELECT
                p.performer_id,
                p.performer_type,
                ar.artist_id,
                ar.alias,
                ar.first_name,
                ar.last_name,
                ar.discogs_id
            FROM performers p
            JOIN artists ar ON p.performer_id = ar.performer_id
            WHERE p.performer_type = 'artist'
            AND ar.discogs_id IS NULL`
        )

        console.log(`Found ${performers.length} performers to check\n`)

        let updatedToBand = 0
        let leftAsArtist = 0
        let skipped = 0
        let errors = 0

        for (let i = 0; i < performers.length; i++) {
            const performer = performers[i]
            const name = performer.alias ||
                `${performer.first_name || ''} ${performer.last_name || ''}`.trim()

            if (!name) {
                console.log(`[${i + 1}/${performers.length}] Skipping — no name found`)
                skipped++
                continue
            }

            process.stdout.write(`[${i + 1}/${performers.length}] Checking "${name}"...`)

            const result = await searchDiscogs(name)

            if (!result) {
                console.log(' Not found — skipping')
                skipped++
                await sleep(DELAY_MS)
                continue
            }

            const discogsType = result.type
            const discogsId = result.id

            const isBand = ['group', 'orchestra', 'choir'].includes(result.type) || result.members?.length > 0

            if (isBand) {
                try {
                    await con.beginTransaction()

                    // Update performer_type to band
                    await con.execute(
                        `UPDATE performers SET performer_type = 'band'
                        WHERE performer_id = ?`,
                        [performer.performer_id]
                    )

                    // Insert into bands table with discogs_id
                    await con.execute(
                        `INSERT IGNORE INTO bands (performer_id, band_name, discogs_id)
                        VALUES (?, ?, ?)`,
                        [performer.performer_id, name, discogsId]
                    )

                    // Remove from artists table
                    await con.execute(
                        `DELETE FROM artists WHERE artist_id = ?`,
                        [performer.artist_id]
                    )

                    await con.commit()
                    console.log(` => BAND (Discogs type: ${discogsType}, ID: ${discogsId})`)
                    updatedToBand++

                } catch (err) {
                    await con.rollback()
                    console.log(` => ERROR: ${err.message}`)
                    errors++
                }

            } else {
                // Save discogs_id to artists table
                await con.execute(
                    `UPDATE artists SET discogs_id = ?
                    WHERE artist_id = ?`,
                    [discogsId, performer.artist_id]
                )
                console.log(` => artist (Discogs type: ${discogsType}, ID: ${discogsId})`)
                leftAsArtist++
            }

            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Classification complete!')
        console.log(`Updated to band:  ${updatedToBand}`)
        console.log(`Left as artist:   ${leftAsArtist}`)
        console.log(`Skipped:          ${skipped}`)
        console.log(`Errors:           ${errors}`)
        console.log('=====================================')
        console.log('\nNext: run importPerformerProfiles.js')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        con.release()
        await pool.end()
    }
}

classifyPerformers()