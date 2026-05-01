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

const importAlbumCovers = async () => {
    console.log('Starting album cover import...')
    console.log('=====================================')

    try {
        // Get all albums with a discogs_id but no cover image
        const [albums] = await pool.execute(
            `SELECT album_id, discogs_id, title
            FROM albums
            WHERE discogs_id IS NOT NULL
            AND (album_image_url IS NULL OR album_image_url = '')`
        )

        console.log(`Found ${albums.length} albums without covers\n`)

        let success = 0
        let noCover = 0
        let skipped = 0
        let failed = 0

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
                    i--
                    continue
                }

                if (!response.ok) {
                    console.log(`Discogs error ${response.status} — skipping`)
                    skipped++
                    await sleep(DELAY_MS)
                    continue
                }

                const release = await response.json()

                // Find the primary image
                const primaryImage = release.images?.find(
                    img => img.type === 'primary'
                ) || release.images?.[0]

                if (!primaryImage?.uri) {
                    console.log('No cover image found')
                    noCover++
                    await sleep(DELAY_MS)
                    continue
                }

                // Update album_image_url
                await pool.execute(
                    `UPDATE albums SET album_image_url = ? WHERE album_id = ?`,
                    [primaryImage.uri, album.album_id]
                )

                console.log(`✓ Cover imported`)
                success++

            } catch (err) {
                console.log(`✗ Error: ${err.message}`)
                failed++
            }

            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Cover import complete!')
        console.log(`✓ Success:   ${success}`)
        console.log(`→ No cover:  ${noCover}`)
        console.log(`→ Skipped:   ${skipped}`)
        console.log(`✗ Failed:    ${failed}`)
        console.log('=====================================')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        await pool.end()
    }
}

importAlbumCovers()