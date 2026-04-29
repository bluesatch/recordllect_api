const pool = require('../config/dbconfig')

// GET rating stats for an album
exports.getAlbumRatings = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id

    try {
        
        // Overall stats 
        const [ stats ] = await pool.execute(
            `SELECT 
                COUNT(*) AS total_ratings,
                ROUND(AVG(rating), 1) AS average_rating,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS four,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS three,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS two,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS one 
            FROM album_ratings
            WHERE album_id = ?`,
            [id]
        )

        // Check if current user has rated 
        const [ userRating ] = await pool.execute(
            `SELECT rating_id, rating FROM album_ratings
            WHERE album_id = ? AND users_id = ?`,
            [id, userId]
        )

        res.status(200).json({
            stats: stats[0],
            user_rating: userRating[0] || null
        })
    } catch (err) {
        next(err)
    }
}

// RATE an album 
exports.rateAlbum = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 
    const { rating } = req.body 

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5'})
    }

    try {
        
        const [ result ] = await pool.execute(
            `INSERT INTO album_ratings (users_id, album_id, rating)
            VALUES (?, ?, ?)`,
            [userId, id, rating]
        )

        res.status(201).json({
            message: 'Album rated successfully',
            rating_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'You have already rated this album'})
        }
        next(err)
    }
}

// UPDATE rating 
exports.updateRating = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id
    const { rating } = req.body 

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5'})
    }

    try {
        const [ result ] = await pool.execute(
            `UPDATE album_ratings SET rating = ?
            WHERE album_id = ? AND users_id = ?`,
            [rating, id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rating not found'})
        }

        res.status(200).json({ message: 'Rating updated successfully'})
    } catch (err) {
        next(err)
    }
}

// DELETE rating 
exports.deleteRating = async (req, res, next)=> {
    const { id } = req.params
    const userId = req.user.users_id 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM album_ratings
            WHERE album_id = ? AND users_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rating not found' })
        }

        res.status(200).json({ message: 'Rating removed successfully'})
    } catch (err) {
        next(err)
    }
}