const pool = require('../config/dbconfig')
const logger = require('../config/logger')

const { sendPushNotification } = require('../config/pushNotifications')

// Helper — create and emit a notification
const createNotification = async (io, {
    recipientId,
    senderId,
    type,
    referenceId,
    message
}) => {
    // Don't notify yourself
    if (recipientId === senderId) return

    try {
        const [result] = await pool.execute(
            `INSERT INTO notifications
            (recipient_id, sender_id, type, reference_id, message)
            VALUES (?, ?, ?, ?, ?)`,
            [recipientId, senderId, type, referenceId || null, message]
        )

        const notificationId = result.insertId

        // Fetch full notification with sender info
        const [rows] = await pool.execute(
            `SELECT
                n.*,
                u.username AS sender_username,
                u.profile_image_url AS sender_image
            FROM notifications n
            JOIN users u ON n.sender_id = u.users_id
            WHERE n.notification_id = ?`,
            [notificationId]
        )

        const notification = rows[0]

        // Send real-time via Socket.io
        io.to(`user_${recipientId}`).emit('notification', notification)

        // Send push notification
        const [recipientRows] = await pool.execute(
            `SELECT push_token FROM users WHERE users_id = ?`,
            [recipientId]
        )

        const pushToken = recipientRows[0]?.push_token

        if (pushToken) {
            await sendPushNotification(
                pushToken,
                'Groovist',
                message,
                {
                    type,
                    reference_id: referenceId,
                    notification_id: notificationId
                }
            )
        }

        return notification

    } catch (err) {
        console.error('Failed to create notification:', { error: err.message })
    }
}

// GET user's notifications
exports.getNotifications = async (req, res, next) => {
    const userId = req.user.users_id
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit

    try {
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) AS total FROM notifications WHERE recipient_id = ?`,
            [userId]
        )

        const [unreadResult] = await pool.execute(
            `SELECT COUNT(*) AS unread FROM notifications 
            WHERE recipient_id = ? AND is_read = 0`,
            [userId]
        )

        const [rows] = await pool.query(
            `SELECT
                n.notification_id,
                n.type,
                n.reference_id,
                n.message,
                n.is_read,
                n.created_at,
                u.users_id AS sender_id,
                u.username AS sender_username,
                u.profile_image_url AS sender_image
            FROM notifications n
            JOIN users u ON n.sender_id = u.users_id
            WHERE n.recipient_id = ?
            ORDER BY n.created_at DESC
            LIMIT ? OFFSET ?`,
            [userId, Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total: countResult[0].total,
            unread: unreadResult[0].unread,
            page,
            totalPages: Math.ceil(countResult[0].total / limit),
            notifications: rows
        })
    } catch (err) {
        next(err)
    }
}

// MARK notification as read
exports.markAsRead = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        await pool.execute(
            `UPDATE notifications SET is_read = 1
            WHERE notification_id = ? AND recipient_id = ?`,
            [id, userId]
        )

        res.status(200).json({ message: 'Notification marked as read' })
    } catch (err) {
        next(err)
    }
}

// MARK ALL as read
exports.markAllAsRead = async (req, res, next) => {
    const userId = req.user.users_id

    try {
        await pool.execute(
            `UPDATE notifications SET is_read = 1 WHERE recipient_id = ?`,
            [userId]
        )

        res.status(200).json({ message: 'All notifications marked as read' })
    } catch (err) {
        next(err)
    }
}

// DELETE notification
exports.deleteNotification = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [result] = await pool.execute(
            `DELETE FROM notifications
            WHERE notification_id = ? AND recipient_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found' })
        }

        res.status(200).json({ message: 'Notification deleted' })
    } catch (err) {
        next(err)
    }
}

module.exports = { ...exports, createNotification }