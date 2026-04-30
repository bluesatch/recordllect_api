const pool = require('../config/dbconfig')
const { sendReportEmail } = require('../config/mailer')

// REPORT an album
exports.reportAlbum = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id
    const { reason } = req.body

    if (!reason) {
        return res.status(400).json({ message: 'Reason is required' })
    }

    if (reason.length > 500) {
        return res.status(400).json({ message: 'Reason must be 500 characters or less' })
    }

    try {
        // Get album and user details for the email
        const [albumRows] = await pool.execute(
            `SELECT
                a.album_id,
                a.title AS album_title,
                u.username
            FROM albums a
            JOIN users u ON u.users_id = ?
            WHERE a.album_id = ?`,
            [userId, id]
        )

        if (albumRows.length === 0) {
            return res.status(404).json({ message: 'Album not found' })
        }

        const [result] = await pool.execute(
            `INSERT INTO reports (album_id, reported_by, reason)
            VALUES (?, ?, ?)`,
            [id, userId, reason]
        )

        // Send email notification to admin
        await sendReportEmail({
            album_title: albumRows[0].album_title,
            username: albumRows[0].username,
            reason
        })

        res.status(201).json({
            message: 'Report submitted successfully',
            report_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'You have already reported this album' })
        }
        next(err)
    }
}

// GET all reports — admin only
exports.getAllReports = async (req, res, next) => {
    const status = req.query.status || 'pending'

    try {
        const [rows] = await pool.execute(
            `SELECT
                r.report_id,
                r.reason,
                r.status,
                r.created_at,
                a.album_id,
                a.title AS album_title,
                a.album_image_url,
                v.performer_name,
                u.users_id AS reporter_id,
                u.username AS reporter_username
            FROM reports r
            JOIN albums a ON r.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            JOIN users u ON r.reported_by = u.users_id
            WHERE r.status = ?
            ORDER BY r.created_at DESC`,
            [status]
        )

        res.status(200).json({
            count: rows.length,
            reports: rows
        })
    } catch (err) {
        next(err)
    }
}

// RESOLVE or DISMISS a report — admin only
exports.updateReport = async (req, res, next) => {
    const { id } = req.params
    const { status } = req.body

    if (!['resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: 'Status must be resolved or dismissed' })
    }

    try {
        const [result] = await pool.execute(
            `UPDATE reports SET status = ? WHERE report_id = ?`,
            [status, id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Report not found' })
        }

        res.status(200).json({ message: `Report ${status} successfully` })
    } catch (err) {
        next(err)
    }
}

// GET report stats — admin only
exports.getReportStats = async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
                COUNT(*) AS total
            FROM reports`
        )

        res.status(200).json({ stats: rows[0] })
    } catch (err) {
        next(err)
    }
}