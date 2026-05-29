const pool = require('../config/dbconfig')

exports.importFromCSV = async (req, res, next) => {
    const userId = req.user.users_id
    const { albums } = req.body

    if (!albums || !Array.isArray(albums) || albums.length === 0) {
        return res.status(400).json({ message: 'No albums provided' })
    }

    let imported = 0
    let already_owned = 0
    let failed = 0
    let not_found = 0

    try {
        for (const row of albums) {
            try {
                const title = row.title?.trim()
                const performerName = (row.artist || row.performer || row.band)?.trim()

                if (!title) {
                    failed++
                    continue
                }

                // Try to find album in Groovist by title and performer
                let query = `
                    SELECT DISTINCT a.album_id
                    FROM albums a
                    JOIN performers p ON a.performer_id = p.performer_id
                    LEFT JOIN artists ar ON p.performer_id = ar.performer_id
                    LEFT JOIN bands b ON p.performer_id = b.performer_id
                    WHERE LOWER(a.title) = LOWER(?)
                `
                const params = [title]

                if (performerName) {
                    query += ` AND (
                        LOWER(ar.alias) = LOWER(?) OR
                        LOWER(CONCAT(ar.first_name, ' ', ar.last_name)) = LOWER(?) OR
                        LOWER(b.band_name) = LOWER(?)
                    )`
                    params.push(performerName, performerName, performerName)
                }

                query += ` LIMIT 1`

                const [albumRows] = await pool.query(query, params)

                if (albumRows.length === 0) {
                    not_found++
                    continue
                }

                const albumId = albumRows[0].album_id

                // Check if already in collection
                const [existingRows] = await pool.query(
                    `SELECT user_album_id FROM user_albums
                    WHERE users_id = ? AND album_id = ?`,
                    [userId, albumId]
                )

                if (existingRows.length > 0) {
                    already_owned++
                } else {
                    await pool.query(
                        `INSERT INTO user_albums (users_id, album_id) VALUES (?, ?)`,
                        [userId, albumId]
                    )
                    imported++
                }

            } catch (rowErr) {
                console.error('Failed to import row:', rowErr.message)
                failed++
            }
        }

        res.status(200).json({
            message: 'CSV import complete',
            imported,
            already_owned,
            not_found,
            failed,
            total: albums.length
        })

    } catch (err) {
        next(err)
    }
}