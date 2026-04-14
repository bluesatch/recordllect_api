const pool = require('../config/dbconfig')

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

exports.getAllLabels = async (req, res, next) => {
    try {
        const [ rows ] = await pool.execute(
            `SELECT 
                label_id,
                label_name,
                country,
                founded_year,
                website_url,
                status, 
                created_at
            FROM labels
            ORDER BY label_name ASC`
        )

        res.status(200).json({
            count: rows.length,
            labels: rows
        })
    } catch (err) {
        next(err)
    }
}

exports.getLabelById = async (req, res, next)=> {
    const { id } = req.params

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
                v.performer_name,
                v.format_name
            FROM albums a
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE a.label_id = ?
            ORDER BY a.release_year ASC`,
            [id]
        )

        label.albums = albums

        res.status(200).json(label)

    } catch (err) {
        next(err)
    }
}

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