const pool = require('../config/dbconfig')

// GET reviews for an album 
exports.getAlbumReviews = async (req, res, next)=> {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                r.review_id,
                r.body,
                r.created_at,
                r.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                ar.rating,
                COUNT(DISTINCT rr.review_rating_id) AS helpful_count,
                MAX(CASE WHEN rr.users_id = ? THEN 1 ELSE 0 END) AS marked_helpful
            FROM album_reviews r 
            JOIN users u ON r.users_id = u.users_id
            LEFT JOIN album_ratings ar ON r.album_id = ar.album_id  
                AND r.users_id = ar.users_id 
            LEFT JOIN review_ratings rr ON r.review_id = rr.review_id
            WHERE r.album_id = ?
            GROUP BY 
                r.review_id,
                r.body,
                r.created_at,
                r.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                ar.rating
            ORDER BY helpful_count DESC, r.created_at DESC`,
            [userId, id]
        )

        res.status(200).json({
            count: rows.length,
            reviews: rows
        })
    } catch (err) {
        next(err)
    }
}

// CREATE review 
exports.createReview = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id
    const { body } = req.body 

    if (!body) {
        return res.status(400).json({ message: 'Review body is required'})
    }

    if (body.length > 350) {
        return res.status(400).json({ message: 'Review must be 350 characters or less' })
    }

    try {
        const [ result ] = await pool.execute(
            `INSERT INTO album_reviews (users_id, album_id, body)
            VALUES (?, ?, ?)`,
            [userId, id, body]
        )

        res.status(201).json({
            message: 'Review created successfully',
            review_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'You have already reviewed this album' })
        }

        next(err)
    } 
}

// UPDATE review 
exports.updateReview = async (req, res, next)=> {
    const { id } = req.params
    const userId = req.user.users_id
    const { body } = req.body

    if (!body) {
        return res.status(400).json({ message: 'Review body is required' })
    }

    if (body.length > 350) {
        return res.status(400).json({ message: 'Review must be 350 characters or less' })
    }

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM album_reviews WHERE review_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Review not found'})
        }

        if (rows[0].users_id !== userId) {
            return res.status(403).json({ message: 'You can only edit your own reviews' })
        }

        await pool.execute(
            `UPDATE album_reviews SET body = ? WHERE review_id = ?`,
            [body, id]
        )

        res.status(200).json({ message: 'Review updated successfully' })
    } catch (err) {
        next(err)
    }
}

// DELETE review 
exports.deleteReview = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM album_reviews WHERE review_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Review not found'})
        }

        if (rows[0].users_id !== userId && !req.user.is_admin) {
            return res.status(403).json({ message: 'You can only delete your own review' })
        }

        await pool.execute(
            `DELETE FROM album_reviews WHERE review_id = ?`,
            [id]
        )

        res.status(200).json({ message: 'Review deleted successfully' })
    } catch (err) {
        next(err)
    }
}

// MARK review as helpful 
exports.markHelpful = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        await pool.execute(
            `INSERT INTO review_ratings (users_id, review_id, helpful)
            VALUES (?, ?, 1)`,
            [userId, id]
        )

        res.status(201).json({ message: 'Review marked as helpful' })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already marked as helpful' })
        }
        next(err)
    }
}

// UNMARK review as helpful 
exports.unmarkHelpful = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM review_ratings
            WHERE review_id = ? AND users_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Helpful mark not found' })
        }

        res.status(200).json({ message: 'Helpful mark removed' })
    } catch (err) {
        next(err)
    }
}