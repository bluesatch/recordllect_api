const pool = require('../config/dbconfig')

// GET comments for a post 
exports.getComments = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                c.comment_id,
                c.body,
                c.created_at,
                c.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT cl.like_id) AS like_count,
                MAX(CASE WHEN cl.users_id = ? THEN 1 ELSE 0 END) as liked_by_user
            FROM comments c 
            JOIN users u ON c.users_id = u.users_id 
            LEFT JOIN comment_likes cl ON c.comment_id = cl.comment_id 
            WHERE c.post_id = ?
            GROUP BY 
                c.comment_id,
                c.body,
                c.created_at,
                c.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url
            ORDER BY c.created_at ASC`,
            [userId, id]
        )

        // Fetch replies for each comment 
        const comments = await Promise.all(rows.map(async comment => {
            const [ replies ] = await pool.execute(
                `SELECT 
                    r.reply_id,
                    r.body,
                    r.created_at,
                    u.users_id,
                    u.username,
                    u.profile_image_url
                FROM replies r 
                JOIN users u ON r.users_id = u.users_id
                WHERE r.comment_id = ?
                ORDER BY r.created_at ASC`,
                [comment.comment_id]
            )

            return { ...comment, replies}
        }))

        res.status(200).json({
            count: comments.length, 
            comments
        })
    } catch (err) {
        next(err)
    }
}

// ADD comment 
exports.addComment = async (req, res, next)=> {
    const { id } = req.params
    const userId = req.user.users_id 
    const { body } = req.body 

    if (!body) {
        return res.status(400).json({ message: 'Comment body is required'})
    }

    try {
        const [ result ] = await pool.execute(
            `INSERT INTO comments (post_id, users_id, body) VALUES (?, ?, ?)`,
            [id, userId, body]
        )

        res.status(201).json({
            message: 'Comment added',
            comment_id: result.insertId
        })
    } catch (err) {
        next(err)
    }
}

// DELETE comment 
exports.deleteComment = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM comments WHERE comment_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Comment not found'})
        }

        if (rows[0].users_id !== userId && !req.user.is_admin) {
            return res.status(403).json({ message: 'You can only delete your own comments' })
        }

        await pool.execute(`DELETE FROM comments WHERE comment_id = ?`, [id])

        res.status(200).json({ message: 'Comment deleted' })
    } catch (err) {
        next(err)
    }
}

// LIKE a comment
exports.likeComment = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        await pool.execute(
            `INSERT INTO comment_likes (comment_id, users_id) VALUES (?, ?)`,
            [id, userId]
        )

        res.status(201).json({ message: 'Comment liked' })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already liked this comment' })
        }
        next(err)
    }
}

// UNLIKE a comment
exports.unlikeComment = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [result] = await pool.execute(
            `DELETE FROM comment_likes WHERE comment_id = ? AND users_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Like not found' })
        }

        res.status(200).json({ message: 'Comment unliked' })
    } catch (err) {
        next(err)
    }
}

// ADD reply
exports.addReply = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id
    const { body } = req.body

    if (!body) {
        return res.status(400).json({ message: 'Reply body is required' })
    }

    try {
        const [result] = await pool.execute(
            `INSERT INTO replies (comment_id, users_id, body) VALUES (?, ?, ?)`,
            [id, userId, body]
        )

        res.status(201).json({
            message: 'Reply added',
            reply_id: result.insertId
        })
    } catch (err) {
        next(err)
    }
}

// DELETE reply
exports.deleteReply = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [rows] = await pool.execute(
            `SELECT users_id FROM replies WHERE reply_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Reply not found' })
        }

        if (rows[0].users_id !== userId && !req.user.is_admin) {
            return res.status(403).json({ message: 'You can only delete your own replies' })
        }

        await pool.execute(`DELETE FROM replies WHERE reply_id = ?`, [id])

        res.status(200).json({ message: 'Reply deleted' })
    } catch (err) {
        next(err)
    }
}