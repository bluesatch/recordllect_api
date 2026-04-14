const pool = require('../config/dbconfig')

exports.getAllFormats = async (req, res, next)=> {
    try {
        const [ rows ] = await pool.execute(
            `SELECT format_id, format_name FROM formats ORDER BY format_name ASC`
        )
        res.status(200).json({ formats: rows })
    } catch (err) {
        next(err)
    }
}