/**
 * classifyPerformers.js
 * Hits the Discogs API for each performer in the database and 
 * classifies them as either 'artist' or 'band' based
 * on the Discogs artist type field
 * 
 * Run with node scripts/classifyPerformers.js
 * 
 * DISCOGS API TYPES:
 * 
 * - 'person' => artist
 * - 'group' => band 
 * - 'orchestra', 'choir' => band 
 * - 'unknown' => leave as is
 */

require('dotenv').config()

const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'

// DISCOGS RATE LIMIT IS 60 REQUESTS PER MINUTE
// WAIT 1100MS BETWEEN REQUESTS TO STAY SAFELY UNDER

const DELAY_MS = 1100

const sleep =(ms)=> new Promise(resolve => setTimeout(resolve, ms))

const searchDiscogs = async (name)=> {

    try {   
        const url = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(name)}&type=artist&token=${DISCOGS_TOKEN}`
        const response = await fetch(url)

        if (!response.ok) {
            console.error(`Discogs API error for "${name}": ${response.status}`)
            return null
        }

        const data = await response.json()

        if (!data.results || data.results.length === 0) {
            return null
        }

        // FIND THE BEST MATCH - EXACT NAME PREFERRED
        const exactMatch = data.results.find(
            r => r.title?.toLowerCase() === name.toLowerCase()
        )

        return exactMatch || data.results[0]
        
    } catch (err) {
        console.error(`Failed to search Discogs for "${name}":`, err.message)
    }
}

const classifyPerformers = async ()=> {
    console.log('Starting performer classification')
    console.log('==================================')

    const con = await pool.getConnection()

    try {
        // Fetch all performers that are currently classified as artist
        const [performers] = await con.execute(
            `SELECT 
                p.performer_id,
                p.performer_type,
                ar.artist_id,
                ar.alias,
                ar.first_name,
                ar.last_name
            FROM performers p
            JOIN artists ar ON p.performer_id = ar.performer_id 
            WHERE p.performer_type = 'artist'
            `
        )

        console.log(`Found ${performers.length} performers to check\n`)

        let updatedToBand = 0
        let leftAsArtist = 0
        let skipped = 0
        let errors = 0

        for (let i = 0; i < performers.length; i++) {
            const performer = performers[i]
            const name = performer.alias || `${performer.first_name || ''} ${performer.last_name || ''}`.trim()

            if (!name) {
                console.log(`[${i + 1}/${performers.length}] Skipping - no name found`)
                skipped++
                continue
            }

            process.stdout.write(`[${i + 1}/${performers.length}] Checking "${name}"...`)

            const result = await searchDiscogs(name)

            if (!result) {
                console.log('Not found - skipping')
                skipped++
                await sleep(DELAY_MS)
                continue
            }

            const discogsType = result.type 

            const isBand = ['group', 'orchestra', 'choir'].includes(discogsType)

            if (isBand) {
                try {
                    await con.beginTransaction()

                    // Update performer_type
                    await con.execute(
                        `UPDATE performers SET performer_type = 'band'
                        WHERE performer_id = ?`,
                        [performer.performer_id]
                    )

                    // INSERT INTO BANDS TABLE 
                    await con.execute(
                        `INSERT IGNORE INTO bands (performer_id, band_name)
                        VALUES (?, ?)`,
                        [performer.performer_id, name]
                    )

                    // REMOVE FROM ARTISTS TABLE 
                    await con.execute(
                        `DELETE FROM artists WHERE artist_id = ?`,
                        [performer.artist_id]
                    )

                    await con.commit()
                    console.log(`=> BAND (Discogs type: ${discogsType})`)
                    updatedToBand++
                } catch (err) {
                    await con.rollback()
                    console.log(`=> ERROR updating: ${err.message}`)
                    errors++
                }
            } else {
                console.log(`=> artist (Discogs type: ${discogsType})`)
                leftAsArtist++
            }

            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Classification complete!')
        console.log(`Updated to band: ${updatedToBand}`)
        console.log(`Left as artist:  ${leftAsArtist}`)
        console.log(`Skipped:         ${skipped}`)
        console.log(`Errors:          ${errors}`)
        console.log('=====================================')
    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        con.release()
        await pool.end()
    }
}

classifyPerformers()