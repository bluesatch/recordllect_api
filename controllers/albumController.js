const pool = require('../config/dbconfig')

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
    try {
        const [ rows ] = await pool.execute(
            `SELECT 
                a.album_id,
                a.title,
                a.serial_no,
                a.release_year,
                a.duration_seconds,
                a.album_image_url,
                v.performer_type,
                v.performer_name,
                v.label_name,
                v.format_name,
                GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ') AS genres
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            LEFT JOIN album_genres ag ON a.album_id = ag.album_id
            LEFT JOIN genres g ON ag.genre_id = g.genre_id
            GROUP BY 
                a.album_id,
                a.title,
                a.serial_no,
                a.release_year,
                a.duration_seconds,
                a.album_image_url,
                v.performer_type,
                v.performer_name,
                v.label_name,
                v.format_name
            ORDER BY a.release_year ASC`
        )

        res.status(200).json({
            count: rows.length,
            albums: rows
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
                a.album_id,
                a.title,
                a.serial_no,
                a.release_year,
                a.duration_seconds,
                a.album_image_url,
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
