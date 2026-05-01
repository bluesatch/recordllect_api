require('dotenv').config()
const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DISCOGS_HEADERS = {
    'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
    'User-Agent': 'Recordllect/1.0'
}

// Discogs rate limit — 60 requests per minute
const DELAY_MS = 1100

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const importAllTracks = async () => {
    console.log('Starting bulk track import...')
    console.log('=====================================')

    try {
        // Get all albums with a discogs_id that have no tracks yet
        const [albums] = await pool.execute(
            `SELECT a.album_id, a.discogs_id, a.title
            FROM albums a
            LEFT JOIN tracks t ON a.album_id = t.album_id
            WHERE a.discogs_id IS NOT NULL
            AND t.track_id IS NULL
            GROUP BY a.album_id`
        )

        console.log(`Found ${albums.length} albums to process\n`)

        let success = 0
        let skipped = 0
        let failed = 0
        let noTracklist = 0

        for (let i = 0; i < albums.length; i++) {
            const album = albums[i]

            process.stdout.write(
                `[${i + 1}/${albums.length}] "${album.title}"... `
            )

            try {
                const response = await fetch(
                    `${DISCOGS_BASE}/releases/${album.discogs_id}?token=${DISCOGS_TOKEN}`,
                    { headers: DISCOGS_HEADERS }
                )

                if (response.status === 429) {
                    console.log('Rate limited — waiting 60 seconds...')
                    await sleep(60000)
                    i-- // Retry this album
                    continue
                }

                if (!response.ok) {
                    console.log(`Discogs error ${response.status} — skipping`)
                    skipped++
                    await sleep(DELAY_MS)
                    continue
                }

                const release = await response.json()

                if (!release.tracklist || release.tracklist.length === 0) {
                    console.log('No tracklist — skipping')
                    noTracklist++
                    await sleep(DELAY_MS)
                    continue
                }

                // Insert tracks
                let trackCount = 0
                for (let j = 0; j < release.tracklist.length; j++) {
                    const track = release.tracklist[j]
                    if (track.type_ === 'heading') continue

                    await pool.execute(
                        `INSERT IGNORE INTO tracks 
                        (album_id, position, title, duration, track_order)
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            album.album_id,
                            track.position || null,
                            track.title,
                            track.duration || null,
                            j + 1
                        ]
                    )
                    trackCount++
                }

                console.log(`✓ ${trackCount} tracks imported`)
                success++

            } catch (err) {
                console.log(`✗ Error: ${err.message}`)
                failed++
            }

            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Bulk track import complete!')
        console.log(`✓ Success:      ${success}`)
        console.log(`→ No tracklist: ${noTracklist}`)
        console.log(`→ Skipped:      ${skipped}`)
        console.log(`✗ Failed:       ${failed}`)
        console.log('=====================================')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        await pool.end()
    }
}

importAllTracks()