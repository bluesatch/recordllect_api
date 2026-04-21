const pool = require('../config/dbconfig')

// CREATE LABEL
exports.createLabel = async (req, res, next)=> {
    const {
        label_name,
        country,
        founded_year,
        website_url,
        status
    } = req.body

    // Input validation
    if (!label_name) {
        return res.status(400).json({ message: 'label_name is required' })
    }

    if (status && !['active', 'defunct'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or defunct'})
    }

    try {
        const [labelResult] = await pool.execute(
            `INSERT INTO labels (label_name, country, founded_year, website_url, status) VALUES (?, ?, ?, ?, ?)`,
            [
                label_name,
                country || null,
                founded_year || null,
                website_url || null,
                status || 'active'
            ]
        )

        res.status(201).json({
            message: 'Label created successfully',
            label_id: labelResult.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Label already exists'})
        }
        next(err)
    }
}

// GET ALL LABELS
exports.getAllLabels = async (req, res, next) => {

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit 
    const search = req.query.search || ''
    const sort = req.query.sort || 'name_asc'

    const sortMap = {
        'name_asc': 'label_name ASC',
        'name_desc': 'label_name DESC',
        'year_asc': 'founded_year ASC',
        'year_desc': 'founded_year DESC'
    }

    const orderBy = sortMap[sort] || 'label_name ASC'


    try {

        const conditions = []
        const params = []

        if (search) {
            conditions.push(`label_name LIKE ?`)
            params.push(`%${search}%`)
        }

        const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

        const [countResult] = await pool.query(
            `SELECT COUNT(*) AS total FROM labels ${whereClause}`,
            params
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        const [ rows ] = await pool.query(
            `SELECT 
                label_id,
                label_name,
                country,
                founded_year,
                website_url,
                status, 
                created_at
            FROM labels
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
            [...params, Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total,
            totalPages,
            labels: rows
        })
    } catch (err) {
        next(err)
    }
}

// GET LABEL BY ID
exports.getLabelById = async (req, res, next)=> {
    const { id } = req.params
    const sort = req.query.sort || 'year_asc'

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'a.release_year ASC',
        'year_desc': 'a.release_year DESC'
    }

    const orderBy = sortMap[sort] || 'a.release_year ASC'

    try {
        const [ rows ] = await pool.execute(
            `SELECT 
                label_id,
                label_name,
                country,
                founded_year,
                website_url,
                status,
                created_at,
                updated_at
            FROM labels
            WHERE label_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Label not found' })
        }

        const label = rows[0]

        // Fetch albums associated with this label
        const [ albums ] = await pool.execute(
            `SELECT 
                a.album_id,
                a.title,
                a.release_year,
                a.performer_id,
                v.performer_name,
                v.format_name
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE a.label_id = ?
            ORDER BY ${orderBy}`,
            [id]
        )

        label.albums = albums

        res.status(200).json(label)

    } catch (err) {
        next(err)
    }
}

// UPDATE LABEL
exports.updateLabel = async (req, res, next) => {
    const { id } = req.params
    const {
        label_name,
        country,
        founded_year,
        website_url,
        status
    } = req.body

    if (status && !['active', 'defunct'].includes(status)) {
        return res.status(400).json({ message: 'status must be active or defunct' })
    }

    try {
        const [result] = await pool.execute(
            `UPDATE labels SET
                label_name = COALESCE(?, label_name),
                country = COALESCE(?, country),
                founded_year = COALESCE(?, founded_year),
                website_url = COALESCE(?, website_url),
                status = COALESCE(?, status)
            WHERE label_id = ?`,
            [
                label_name || null,
                country || null,
                founded_year || null,
                website_url || null,
                status || null,
                id
            ]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Label not found' })
        }

        res.status(200).json({ message: 'Label updated successfully' })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Label name already exists' })
        }
        next(err)
    }
}

// DELETE LABEL
exports.deleteLabel = async (req, res, next)=> {
    const { id } = req.params
    try {
        const [result] = await pool.execute(
            `DELETE FROM labels WHERE label_id = ?`, [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Label not found' })
        }

        res.status(200).json({ message: 'Label deleted successfully' })
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ message: 'Cannot delete label - it has albums associated with it' })
        }

        next(err)
    }
}