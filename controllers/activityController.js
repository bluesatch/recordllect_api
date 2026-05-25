const pool = require('../config/dbconfig')

// Helper - log an activity event 
const logActivity = async (userId, activityType, referenceId = null, referenceId2 = null)=> {
    try {
        await pool.query(
            `INSERT INTO activity
                (users_id, activity_type, reference_id, reference_id_2)
            VALUES (?, ?, ?, ?)`,
            [userId, activityType, referenceId, referenceId2]
        )
    } catch (err) {
        console.error('Failed to log activity:', err.message)
    }
}

// GET /activity/feed - get activity from followed users 
exports.getActivityFeed = async (req, res, next)=> {
    const userId = req.user.users_id
    const page = parseInt(req.query.page) || 1 
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit 

    try {
        const [rows] = await pool.query(
            `SELECT
                act.activity_id,
                act.activity_type,
                act.reference_id,
                act.reference_id_2,
                act.created_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                a.title AS album_title,
                a.album_image_url,
                a.release_year,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name,
                u2.username AS followed_username,
                u2.profile_image_url AS followed_profile_image_url
            FROM activity act
            JOIN users u ON act.users_id = u.users_id
            LEFT JOIN albums a ON (
                act.activity_type IN ('added_album', 'reviewed_album', 'added_wantlist')
                AND a.album_id = act.reference_id
            )
            LEFT JOIN performers p ON a.performer_id = p.performer_id
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            LEFT JOIN users u2 ON (
                act.activity_type = 'followed_user'
                AND u2.users_id = act.reference_id
            )
            WHERE act.users_id IN (
                SELECT following_id FROM follows WHERE follower_id = ?
            )
            OR act.users_id = ?
            ORDER BY act.created_at DESC
            LIMIT ? OFFSET ?`,
            [userId, userId, limit, offset]
        )

        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total
            FROM activity act
            WHERE act.users_id IN (
                SELECT following_id FROM follows WHERE follower_id = ?
            )
            OR act.users_id = ?`,
            [userId, userId]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        res.status(200).json({
            activities: rows,
            total,
            page,
            totalPages
        })
    } catch (err) {
        next(err)
    }
}

module.exports = { logActivity, getActivityFeed: exports.getActivityFeed }