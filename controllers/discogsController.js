require('dotenv').config()
const pool = require('../config/dbconfig')
const logger = require('../config/logger')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DISCOGS_HEADERS = {
    'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
    'User-Agent': 'Recordllect/1.0'
}

// Helper - fetch a single page of user's Discogs collection 
const fetchCollectionPage = async (username, page = 1) => {
    const response = await fetch(
        `${DISCOGS_BASE}/users/${username}/collection/folders/0/releases?page=${page}&per_page=100&token=${DISCOGS_TOKEN}`,
        {
            headers: {
                'User-Agent': 'Groovist/1.0 +https://groovist.co'
            }
        }
    )

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Discogs username not found')
        }
        if (response.status === 403) {
            throw new Error('This Discogs collection is private')
        }
        throw new Error('Failed to fetch Discogs collection')
    }

    return response.json()
}

// Helper - fetch full release details from Discogs
const fetchRelease = async (releaseId) => {
    const response = await fetch(
        `${DISCOGS_BASE}/releases/${releaseId}?token=${DISCOGS_TOKEN}`,
        {
            headers: {
                'User-Agent': 'Groovist/1.0 +https://groovist.co'
            }
        }
    )
    if (!response.ok) return null
    return response.json()
}

// Helper - sleep for rate limiting 
const sleep = (ms)=> new Promise(resolve => setTimeout(resolve, ms))

// SEARCH Discogs
exports.searchDiscogs = async (req, res, next) => {
    const { q, type = 'release' } = req.query

    if (!q) {
        return res.status(400).json({ message: 'Search query is required' })
    }

    try {
        const url = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(q)}&type=${type}&per_page=100&token=${DISCOGS_TOKEN}`

        const response = await fetch(url, { headers: DISCOGS_HEADERS })

        if (!response.ok) {
            return res.status(response.status).json({
                message: 'Discogs API error'
            })
        }

        const data = await response.json()

        // Map results to a cleaner format
        const results = data.results?.map(r => ({
            discogs_id: r.id,
            title: r.title,
            year: r.year || null,
            label: r.label?.[0] || null,
            format: r.format?.[0] || null,
            cover_image: r.cover_image || null,
            resource_url: r.resource_url,
            type: r.type
        })) || []

        res.status(200).json({
            count: results.length,
            results
        })
    } catch (err) {
        next(err)
    }
}

// IMPORT a release from Discogs
exports.importFromDiscogs = async (req, res, next) => {
    const { discogs_id } = req.body
    const userId = req.user.users_id

    if (!discogs_id) {
        return res.status(400).json({ message: 'discogs_id is required' })
    }

    const con = await pool.getConnection()

    try {
        // Check if album already exists in our database
        const [existing] = await con.execute(
            `SELECT album_id FROM albums WHERE discogs_id = ?`,
            [discogs_id]
        )

        if (existing.length > 0) {
            // Album already exists — just add to user collection
            const albumId = existing[0].album_id

            try {
                await con.execute(
                    `INSERT INTO user_albums (users_id, album_id) VALUES (?, ?)`,
                    [userId, albumId]
                )
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({
                        message: 'Album already in your collection',
                        album_id: albumId
                    })
                }
                throw err
            }

            return res.status(200).json({
                message: 'Album added to your collection',
                album_id: albumId,
                imported: false
            })
        }

        // Fetch full release details from Discogs
        const response = await fetch(
            `${DISCOGS_BASE}/releases/${discogs_id}?token=${DISCOGS_TOKEN}`,
            { headers: DISCOGS_HEADERS }
        )

        if (!response.ok) {
            return res.status(response.status).json({
                message: 'Failed to fetch release from Discogs'
            })
        }

        const release = await response.json()

        // Extract and normalize data
        const title = release.title
        const release_year = release.year || null
        const cover_image = release.images?.[0]?.uri || null

        // Extract performer name
        const performerName = release.artists?.[0]?.name
            ?.replace(/\s*\(\d+\)$/, '')  // Remove Discogs disambiguation numbers
            .trim() || 'Unknown Artist'

        // Extract label
        const labelName = release.labels?.[0]?.name || null

        // Extract format
        const formatName = release.formats?.[0]?.name || 'Vinyl'

        await con.beginTransaction()

        // 1. Find or create performer
        let performerId = null

        // Check if performer exists by alias
        const [existingPerformer] = await con.execute(
            `SELECT p.performer_id FROM performers p
            JOIN artists ar ON p.performer_id = ar.performer_id
            WHERE ar.alias = ?
            UNION
            SELECT p.performer_id FROM performers p
            JOIN bands b ON p.performer_id = b.performer_id
            WHERE b.band_name = ?`,
            [performerName, performerName]
        )

        if (existingPerformer.length > 0) {
            performerId = existingPerformer[0].performer_id
        } else {
            // Create new performer as artist by default
            const [performerResult] = await con.execute(
                `INSERT INTO performers (performer_type) VALUES ('artist')`,
                []
            )
            performerId = performerResult.insertId

            await con.execute(
                `INSERT INTO artists (performer_id, alias) VALUES (?, ?)`,
                [performerId, performerName]
            )
        }

        // 2. Find or create label
        let labelId = null

        if (labelName) {
            const [existingLabel] = await con.execute(
                `SELECT label_id FROM labels WHERE label_name = ?`,
                [labelName]
            )

            if (existingLabel.length > 0) {
                labelId = existingLabel[0].label_id
            } else {
                const [labelResult] = await con.execute(
                    `INSERT INTO labels (label_name) VALUES (?)`,
                    [labelName]
                )
                labelId = labelResult.insertId
            }
        }

        // 3. Find or create format
        const [existingFormat] = await con.execute(
            `SELECT format_id FROM formats WHERE format_name = ?`,
            [formatName]
        )

        let formatId
        if (existingFormat.length > 0) {
            formatId = existingFormat[0].format_id
        } else {
            const [formatResult] = await con.execute(
                `INSERT INTO formats (format_name) VALUES (?)`,
                [formatName]
            )
            formatId = formatResult.insertId
        }

        // 4. Create album
        const [albumResult] = await con.execute(
            `INSERT INTO albums (
                discogs_id,
                title,
                performer_id,
                label_id,
                format_id,
                release_year,
                album_image_url,
                source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'discogs')`,
            [
                discogs_id,
                title,
                performerId,
                labelId,
                formatId,
                release_year,
                cover_image
            ]
        )

        const albumId = albumResult.insertId

        // 5. Add to user collection
        await con.execute(
            `INSERT INTO user_albums (users_id, album_id) VALUES (?, ?)`,
            [userId, albumId]
        )

        // 6. Import genres if available
        if (release.genres?.length > 0 || release.styles?.length > 0) {
            const allGenres = [
                ...(release.genres || []),
                ...(release.styles || [])
            ]

            for (const genreName of allGenres) {
                try {
                    // Find or create genre
                    const [existingGenre] = await con.execute(
                        `SELECT genre_id FROM genres WHERE genre_name = ?`,
                        [genreName]
                    )

                    let genreId
                    if (existingGenre.length > 0) {
                        genreId = existingGenre[0].genre_id
                    } else {
                        const [genreResult] = await con.execute(
                            `INSERT INTO genres (genre_name) VALUES (?)`,
                            [genreName]
                        )
                        genreId = genreResult.insertId
                    }

                    await con.execute(
                        `INSERT IGNORE INTO album_genres (album_id, genre_id) VALUES (?, ?)`,
                        [albumId, genreId]
                    )
                } catch (err) {
                    logger.error(`Failed to add genre ${genreName}:`, {error: err.message})
                }
            }
        }

        // 7. Import tracklist
        if (release.tracklist?.length > 0) {
            for (let i = 0; i < release.tracklist.length; i++) {
                const track = release.tracklist[i]

                // Skip headings - Discogs uses type_ 'heading' for side labels 
                if (track.type_ === 'heading') continue 

                await con.execute(
                    `INSERT INTO tracks (album_id, position, title, duration, track_order)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        albumId,
                        track.position || null,
                        track.title, 
                        track.duration || null,
                        i + 1
                    ]
                )
            }
        }

        await con.commit()

        res.status(201).json({
            message: 'Album imported and added to your collection',
            album_id: albumId,
            imported: true,
            title,
            performer_name: performerName
        })

    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}

// IMPORT tracks for an existing album from Discogs
exports.importTracksForAlbum = async (req, res, next) => {
    const { id } = req.params

    try {
        // Get the album's discogs_id
        const [albumRows] = await pool.execute(
            `SELECT album_id, discogs_id, title FROM albums WHERE album_id = ?`,
            [id]
        )

        if (albumRows.length === 0) {
            return res.status(404).json({ message: 'Album not found' })
        }

        const album = albumRows[0]

        if (!album.discogs_id) {
            return res.status(400).json({
                message: 'Album has no Discogs ID — cannot fetch tracks'
            })
        }

        // Check if tracks already exist
        const [existingTracks] = await pool.execute(
            `SELECT COUNT(*) AS count FROM tracks WHERE album_id = ?`,
            [id]
        )

        if (existingTracks[0].count > 0) {
            return res.status(409).json({
                message: 'Tracks already imported for this album'
            })
        }

        // Fetch from Discogs
        const response = await fetch(
            `${DISCOGS_BASE}/releases/${album.discogs_id}?token=${DISCOGS_TOKEN}`,
            { headers: DISCOGS_HEADERS }
        )

        if (!response.ok) {
            return res.status(response.status).json({
                message: 'Failed to fetch release from Discogs'
            })
        }

        const release = await response.json()

        if (!release.tracklist || release.tracklist.length === 0) {
            return res.status(404).json({
                message: 'No tracklist found on Discogs for this album'
            })
        }

        // Insert tracks
        let trackCount = 0
        for (let i = 0; i < release.tracklist.length; i++) {
            const track = release.tracklist[i]
            if (track.type_ === 'heading') continue

            await pool.execute(
                `INSERT INTO tracks (album_id, position, title, duration, track_order)
                VALUES (?, ?, ?, ?, ?)`,
                [
                    id,
                    track.position || null,
                    track.title,
                    track.duration || null,
                    i + 1
                ]
            )
            trackCount++
        }

        res.status(201).json({
            message: `${trackCount} tracks imported successfully`,
            track_count: trackCount
        })
    } catch (err) {
        next(err)
    }
}

// POST /discogs/import-collection 
exports.importCollection = async (req, res, next) => {
    const { discogs_username, start_page = 1 } = req.body
    const cleanUsername = discogs_username.trim()
    const userId = req.user.users_id

    if (!cleanUsername) {
        return res.status(400).json({
            message: 'Discogs username is required'
        })
    }

    // Process up to 5 pages per request. Already-owned albums are just fast
    // DB lookups (no Discogs API call), so 5 pages of already-owned takes ~5s.
    // New albums require a Discogs API call each, so we stop early if we've
    // fetched too many to stay within Railway's 25s timeout.
    const MAX_PAGES = 5

    try {
        const startPageNum = Number(start_page)

        // First fetch to get total count and first batch of releases
        const firstPage = await fetchCollectionPage(cleanUsername, startPageNum)
        const total = firstPage.pagination.items
        const totalPages = firstPage.pagination.pages

        if (total === 0) {
            return res.status(200).json({
                message: 'No albums found in this Discogs collection',
                imported: 0,
                already_owned: 0,
                failed: 0,
                total: 0
            })
        }

        let imported = 0
        let already_owned = 0
        let failed = 0

        const endPage = Math.min(totalPages, startPageNum + MAX_PAGES - 1)
        // Process all releases across all pages
        const allReleases = [...firstPage.releases]

        // Fetch remaining pages
        for (let page = startPageNum + 1; page <= endPage; page++) {
            await sleep(1000) // 1 second between page requests
            const pageData = await fetchCollectionPage(cleanUsername, page)
            allReleases.push(...pageData.releases)
        }

        // ── Step 1: Bulk-check which discogs IDs already exist in our albums table ──
        const allDiscogsIds = allReleases
            .map(item => item.basic_information?.id || item.id)
            .filter(Boolean)

        const placeholders = allDiscogsIds.map(() => '?').join(',')
        const [existingAlbumRows] = await pool.query(
            `SELECT album_id, discogs_id FROM albums WHERE discogs_id IN (${placeholders})`,
            allDiscogsIds
        )
        const albumByDiscogsId = {}
        for (const row of existingAlbumRows) {
            albumByDiscogsId[row.discogs_id] = row.album_id
        }

        // ── Step 2: Bulk-check which of those album_ids are already in user's collection ──
        const knownAlbumIds = Object.values(albumByDiscogsId)
        const userOwnedSet = new Set()
        if (knownAlbumIds.length > 0) {
            const idPlaceholders = knownAlbumIds.map(() => '?').join(',')
            const [userAlbumRows] = await pool.query(
                `SELECT album_id FROM user_albums
                 WHERE users_id = ? AND album_id IN (${idPlaceholders})`,
                [userId, ...knownAlbumIds]
            )
            for (const row of userAlbumRows) {
                userOwnedSet.add(row.album_id)
            }
        }

        // ── Step 3: Process each release ─────────────────────────────────────────
        for (const item of allReleases) {
            const discogsId = item.basic_information?.id || item.id
            if (!discogsId) { failed++; continue }

            try {
                let albumId = albumByDiscogsId[discogsId]

                if (!albumId) {
                    // Album not in Groovist DB — fetch from Discogs and insert
                    await sleep(200)
                    const release = await fetchRelease(discogsId)

                    if (!release) { failed++; continue }

                    // Get or create performer
                    const performerName = release.artists?.[0]?.name || 'Unknown Artist'
                    const cleanName = performerName.replace(/\s*\(\d+\)\s*$/, '').trim()

                    let performerId
                    const [existingPerformer] = await pool.execute(
                        `SELECT p.performer_id FROM performers p
                        JOIN artists a ON p.performer_id = a.performer_id
                        WHERE LOWER(a.alias) = LOWER(?)`,
                        [cleanName]
                    )
                    if (existingPerformer.length > 0) {
                        performerId = existingPerformer[0].performer_id
                    } else {
                        const [perfResult] = await pool.execute(
                            `INSERT INTO performers (performer_type) VALUES ('artist')`, []
                        )
                        performerId = perfResult.insertId
                        await pool.execute(
                            `INSERT INTO artists (performer_id, alias) VALUES (?, ?)`,
                            [performerId, cleanName]
                        )
                    }

                    // Get or create label
                    let labelId = null
                    const labelName = release.labels?.[0]?.name
                    if (labelName) {
                        const [existingLabel] = await pool.execute(
                            `SELECT label_id FROM labels WHERE LOWER(label_name) = LOWER(?)`,
                            [labelName]
                        )
                        if (existingLabel.length > 0) {
                            labelId = existingLabel[0].label_id
                        } else {
                            const [labelResult] = await pool.execute(
                                `INSERT INTO labels (label_name) VALUES (?)`, [labelName]
                            )
                            labelId = labelResult.insertId
                        }
                    }

                    // Get or create format
                    const formatName = release.formats?.[0]?.name || 'Vinyl'
                    const [existingFormat] = await pool.execute(
                        `SELECT format_id FROM formats WHERE LOWER(format_name) = LOWER(?)`,
                        [formatName]
                    )
                    const formatId = existingFormat.length > 0 ? existingFormat[0].format_id : 1

                    // Insert album
                    const [albumResult] = await pool.execute(
                        `INSERT INTO albums (
                            performer_id, label_id, format_id,
                            title, release_year, album_image_url,
                            discogs_id, source
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'discogs')`,
                        [
                            performerId, labelId, formatId,
                            release.title || 'Unknown Title',
                            release.year || null,
                            release.images?.[0]?.uri || null,
                            discogsId
                        ]
                    )
                    albumId = albumResult.insertId
                    albumByDiscogsId[discogsId] = albumId

                    // Add genres
                    if (release.genres?.length > 0) {
                        for (const genreName of release.genres) {
                            const [genreRows] = await pool.execute(
                                `SELECT genre_id FROM genres WHERE LOWER(genre_name) = LOWER(?)`,
                                [genreName]
                            )
                            if (genreRows.length > 0) {
                                await pool.execute(
                                    `INSERT IGNORE INTO album_genres (album_id, genre_id) VALUES (?, ?)`,
                                    [albumId, genreRows[0].genre_id]
                                )
                            }
                        }
                    }

                    // Import tracks
                    if (release.tracklist?.length > 0) {
                        for (const track of release.tracklist) {
                            if (track.type_ === 'track') {
                                await pool.execute(
                                    `INSERT INTO tracks (album_id, position, title, duration) VALUES (?, ?, ?, ?)`,
                                    [albumId, track.position || null, track.title || 'Unknown', track.duration || null]
                                )
                            }
                        }
                    }
                }

                // Add to user's collection if not already there
                if (userOwnedSet.has(albumId)) {
                    already_owned++
                } else {
                    await pool.execute(
                        `INSERT IGNORE INTO user_albums (users_id, album_id) VALUES (?, ?)`,
                        [userId, albumId]
                    )
                    userOwnedSet.add(albumId)
                    imported++
                }
            } catch (itemErr) {
                logger.error('Failed to import release', { message: itemErr.message, discogsId })
                failed++
            }
        }

        // Calculate next page
        const nextPage = endPage < totalPages ? endPage + 1 : null

        res.status(200).json({
            message: nextPage
                ? `Batch imported! ${totalPages - endPage} pages remaining.`
                : 'Collection fully imported!',
            imported,
            already_owned,
            failed,
            total,
            total_pages: totalPages,
            current_page: endPage,
            next_page: nextPage // null => fully imported
        })

    } catch (err) {
        next(err)
    }
}