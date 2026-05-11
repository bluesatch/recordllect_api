const pool = require('../config/dbconfig')

/**
 * Ownership middleware
 * Verifies the requesting user owns the resource before allowing 
 * write/delete operations
 */

// Check post ownership
exports.verifyPostOwnership = async (req, res, next)=> {
    const userId = req.user.users_id 
    const { id } = req.params 

    try {
        
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM posts WHERE post_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Post not found' })
        }

        if (rows[0].users_id !== userId) {
            return res.status(403).json({ message: 'Not authorized' })
        }

        next(0)
    } catch (err) {
        next()
    }
}

// Check comment ownership
exports.verifyCommentOwnership = async (req, res, next)=> {
    const userId = req.user.users_id 
    const { commentId } = req.params 

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM comments WHERE comment_id = ?`,
            [commentId]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Comment not found' })
        }

        if (rows[0].users_id !== userId) {
            return res.status(403).json({ message: 'Not authorized'})
        }

        next()
    } catch (err) {
        next()
    }
}

// Check review ownership 
exports.verifyReviewOwnership = async (req, res, next)=> {
    const userId = req.user.users_id 
    const { id } = req.params 

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM album_reviews WHERE review_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Review not found' })
        }

        if (rows[0].users_id !== userId) {
            return res.status(403).json({ message: 'Not authorized' })
        }

        next()
    } catch (err) {
        next()
    }
}

// Check user owndership - user can only edit their own profile 
exports.verifyUserOwnership = (req, res, next)=> {
    const userId = req.user.users_id 
    const { id } = req.params 

    if (parseInt(id) !== userId) {
        return res.status(403).json({ message: 'Not authorized'})
    }

    next()
}