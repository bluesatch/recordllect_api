require('dotenv').config()
const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DISCOGS_HEADERS = {
    'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
    'User-Agent': 'Recordllect/1.0'
}

const DELAY_MS = 1100
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const matchDiscogsIds = async () => {
    console.log('Starting Discogs ID matching...')
    console.log('=====================================')

    try {
        // Get all albums without a discogs_id
        const [albums] = await pool.execute(
            `SELECT
                a.album_id,
                a.title,
                a.release_year,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name
            FROM albums a
            JOIN performers p ON a.performer_id = p.performer_id
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            WHERE a.discogs_id IS NULL`
        )

        console.log(`Found ${albums.length} albums to match\n`)

        let matched = 0
        let unmatched = 0
        let skipped = 0

        for (let i = 0; i < albums.length; i++) {
            const album = albums[i]

            process.stdout.write(
                `[${i + 1}/${albums.length}] "${album.title}" by ${album.performer_name}... `
            )

            try {
                // Search Discogs by title and artist
                const query = `${album.title} ${album.performer_name}`
                const url = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5&token=${DISCOGS_TOKEN}`

                const response = await fetch(url, { headers: DISCOGS_HEADERS })

                if (response.status === 429) {
                    console.log('Rate limited — waiting 60 seconds...')
                    await sleep(60000)
                    i--
                    continue
                }

                if (!response.ok) {
                    console.log(`Discogs error ${response.status} — skipping`)
                    skipped++
                    await sleep(DELAY_MS)
                    continue
                }

                const data = await response.json()

                if (!data.results || data.results.length === 0) {
                    console.log('No match found')
                    unmatched++
                    await sleep(DELAY_MS)
                    continue
                }

                // Find best match — prefer exact year match
                let bestMatch = null

                if (album.release_year) {
                    bestMatch = data.results.find(
                        r => r.year === album.release_year?.toString()
                    )
                }

                // Fall back to first result
                if (!bestMatch) {
                    bestMatch = data.results[0]
                }

                // Update discogs_id
                await pool.execute(
                    `UPDATE albums SET discogs_id = ? WHERE album_id = ?`,
                    [bestMatch.id, album.album_id]
                )

                console.log(`✓ Matched to Discogs ID ${bestMatch.id} (${bestMatch.year || 'no year'})`)
                matched++

            } catch (err) {
                console.log(`✗ Error: ${err.message}`)
                skipped++
            }

            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Matching complete!')
        console.log(`✓ Matched:   ${matched}`)
        console.log(`→ Unmatched: ${unmatched}`)
        console.log(`→ Skipped:   ${skipped}`)
        console.log('=====================================')
        console.log('\nNow run importAllTracks.js to fetch track listings!')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        await pool.end()
    }
}

matchDiscogsIds()