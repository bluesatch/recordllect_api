const pool = require('../config/dbconfig')

// Helper - check if requesting user is a follower 
const isFollower = async (requesterId, profileId)=> {
    const [ rows ] = await pool.execute(
        `SELECT follow_id FROM follows 
        WHERE follower_id = ? AND following_id = ?`,
        [requesterId, profileId]
    )
    return rows.length > 0
}

// GET user's wantlist - followers only 
exports.getWantlist = async (req, res, next)=> {
    const { id } = req.params
    const requesterId = req.user.users_id

    try {
        // OWNER CAN ALWAYS SEE THEIR OWN WANTLIST 
        if (parseInt(id) !== requesterId) {
            const following = await isFollower(requesterId, id)
            if (!following) {
                return resizeBy.status(403).json({
                    message: 'You must be following this user to view their wantlist'
                })
            }
        }

        const [ rows ] = await pool.execute(
            `SELECT
                w.wantlist_id,
                w.notes,
                w.priority,
                w.added_at,
                a.album_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.performer_name,
                v.performer_id,
                v.label_name,
                v.format_name
            FROM wantlists w 
            JOIN albums a ON w.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id 
            WHERE w.users_id = ?
            ORDER BY 
                CASE w.priority 
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 3
                END,
                w.added_at DESC`,
            [id]
        )

        res.status(200).json({
            count: rows.length,
            wantlist: rows
        })
    } catch (err) {
        next(err)
    }
}

// ADD ALBUM TO WANTLIST 
exports.addToWantlist = async (req, res, next)=> {
    const { id } = req.params 
    const { album_id, notes, priority } = req.body 

    if (!album_id) {
        return res.status(400).json({ message: 'album_id is required'})
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
        return res.status(400).json({ message: 'priority must be low, medium, or high' })
    }

    try {
        const [ result ] = await pool.execute(
            `INSERT INTO wantlists (users_id, album_id, notes, priority)
            VALUES (?, ?, ?, ?)`,
            [id, album_id, notes || null, priority || 'medium']
        )

        res.status(201).json({
            message: 'Album added to wantlist',
            wantlist_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Album already on wantlist' })
        }
        next(err)
    }
}

// UPDATE wantlist item - notes and priority only 
exports.updateWantlistItem = async (req, res, next)=> {
    const { id, wantlist_id } = req.params 
    const { notes, priority } = req.body 

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
        return res.status(400).json({ message: 'priority must be low, medium, or high'})
    }

    try {
        const [ result ] = await pool.execute(
            `UPDATE wantlists SET 
                notes = COALESCE(?, notes),
                priority = COALESCE(?, priority)
            WHERE wantlist_id = ? AND users_id = ?`,
            [notes || null, priority || null, wantlist_id, id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Wantlist item not found'})
        }

        res.status(200).json({ message: 'Wantlist item updated successfully' })
    } catch (err) {
        next(err)
    }
}

// REMOVE album fro wantlist 
exports.removeFromWantlist = async (req, res, next)=> {
    const { id, wantlist_id } = req.params 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM wantlists 
            WHERE wantlist_id = ? AND users_id = ?`,
            [wantlist_id, id]
        )

        if (result.affectedRows === 0 ) {
            return res.status(404).json({ message: 'Wantlist item not found'})
        }

        res.status(200).json({ message: 'Album removed from wantlist'})
    } catch (err) {
        next(err)
    }
}

// CHECK if album is on wantlist 
exports.checkWantlist = async (req, res, next)=> {
    const { id, album_id } = req.params 

    try {
        const [ rows ] = await pool.execute(
            `SELECT wantlist_id, notes, priority 
            FROM wantlists 
            WHERE users_id = ? AND album_id = ?`,
            [id, album_id]
        )

        res.status(200).json({
            onWantlist: rows.length > 0,
            wantlist_id: rows[0]?.wantlist_id || null,
            notes: rows[0]?.notes || null,
            priority: rows[0]?.priority || null
        })
    } catch (err) {
        next(err)
    }
}