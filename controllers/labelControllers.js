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