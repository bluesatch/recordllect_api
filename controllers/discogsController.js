require('dotenv').config()
const pool = require('../config/dbconfig')

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_BASE = 'https://api.discogs.com'
const DISCOGS_HEADERS = {
    'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
    'User-Agent': 'Recordllect/1.0'
}

// SEARCH Discogs
exports.searchDiscogs = async (req, res, next) => {
    const { q, type = 'release' } = req.query

    if (!q) {
        return res.status(400).json({ message: 'Search query is required' })
    }

    try {
        const url = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(q)}&type=${type}&per_page=10&token=${DISCOGS_TOKEN}`

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
                    console.error(`Failed to add genre ${genreName}:`, err.message)
                }
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