const pool = require('../config/dbconfig')

// GET user's Top Eight
exports.getTopEight = async (req, res, next)=> {
    const { id } = req.params 

    try {
        const [ rows ] = await pool.execute(
            `SELECT 
                t.top_eight_id,
                t.position,
                t.album_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.performer_name,
                v.performer_id,
                v.label_name,
                v.format_name
            FROM  user_top_eight t 
            JOIN albums a ON t.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE t.users_id = ?
            ORDER BY t.position ASC`,
            [id]
        )

        res.status(200).json({
            count: rows.length,
            top_eight: rows
        })
    } catch (err) {
        next(err)
    }
}

// ADD album to Top Eight 
exports.addToTopEight = async (req, res, next)=> {
    const { id } = req.params 
    const { album_id, position } = req.body 

    if (!album_id) {
        return res.status(400).json({ message: 'album_id is required'})
    }

    try {
        // Find the next available position if not specified 
        let targetPosition = position

        if (!targetPosition) {
            const [ taken ] = await pool.execute(
                `SELECT position FROM user_top_eight
                WHERE users_id = ?
                ORDER BY position ASC`,
                [id]
            )

            const takenPositions = taken.map(r => r.position)

            // Find first available position 1-8
            for (let i = 1; i <= 8; i++) {
                if (!takenPositions.includes(i)) {
                    targetPosition = i
                    break 
                }
            }

            if (!targetPosition) {
                return res.status(400).json({
                    message: 'Top Eight is full. Remove an album first.'
                })
            }
        }

        await pool.execute(
            `INSERT INTO user_top_eight (users_id, album_id, position) VALUES (?, ?, ?)`,
            [id, album_id, targetPosition]
        )

        res.status(201).json({
            message: 'Album added to Top Eight',
            position: targetPosition
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const message = err.message.includes('unique_user_position')
                ? 'That position is already taken'
                : 'Album is already in your Top Eight'
            return res.status(409).json({ message })
        }
        next(err)
    }
}

// REMOVE album from Top Eight 
exports.removeFromTopEight = async (req, res, next)=> {
    const { id, position } = req.params 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM user_top_eight
            WHERE users_id = ? AND position = ?`,
            [id, position]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'No album found at that position'
            })
        }

        res.status(200).json({ message: 'Album removed from Top Eight'})
    } catch (err) {
        next(err)
    }
}