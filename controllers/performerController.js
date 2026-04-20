const pool = require('../config/dbconfig')


// CREATE PERFORMER
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

// GET ALL PERFORMERS
exports.getAllPerformers = async (req, res, next)=> {

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit 
    const search = req.query.search || ''
    const type = req.query.type || ''

    try {

        const conditions = []
        const params = []

        if (search) {
            conditions.push(`(
                ar.alias LIKE ? OR 
                CONCAT(ar.first_name, ' ', ar.last_name) LIKE ? OR
                b.band_name LIKE ?
            )`)
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (type && ['artist', 'band'].includes(type)) {
            conditions.push(`p.performer_type = ?`)
            params.push(type)
        }

        const whereClause = conditions.length > 0 
            ? `WHERE ${conditions.join(' AND ')}`
            : ''
        
        // COUNT TOTAL
        const [ countResult ] = await pool.query(
            `SELECT COUNT(*) AS total
            FROM performers p
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            ${whereClause}`,
            params
        )

        const total = countResult[0].total 
        const totalPages = Math.ceil(total / limit)

        // FETCH PAGINATED RESULTS
        const [ rows ] = await pool.query(
            `SELECT
                p.performer_id,
                p.performer_type,
                COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name), b.band_name) AS performer_name,
                ar.date_of_birth,
                ar.date_of_death,
                b.formed_year,
                b.disbanded_year,
                b.country,
                p.created_at
            FROM performers p
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            ${whereClause}
            ORDER by performer_name ASC
            LIMIT ? OFFSET ?`,
            [...params, Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total,
            totalPages,
            performers: rows
        })
    } catch (err) {
        next(err)
    }
}

// GET PERFORMER BY ID
exports.getPerformerById = async (req, res, next) => {
    const { id } = req.params

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                p.performer_id,
                p.performer_type,
                ar.first_name,
                ar.last_name,
                ar.alias,
                ar.date_of_birth,
                ar.date_of_death,
                b.band_name,
                b.formed_year,
                b.disbanded_year,
                b.country,
                p.created_at
            FROM performers p
            LEFT JOIN artists ar ON p.performer_id = ar.performer_id
            LEFT JOIN bands b ON p.performer_id = b.performer_id
            WHERE p.performer_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Performer not found' })
        }

        const performer = rows[0]

        // If artist, also fetch their instruments
        if (performer.performer_type === 'artist') {
            const [ instruments ] = await pool.execute(
                `SELECT i.instrument_id, i.instrument_name
                FROM artist_instruments ai
                JOIN instruments i ON ai.instrument_id = i.instrument_id
                WHERE ai.artist_id = (
                    SELECT artist_id FROM artists WHERE performer_id = ?)`,
                [id]
            )
            performer.instruments = instruments
        }

        //  If band, also fetch their members
        if (performer.performer_type === 'band') {
            const [ members ] = await pool.execute(
                    `SELECT
                        ar.artist_id,
                        COALESCE(ar.alias, CONCAT(ar.first_name, ' ', ar.last_name)) AS member_name,
                        bm.joined_year,
                        bm.left_year
                    FROM band_members bm
                    JOIN artists ar ON bm.artist_id = ar.artist_id
                    WHERE bm.band_id = (
                        SELECT band_id FROM bands WHERE performer_id = ?
                    )`,
                    [id]
            )
            performer.members = members
        }

        res.status(200).json(performer)
    } catch (err) {
        next(err)
    }
}


// UPDATE PERFORMER
exports.updatePerformer = async (req, res, next)=> {
    const { id } = req.params
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

    const con = await pool.getConnection()

    try {   
        await con.beginTransaction()

        const [ rows ] = await con.execute(
                `SELECT performer_type FROM performers WHERE performer_id = ?`,
                [id]
        ) 

        if (rows.length === 0) {
            await con.rollback()
            return res.status(404).json({ message: 'Performer not found'})
        }

        // const { performer_type } = rows[0]
        const currType = rows[0].performer_type 
        const newType = performer_type || currType

        if (newType !== currType) {
            await con.execute(
                `UPDATE performers SET performer_type = ? WHERE performer_id = ?`,
                [newType, id]
            )

            if (newType === 'band') {
                // MOVING FROM artist to band 
                // GET THE alias TO USE AS A band name 
                const [artistRows] = await con.execute(
                    `SELECT alias, first_name, last_name FROM artists WHERE performer_id = ?`,
                [id]
                )

                const artist = artistRows[0]
                const derivedBandName = band_name || `${artist?.first_name || ''} ${artist?.last_name || ''}`.trim() || 'Unknown'

                // Insert into bands
                await con.execute(
                    `INSERT IGNORE INTO bands (performer_id, band_name, formed_year, disbanded_year, country)
                    VALUES (?, ?, ?, ?, ?)`,
                    [id, derivedBandName, formed_year || null, disbanded_year || null, country || null]
                )

                // Remove from artists 
                await con.execute(
                    `DELETE FROM artists WHERE performer_id = ?`,
                    [id]
                )
            } else if (newType === 'artist') {
                // Moving from band to artist 
                // Get the band name to use as alias 
                const [bandRows] = await con.execute(
                    `SELECT band_name FROM bands WHERE performer_id = ?`,
                    [id]
                )

                const derivedAlias = alias || bandRows[0]?.band_name || null 

                // Insert into artists 
                await con.execute(
                    `INSERT IGNORE INTO artists (performer_id, alias, first_name, last_name) VALUES (?, ?, ?, ?)`,
                    [id, derivedAlias, first_name || null, last_name || null]
                )

                // Remove from bands 
                await con.execute(
                    `DELETE FROM bands WHERE performer_id = ?`,
                    [id]
                )
            }
        } else {
        /**
         * COALESCE => ensures a clean PUT. 
         * 
         * "Use the new value if provided, otherwise keep the existing value"
         */

        if (currType === 'artist') {
            await con.execute(
                `UPDATE artists SET
                    first_name = COALESCE(?, first_name),
                    last_name = COALESCE(?, last_name),
                    alias = COALESCE(?, alias),
                    date_of_birth = COALESCE(?, date_of_birth),
                    date_of_death = COALESCE(?, date_of_death)
                WHERE performer_id = ?`,
                [first_name || null, last_name || null, alias || null, date_of_birth || null, date_of_death || null, id]
            )
        } else {
            await con.execute(
                `UPDATE bands SET
                    band_name = COALESCE(?, band_name),
                    formed_year = COALESCE(?, formed_year),
                    disbanded_year = COALESCE(?, disbanded_year),
                    country = COALESCE(?, country)
                WHERE performer_id = ?`,
                [band_name || null, formed_year || null, disbanded_year || null, country || null, id]
                
                )
            }
        }

    await con.commit()

    res.status(200).json({ message: 'Performer updated successfully' })

    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}
        

// DELETE PERFORMER
exports.deletePerformer = async (req, res, next)=> {
    const { id } = req.params

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM performers WHERE performer_id = ?`, [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Performer not found' })
        }

        res.status(200).json({ message: 'Performer deleted successfully' })
    } catch (err) {
        // ER_ROW_IS_REFERENCED_2 the MySQL error thrown when trying to delete a parent row that has child rows referencing it
        
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ message: 'Cannot delete performer - they have albums associated with them' })
        }
        next(err)
    }
}