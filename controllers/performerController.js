const pool = require('../config/dbconfig')

exports.createPerformer = async (req, res, next)=> {
    const {
        performer_type,
        first_name,
        last_name,
        alias,
        date_of_birth,
        date_of_death,
        band_name,
        formed_year,
        disbanded_year,
        country
    } = req.body

    // Input validation
    if (!performer_type) {
        return res.status(400).json({ message: 'performer_type is required' })
    }

    if (!['artist', 'band'].includes(performer_type)) {
        return res.status(400).json({ message: 'performer_type must be artist or band' })
    }

    if (performer_type === 'artist' && !alias && (!first_name || !last_name)) {
        return res.status(400).json({ message: 'An artist requires either an alias or a first and last name'})
    }

    if (performer_type === 'band' && !band_name) {
        return res.status(400).json({ message: 'A band requires a band_name'})
    }

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        /**
         * Transaction => a group of database operations that are treated as a single unit of work - either all of them succeed together or none of them do.
         * 
         * ACID properties
         * 
         * Atomic - all or nothing
         * Consistent - db moves from one valid state to another
         * Isolated - transactions don't interfere with each other
         * Durable - once a transaction is committed, it's permanent
         */

        // 1. Insert into performers
        const [ performerResult ] = await con.execute(
            `INSERT INTO performers (performer_type) VALUES (?)`,
            [performer_type]
        )

        const performer_id = performerResult.insertId

        // 2. Insert into artists or bands
        if (performer_type === 'artist') {
            await con.execute(
                `INSERT INTO artists (performer_id, first_name, last_name, alias, date_of_birth, date_of_death) VALUES (?, ?, ?, ?, ?, ?)`,
                [performer_id, first_name || null, last_name || null, alias || null, date_of_birth || null, date_of_death || null]
            )
        } else {
            await con.execute(
                `INSERT INTO bands (performer_id, band_name, formed_year, disbanded_year, country)
                VALUES (?, ?, ?, ?, ?)`,
                [performer_id, band_name, formed_year || null, disbanded_year || null, country || null]
            )
        }

        await con.commit()

        res.status(201).json({
            message: `${performer_type} created successfully`,
            performer_id
        })        
    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}