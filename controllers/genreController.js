const pool = require('../config/dbconfig')

exports.getAllGenres = async (req, res, next)=> {
    try {
        const [ rows ] = await pool.execute(
            `SELECT genre_id, genre_name FROM genres ORDER BY genre_name ASC`
        )
        res.status(200).json({ genres: rows})
    } catch (err) {
        next(err)
    }
}