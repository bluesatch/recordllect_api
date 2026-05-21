/**
 * importPerformerProfiles.js
 * Uses discogs_id on artists and bands to fetch and import:
 * - Profile images
 * - Bios
 * - Band members
 *
 * Run AFTER classifyPerformers.js
 * Run with: node scripts/importPerformerProfiles.js
 */

require('dotenv').config()
const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DELAY_MS = 1100

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fetchArtist = async (discogsId) => {
    try {
        const response = await fetch(
            `${DISCOGS_BASE}/artists/${discogsId}?token=${DISCOGS_TOKEN}`,
            { headers: { 'User-Agent': 'Groovist/1.0 +https://groovist.co' } }
        )

        if (response.status === 429) {
            console.log('Rate limited — waiting 60s...')
            await sleep(60000)
            return fetchArtist(discogsId)
        }

        if (!response.ok) return null
        return response.json()

    } catch (err) {
        console.error(`Failed to fetch artist ${discogsId}:`, err.message)
        return null
    }
}

// Clean Discogs markup from bio text
const cleanBio = (text) => {
    if (!text) return null
    return text
        .replace(/\[a\d*=.*?\]/g, '')     // [a=Artist Name]
        .replace(/\[l=.*?\]/g, '')          // [l=Label]
        .replace(/\[url=.*?\].*?\[\/url\]/g, '') // [url=...]...[/url]
        .replace(/\[.*?\]/g, '')            // any other tags
        .replace(/\r\n/g, '\n')
        .trim()
        .substring(0, 500)
}

const importPerformerProfiles = async () => {
    console.log('Starting performer profile import')
    console.log('==================================')

    try {
        // Get all artists with discogs_id but missing image or bio
        const [artists] = await pool.query(
            `SELECT
                ar.artist_id,
                ar.discogs_id,
                ar.alias,
                ar.bio,
                p.performer_id,
                p.profile_image_url
            FROM artists ar
            JOIN performers p ON ar.performer_id = p.performer_id
            WHERE ar.discogs_id IS NOT NULL
            AND (p.profile_image_url IS NULL OR ar.bio IS NULL)
            ORDER BY ar.artist_id ASC`
        )

        // Get all bands with discogs_id but missing image or bio
        const [bands] = await pool.query(
            `SELECT
                b.band_id,
                b.discogs_id,
                b.band_name,
                b.bio,
                p.performer_id,
                p.profile_image_url
            FROM bands b
            JOIN performers p ON b.performer_id = p.performer_id
            WHERE b.discogs_id IS NOT NULL
            AND (p.profile_image_url IS NULL OR b.bio IS NULL)
            ORDER BY b.band_id ASC`
        )

        console.log(`Found ${artists.length} artists to update`)
        console.log(`Found ${bands.length} bands to update\n`)

        let updated = 0
        let failed = 0
        let membersAdded = 0

        // ============================================================
        // PROCESS ARTISTS
        // ============================================================
        console.log('--- Processing Artists ---')

        for (let i = 0; i < artists.length; i++) {
            const artist = artists[i]

            process.stdout.write(
                `[${i + 1}/${artists.length}] "${artist.alias}"...`
            )

            const data = await fetchArtist(artist.discogs_id)

            if (!data) {
                console.log(' Failed')
                failed++
                await sleep(DELAY_MS)
                continue
            }

            const bio = cleanBio(data.profile)
            const imageUrl = data.images?.[0]?.uri || null
            let changes = []

            // Update bio
            if (bio && !artist.bio) {
                await pool.query(
                    `UPDATE artists SET bio = ? WHERE artist_id = ?`,
                    [bio, artist.artist_id]
                )
                changes.push('bio')
            }

            // Update profile image
            if (imageUrl && !artist.profile_image_url) {
                await pool.query(
                    `UPDATE performers SET profile_image_url = ?
                    WHERE performer_id = ?`,
                    [imageUrl, artist.performer_id]
                )
                changes.push('image')
            }

            console.log(changes.length > 0
                ? ` ✓ Updated: ${changes.join(', ')}`
                : ' — already complete'
            )

            updated++
            await sleep(DELAY_MS)
        }

        // ============================================================
        // PROCESS BANDS
        // ============================================================
        console.log('\n--- Processing Bands ---')

        for (let i = 0; i < bands.length; i++) {
            const band = bands[i]

            process.stdout.write(
                `[${i + 1}/${bands.length}] "${band.band_name}"...`
            )

            const data = await fetchArtist(band.discogs_id)

            if (!data) {
                console.log(' Failed')
                failed++
                await sleep(DELAY_MS)
                continue
            }

            const bio = cleanBio(data.profile)
            const imageUrl = data.images?.[0]?.uri || null
            const members = data.members || []
            let changes = []

            // Update bio
            if (bio && !band.bio) {
                await pool.query(
                    `UPDATE bands SET bio = ? WHERE band_id = ?`,
                    [bio, band.band_id]
                )
                changes.push('bio')
            }

            // Update profile image
            if (imageUrl && !band.profile_image_url) {
                await pool.query(
                    `UPDATE performers SET profile_image_url = ?
                    WHERE performer_id = ?`,
                    [imageUrl, band.performer_id]
                )
                changes.push('image')
            }

            // Import band members
            if (members.length > 0) {
                for (const member of members) {
                    try {
                        // Check if member already exists by discogs_id
                        const [existing] = await pool.query(
                            `SELECT ar.artist_id
                            FROM artists ar
                            WHERE ar.discogs_id = ?`,
                            [member.id]
                        )

                        let memberArtistId

                        if (existing.length > 0) {
                            memberArtistId = existing[0].artist_id
                        } else {
                            // Create performer + artist for this member
                            const [perfResult] = await pool.query(
                                `INSERT INTO performers (performer_type)
                                VALUES ('artist')`
                            )
                            const memberPerformerId = perfResult.insertId

                            const [artResult] = await pool.query(
                                `INSERT INTO artists
                                    (performer_id, alias, discogs_id)
                                VALUES (?, ?, ?)`,
                                [memberPerformerId, member.name, member.id]
                            )
                            memberArtistId = artResult.insertId
                        }

                        // Add to band_members — ignore if already exists
                        await pool.query(
                            `INSERT IGNORE INTO band_members
                                (band_id, artist_id)
                            VALUES (?, ?)`,
                            [band.band_id, memberArtistId]
                        )

                        membersAdded++

                    } catch (memberErr) {
                        console.error(
                            `\n  Failed to add member ${member.name}:`,
                            memberErr.message
                        )
                    }
                }
                changes.push(`${members.length} members`)
            }

            console.log(changes.length > 0
                ? ` ✓ Updated: ${changes.join(', ')}`
                : ' — already complete'
            )

            updated++
            await sleep(DELAY_MS)
        }

        console.log('\n=====================================')
        console.log('Profile import complete!')
        console.log(`Updated:       ${updated}`)
        console.log(`Members added: ${membersAdded}`)
        console.log(`Failed:        ${failed}`)
        console.log('=====================================')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        await pool.end()
    }
}

importPerformerProfiles()