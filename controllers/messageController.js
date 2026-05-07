const pool = require('../config/dbconfig')

// Helper to ensure consistent conversation ordering => always store lower user_id as user_one_id
const orderUsers = (userA, userB)=> {
    return userA < userB 
        ? { user_one_id: userA, user_two_id: userB }
        : { user_one_id: userB, user_two_id: userA }
}

// GET /conversations - get all conversations for current user 
exports.getConversations = async (req, res, next)=> {
    const userId = req.user.users_id

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                c.conversation_id,
                c.updated_at,
                -- Other user's info
                CASE
                    WHEN c.user_one_id = ? THEN c.user_two_id
                    ELSE c.user_one_id
                END AS other_user_id,
                CASE 
                    WHEN c.user_one_id = ? THEN u2.username
                    ELSE u1.username
                END AS other_username,
                CASE
                    WHEN c.user_one_id = ? THEN u2.profile_image_url
                    ELSE u1.profile_image_url
                END AS other_profile_image_url,
                -- Latest message preview 
                m.body AS last_message,
                m.image_url AS last_message_image,
                m.sender_id AS last_message_sender_id,
                m.created_at AS last_message_at,
                -- Unread count
                SUM(CASE 
                    WHEN m2.is_read = 0 AND m.sender_id != ? THEN 1
                    ELSE 0
                END) AS unread_count
            FROM conversations c
            JOIN users u1 ON c.user_one_id = u1.users_id
            JOIN users u2 ON c.user_two_id = u2.users_id
            -- Latest message
            LEFT JOIN messages m ON m.message_id = (
                SELECT message_id FROM messages
                WHERE conversation_id = c.conversation_id
                ORDER BY created_at DESC
                LIMIT 1
            )
            -- Unread messages
            LEFT JOIN messages m2 ON m2.conversation_id = c.conversation_id
            WHERE c.user_one_id = ? OR c.user_two_id = ?
            GROUP BY
                c.conversation_id,
                c.updated_at,
                other_user_id,
                other_username,
                other_profile_image_url,
                m.body,
                m.image_url,
                m.sender_id,
                m.created_at
            ORDER BY c.updated_at DESC`,
            [userId, userId, userId, userId, userId, userId]
        )

        res.status(200).json({ conversations: rows })
    } catch (err) {
        next(err)
    }
}

// POST /conversations — start or get existing conversation
exports.startConversation = async (req, res, next) => {
    const userId = req.user.users_id
    const { other_user_id } = req.body

    if (!other_user_id) {
        return res.status(400).json({ message: 'other_user_id is required' })
    }

    if (parseInt(other_user_id) === userId) {
        return res.status(400).json({ message: 'Cannot start conversation with yourself' })
    }

    const { user_one_id, user_two_id } = orderUsers(userId, parseInt(other_user_id))

    try {
        // Check if conversation already exists
        const [existing] = await pool.execute(
            `SELECT conversation_id FROM conversations
            WHERE user_one_id = ? AND user_two_id = ?`,
            [user_one_id, user_two_id]
        )

        if (existing.length > 0) {
            return res.status(200).json({
                conversation_id: existing[0].conversation_id,
                existed: true
            })
        }
        // Create new conversation
        const [result] = await pool.execute(
            `INSERT INTO conversations (user_one_id, user_two_id)
            VALUES (?, ?)`,
            [user_one_id, user_two_id]
        )

        res.status(201).json({
            conversation_id: result.insertId,
            existed: false
        })
    } catch (err) {
        next(err)
    }
}

// GET /conversations/:id/messages — get messages in a conversation
exports.getMessages = async (req, res, next) => {
    const userId = req.user.users_id
    const { id } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 30
    const offset = (page - 1) * limit

    try {
        // Verify user is part of this conversation
        const [conversation] = await pool.execute(
            `SELECT conversation_id FROM conversations
            WHERE conversation_id = ?
            AND (user_one_id = ? OR user_two_id = ?)`,
            [id, userId, userId]
        )

        if (conversation.length === 0) {
            return res.status(403).json({ message: 'Access denied' })
        }

        // Fetch messages
        const [messages] = await pool.execute(
            `SELECT
                m.message_id,
                m.conversation_id,
                m.sender_id,
                m.body,
                m.image_url,
                m.is_read,
                m.created_at,
                u.username AS sender_username,
                u.profile_image_url AS sender_profile_image_url
            FROM messages m
            JOIN users u ON m.sender_id = u.users_id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?`,
            [id, limit, offset]
        )

        // Count total
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) AS total FROM messages
            WHERE conversation_id = ?`,
            [id]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        // Mark messages as read
        await pool.execute(
            `UPDATE messages
            SET is_read = 1
            WHERE conversation_id = ?
            AND sender_id != ?
            AND is_read = 0`,
            [id, userId]
        )

        res.status(200).json({
            messages: messages.reverse(), // chronological order
            total,
            totalPages,
            page
        })
    } catch (err) {
        next(err)
    }
}

// POST /conversations/:id/messages — send a message
exports.sendMessage = async (req, res, next) => {
    const userId = req.user.users_id
    const { id } = req.params
    const { body, image_url } = req.body

    if (!body?.trim() && !image_url) {
        return res.status(400).json({
            message: 'Message must have text or an image'
        })
    }

    try {
        // Verify user is part of this conversation
        const [conversation] = await pool.execute(
            `SELECT conversation_id, user_one_id, user_two_id
            FROM conversations
            WHERE conversation_id = ?
            AND (user_one_id = ? OR user_two_id = ?)`,
            [id, userId, userId]
        )

        if (conversation.length === 0) {
            return res.status(403).json({ message: 'Access denied' })
        }

        // Insert message
        const [result] = await pool.execute(
            `INSERT INTO messages
            (conversation_id, sender_id, body, image_url)
            VALUES (?, ?, ?, ?)`,
            [id, userId, body?.trim() || null, image_url || null]
        )

        // Fetch the new message with sender info
        const [newMessage] = await pool.execute(
            `SELECT
                m.message_id,
                m.conversation_id,
                m.sender_id,
                m.body,
                m.image_url,
                m.is_read,
                m.created_at,
                u.username AS sender_username,
                u.profile_image_url AS sender_profile_image_url
            FROM messages m
            JOIN users u ON m.sender_id = u.users_id
            WHERE m.message_id = ?`,
            [result.insertId]
        )

        // Update conversation updated_at
        await pool.execute(
            `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = ?`,
            [id]
        )

        // Emit via Socket.io to the other user
        const io = req.app.get('io')
        const conv = conversation[0]
        const recipientId = conv.user_one_id === userId
            ? conv.user_two_id
            : conv.user_one_id

        io.to(`user_${recipientId}`).emit('new_message', {
            message: newMessage[0],
            conversation_id: parseInt(id)
        })

        // Also emit unread count update
        io.to(`user_${recipientId}`).emit('message_unread_count')

        res.status(201).json({ message: newMessage[0] })
    } catch (err) {
        next(err)
    }
}

// GET /conversations/unread — get total unread message count
exports.getUnreadCount = async (req, res, next) => {
    const userId = req.user.users_id

    try {
        const [result] = await pool.execute(
            `SELECT COUNT(*) AS unread_count
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.conversation_id
            WHERE (c.user_one_id = ? OR c.user_two_id = ?)
            AND m.sender_id != ?
            AND m.is_read = 0`,
            [userId, userId, userId]
        )

        res.status(200).json({ unread_count: result[0].unread_count })
    } catch (err) {
        next(err)
    }
}

// DELETE /conversations/:id — delete a conversation
exports.deleteConversation = async (req, res, next) => {
    const userId = req.user.users_id
    const { id } = req.params

    try {
        const [result] = await pool.execute(
            `DELETE FROM conversations
            WHERE conversation_id = ?
            AND (user_one_id = ? OR user_two_id = ?)`,
            [id, userId, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Conversation not found' })
        }

        res.status(200).json({ message: 'Conversation deleted' })
    } catch (err) {
        next(err)
    }
}