const pool = require('../config/dbconfig')

// GET tracks for an album
exports.getAlbumTracks = async (req, res, next) => {
    const { id } = req.params

    try {
        const [rows] = await pool.execute(
            `SELECT
                track_id,
                position,
                title,
                duration,
                track_order
            FROM tracks
            WHERE album_id = ?
            ORDER BY track_order ASC`,
            [id]
        )

        res.status(200).json({
            count: rows.length,
            tracks: rows
        })
    } catch (err) {
        next(err)
    }
}

// DELETE a track — admin only
exports.deleteTrack = async (req, res, next) => {
    const { id } = req.params

    try {
        const [result] = await pool.execute(
            `DELETE FROM tracks WHERE track_id = ?`,
            [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Track not found' })
        }

        res.status(200).json({ message: 'Track deleted successfully' })
    } catch (err) {
        next(err)
    }
}