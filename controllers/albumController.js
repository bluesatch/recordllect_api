const pool = require('../config/dbconfig')
const logger = require('../config/logger')

// get start of current week (Monday)
const getWeekStart =()=> {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    return monday.toISOString().split('T')[0]
}

// get start of previous week 
const getPrevWeekStart = ()=> {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7
    const monday = new Date(now.setDate(diff))
    return monday.toISOString().split('T')[0]
}

exports.createAlbum = async (req, res, next)=> {
    const {
        title,
        serial_no,
        performer_id,
        label_id,
        format_id,
        release_year,
        duration_seconds,
        album_image_url,
        genre_ids
    } = req.body

    // Input validation
    if (!title) {
        return res.status(400).json({ message: 'title is required' })
    }

    if (!performer_id) {
        return res.status(400).json({ message: 'performer_id is required' })
    }

    if (!format_id) {
        return res.status(400).json({ message: 'format_id is required'})
    }

    if (genre_ids && !Array.isArray(genre_ids)) {
        return res.status(400).json({ message: 'genre_ids must be an array'})
    }

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        // 1. Insert into albums
        const [albumResult] = await con.execute(
            `INSERT INTO albums (title, serial_no, performer_id, label_id, format_id, release_year, duration_seconds, album_image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                serial_no || null,
                performer_id,
                label_id || null,
                format_id,
                release_year || null,
                duration_seconds || null,
                album_image_url || null
            ]
        )

        const album_id = albumResult.insertId

        // 2. Insert genres into album_genres if provided
        if (genre_ids && genre_ids.length > 0) {
            const genreValues = genre_ids.map(genre_id => [album_id, genre_id])
            await con.query(
                `INSERT INTO album_genres (album_id, genre_id) VALUES ?`,
                [genreValues]
            )
        }

        await con.commit()

        res.status(201).json({
            message: 'Album created successfully',
            album_id
        })
    } catch (err) {
        await con.rollback()
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'Invalid performer_id, label_id, format_id, or genre_id' })
        }
        next(err)
    } finally {
        con.release()
    }
}

exports.getAllAlbums = async (req, res, next) => {

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    const search = req.query.search || ''
    const format = req.query.format || ''
    const genre = req.query.genre || ''
    const sort = req.query.sort || 'title_asc'

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'MIN(a.release_year) ASC',
        'year_desc': 'MIN(a.release_year) DESC',
        'performer_desc': 'v.performer_name DESC',
        'performer_asc': 'v.performer_name ASC'
    }

    const orderBy = sortMap[sort] || 'a.title ASC'

    try {
        const conditions = []
        const params = []

        if (search && search.trim()) {
            conditions.push(`(a.title LIKE ? OR v.performer_name LIKE ? OR l.label_name LIKE ?)`)
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (format) {
            conditions.push(`f.format_name = ?`)
            params.push(format)
        }

        if (genre) {
            conditions.push(`EXISTS (
                SELECT 1 FROM album_genres ag
                JOIN genres g ON ag.genre_id = g.genre_id
                WHERE ag.album_id = a.album_id AND g.genre_name = ?
            )`)
            params.push(genre)
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : ''

        // Step 1 — get distinct title/performer groups
        // sorted correctly and pick best album_id
        const [representativeRows] = await pool.query(
            `SELECT
                a.title,
                a.performer_id,
                v.performer_name,
                MIN(a.release_year) AS min_year,
                MIN(CASE WHEN a.album_image_url IS NOT NULL
                    THEN a.album_id END) AS best_with_image,
                MIN(a.album_id) AS best_any
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            LEFT JOIN labels l ON a.label_id = l.label_id
            JOIN formats f ON a.format_id = f.format_id
            ${whereClause}
            GROUP BY a.title, a.performer_id, v.performer_name
            ORDER BY ${orderBy}`,
            params
        )

        if (representativeRows.length === 0) {
            return res.status(200).json({
                count: 0, total: 0, page, totalPages: 0, albums: []
            })
        }

        const total = representativeRows.length
        const totalPages = Math.ceil(total / limit)

        // Step 2 — pick best album_id (with image preferred)
        // and paginate the sorted list
        const allBestIds = representativeRows.map(row =>
            row.best_with_image || row.best_any
        )
        const paginatedIds = allBestIds.slice(offset, offset + limit)

        if (paginatedIds.length === 0) {
            return res.status(200).json({
                count: 0, total, page, totalPages, albums: []
            })
        }

        // Step 3 — fetch full details for paginated albums
        const placeholders = paginatedIds.map(() => '?').join(',')

        const [rows] = await pool.query(
            `SELECT
                a.album_id,
                a.performer_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.performer_type,
                v.performer_name,
                v.label_name,
                f.format_name,
                (
                    SELECT COUNT(*)
                    FROM albums a2
                    WHERE a2.title = a.title
                    AND a2.performer_id = a.performer_id
                ) AS version_count,
                GROUP_CONCAT(DISTINCT g.genre_name
                    ORDER BY g.genre_name SEPARATOR ', ') AS genres
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            LEFT JOIN labels l ON a.label_id = l.label_id
            JOIN formats f ON a.format_id = f.format_id
            LEFT JOIN album_genres ag ON a.album_id = ag.album_id
            LEFT JOIN genres g ON ag.genre_id = g.genre_id
            WHERE a.album_id IN (${placeholders})
            GROUP BY
                a.album_id, a.performer_id, a.title,
                a.release_year, a.album_image_url,
                v.performer_type, v.performer_name,
                v.label_name, f.format_name`,
            paginatedIds
        )

        // Step 4 — re-sort rows to match original sort order
        // since IN clause doesn't preserve order
        const albumMap = {}
        rows.forEach(row => { albumMap[row.album_id] = row })
        const sortedAlbums = paginatedIds
            .map(id => albumMap[id])
            .filter(Boolean)

        res.status(200).json({
            count: sortedAlbums.length,
            total,
            page,
            totalPages,
            albums: sortedAlbums
        })

    } catch (err) {
        next(err)
    }
}

exports.getAlbumById = async (req, res, next) => {
    const { id } = req.params

    try {
        // GET core album info via view
        const [ rows ] = await pool.execute(
            `SELECT
                a.performer_id,
                a.album_id,
                a.discogs_id,
                a.title,
                a.serial_no,
                a.release_year,
                a.duration_seconds,
                a.album_image_url,
                a.label_id,
                a.format_id,
                v.performer_type,
                v.performer_name,
                v.label_name,
                v.format_name,
                a.created_at
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE a.album_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Album not found' })
        }

        const album = rows[0]

        // Fetch genres separately
        const [ genres ] = await pool.execute(
            `SELECT g.genre_id, g.genre_name
            FROM album_genres ag
            JOIN genres g ON ag.genre_id = g.genre_id
            WHERE ag.album_id = ?`,
            [id]
        )

        album.genres = genres

        res.status(200).json(album)
    } catch (err) {
        next(err)
    }
}


exports.updateAlbum = async (req, res, next)=> {
    const { id } = req.params
    const {
        title,
        serial_no,
        performer_id,
        label_id,
        format_id,
        release_year,
        duration_seconds,
        album_image_url,
        genre_ids
    } = req.body

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        const [rows] = await con.execute(
            `SELECT album_id FROM albums WHERE album_id = ?`, [id]
        )

        if (rows.length === 0) {
            await con.rollback()
            return res.status(404).json({ message: 'Album not found'})
        }

        // Update albums table
        await con.execute(
            `UPDATE albums SET
                title = COALESCE(?, title),
                serial_no = COALESCE(?, serial_no),
                performer_id = COALESCE(?, performer_id),
                label_id = COALESCE(?, label_id),
                format_id = COALESCE(?, format_id),
                release_year = COALESCE(?, release_year),
                duration_seconds = COALESCE(?, duration_seconds),
                album_image_url = COALESCE(?, album_image_url)
            WHERE album_id = ?`,
            [
                title || null,
                serial_no || null,
                performer_id || null,
                label_id || null,
                format_id || null,
                release_year || null,
                duration_seconds || null,
                album_image_url || null,
                id
            ]
        )

        // If genre
        if (genre_ids && Array.isArray(genre_ids)) {
            await con.execute(
                `DELETE FROM album_genres WHERE album_id = ?`, [id]
            )
            if (genre_ids.length > 0) {
                const genreValues = genre_ids.map(genre_id => [id, genre_id])
                await con.query(
                    `INSERT INTO album_genres (album_id, genre_id) VALUES ?`,
                    [genreValues]
                )
            }
        }

        await con.commit()

        res.status(200).json({ message: 'Album updated successfully'})

    } catch (err) {
        await con.rollback()
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'Invalid performer_id, label_id, format_id, or genre_id'})
        }

        next(err)
    } finally {
        con.release()
    }
}

exports.deleteAlbum = async (req, res, next)=> {
    const { id } = req.params 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM albums WHERE album_id = ?`, [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Album not found'})
        }

        res.status(200).json({ message: 'Album deleted successfully' })
    } catch (err) {
        next(err)
    }
}

exports.getAlbumsByPerformer = async (req, res, next) => {
    const { id } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit 
    const sort = req.query.sort || 'year_asc'

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'a.release_year ASC',
        'year_desc': 'a.release_year DESC'
    }

    const orderBy = sortMap[sort] || 'a.release_year ASC'

    try {
        const [countResult] = await pool.query(
            `SELECT COUNT(*) AS total FROM albums WHERE performer_id = ?`,
            [id]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        const [rows] = await pool.query(
            `SELECT
                a.album_id,
                a.performer_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.label_name,
                v.format_name
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE a.performer_id = ?
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
            [id, Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total,
            totalPages,
            page,
            albums: rows
        })
    } catch (err) {
        next(err)
    }
}

// Get albums by label 
exports.getAlbumsByLabel = async (req, res, next) => {
    const { id } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit 
    const sort = req.query.sort || 'year_asc'

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'a.release_year ASC',
        'year_desc': 'a.release_year DESC'
    }

    const orderBy = sortMap[sort] || 'a.release_year ASC'

    try {
        
        const [countResult] = await pool.query(
            `SELECT COUNT(*) AS total FROM albums WHERE label_id = ?`,
            [id]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        const [rows] = await pool.query(
            `SELECT 
                a.album_id,
                a.performer_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.performer_name,
                v.label_name,
                v.format_name
            FROM albums a 
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE a.label_id = ?
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
            [id, Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total,
            totalPages,
            page,
            albums: rows
        })
    } catch (err) {
        next(err)
    }
}

exports.getFeaturedAlbums = async (req, res, next) => {
    try {
        const currentWeek = getWeekStart()
        const prevWeek = getPrevWeekStart()

        // Check if admin has selected albums for this week
        const [adminPicks] = await pool.execute(
            `SELECT
                a.album_id,
                a.title,
                a.album_image_url,
                a.release_year,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name
            FROM featured_albums fa
            JOIN albums a ON fa.album_id = a.album_id
            JOIN performers p ON a.performer_id = p.performer_id
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            WHERE fa.featured_week = ?
            ORDER BY fa.sort_order ASC, fa.created_at ASC
            LIMIT 20`,
            [currentWeek]
        )
         // If admin picks exist return them
        if (adminPicks.length > 0) {
            return res.status(200).json({
                source: 'admin',
                week: currentWeek,
                albums: adminPicks
            })
        }
        // Otherwise return top 8 highest rated from previous week
        const [topRated] = await pool.execute(
            `SELECT
                a.album_id,
                a.title,
                a.album_image_url,
                a.release_year,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name,
                ROUND(AVG(ar2.rating), 1) AS average_rating,
                COUNT(ar2.rating_id) AS total_ratings
            FROM albums a
            JOIN performers p ON a.performer_id = p.performer_id
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            JOIN album_ratings ar2 ON a.album_id = ar2.album_id
            WHERE ar2.created_at >= ?
            GROUP BY
                a.album_id,
                a.title,
                a.album_image_url,
                a.release_year,
                ar.alias,
                ar.first_name,
                ar.last_name,
                b.band_name
            HAVING COUNT(ar2.rating_id) >= 1
            ORDER BY average_rating DESC, total_ratings DESC
            LIMIT 8`,
            [prevWeek]
        )
        res.status(200).json({
            source: 'ratings',
            week: currentWeek,
            albums: topRated
        })
    } catch (err) {
        next(err)
    }
}

// SET featured albums — admin only
exports.setFeaturedAlbum = async (req, res, next) => {
    const { album_id } = req.body
    const adminId = req.user.users_id

    if (!album_id) {
        return res.status(400).json({ message: 'album_id is required' })
    }

    try {
        const currentWeek = getWeekStart()

        // Check max 8 featured albums per week
        const [count] = await pool.execute(
            `SELECT COUNT(*) AS total FROM featured_albums
            WHERE featured_week = ?`,
            [currentWeek]
        )

        if (count[0].total >= 8) {
            return res.status(400).json({
                message: 'Maximum 8 featured albums per week'
            })
        }

        await pool.execute(
            `INSERT INTO featured_albums (album_id, added_by, featured_week)
            VALUES (?, ?, ?)`,
            [album_id, adminId, currentWeek]
        )

        res.status(201).json({ message: 'Album featured successfully' })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Album already featured this week'
            })
        }
        next(err)
    }
}

// REMOVE featured album — admin only
exports.removeFeaturedAlbum = async (req, res, next) => {
    const { id } = req.params

    try {
        const [result] = await pool.execute(
            `DELETE FROM featured_albums WHERE featured_id = ?`,
            [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Featured album not found' })
        }

        res.status(200).json({ message: 'Featured album removed' })
    } catch (err) {
        next(err)
    }
}

// GET current week's admin featured albums — admin only
exports.getAdminFeatured = async (req, res, next) => {
    try {
        const currentWeek = getWeekStart()

        const [rows] = await pool.execute(
            `SELECT
                fa.featured_id,
                fa.featured_week,
                a.album_id,
                a.title,
                a.album_image_url,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name
            FROM featured_albums fa
            JOIN albums a ON fa.album_id = a.album_id
            JOIN performers p ON a.performer_id = p.performer_id
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            WHERE fa.featured_week = ?
            ORDER BY fa.sort_order ASC, fa.created_at ASC`,
            [currentWeek]
        )

        res.status(200).json({
            week: currentWeek,
            count: rows.length,
            albums: rows
        })
    } catch (err) {
        next(err)
    }
}

// REORDER featured albums — admin only
exports.reorderFeatured = async (req, res, next) => {
    const { ordered_ids } = req.body

    if (!ordered_ids || !Array.isArray(ordered_ids)) {
        return res.status(400).json({ message: 'ordered_ids array is required' })
    }

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        // Update created_at for each featured album to reflect new order
        // We use a sort_order column approach — add it if not exists
        for (let i = 0; i < ordered_ids.length; i++) {
            await con.execute(
                `UPDATE featured_albums SET sort_order = ? WHERE featured_id = ?`,
                [i + 1, ordered_ids[i]]
            )
        }

        await con.commit()
        res.status(200).json({ message: 'Order updated successfully' })
    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}

exports.getAlbumVersions = async (req, res, next)=> {
    const { id } = req.params 

    try {
        // Get the title and performer of the reqquested album 
        const [albumRows] = await pool.query(
            `SELECT title, performer_id FROM albums WHERE album_id = ?`,
            [id]
        )

        if (albumRows.length === 0) {
            return res.status(404).json({ message: 'Album not found' })
        }

        const { title, performer_id } = albumRows[0]

        // Get all versions of this album 
        const [versions] = await pool.query(
            `SELECT 
                a.album_id,
                a.title,
                a.release_year,
                a.album_image_url,
                a.discogs_id,
                a.serial_no,
                a.source,
                f.format_name,
                l.label_name,
                COUNT(ua.user_album_id) AS owned_by_users
            FROM albums a
            LEFT JOIN formats f ON a.format_id = f.format_id
            LEFT JOIN labels l on a.label_id = l.label_id
            LEFT JOIN user_albums ua ON a.album_id = ua.album_id
            WHERE a.title = ?
            GROUP BY
                a.album_id, a.title, a.release_year,
                a.album_image_url, a.discogs_id,
                a.serial_no, a.source,
                f.format_name, l.label_name
            ORDER BY a.release_year ASC, a.album_id ASC`,
            [title, performer_id]
        )

        res.status(200).json({ versions })
    } catch (err) {
        next(err)
    }
}