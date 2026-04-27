const pool = require('../config/dbconfig')

// GET all tags
exports.getAllTags = async (req, res, next)=> {
    try {
        const [ rows ] = await pool.execute(
            `SELECT tag_id, tag_name FROM tags ORDER BY tag_name ASC`
        )

        res.status(200).json({ tags: rows })
    } catch (err) {
        next(err)
    }
}

// CREATE tag 
exports.createTag = async (req, res, next)=> {
    let { tag_name } = req.body 

    if (!tag_name) {
        return res.status(400).json({ message: 'tag_name is required'})
    }

    // Normalize - lowercase, no spaces, no special characters except underscore 
    tag_name = tag_name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

    if (tag_name.length === 0) {
        return res.status(400).json({ message: 'Invalid tag name' })
    }

    if (tag_name.length > 50) {
        return res.status(400).json({ message: 'Tag name must be 50 characters or less' })
    }

    try {
        const [ result ] = await pool.execute(
            `INSERT INTO tags (tag_name) VALUES (?)`,
            [tag_name]
        )

        res.status(201).json({ 
            message: 'Tag created successfully',
            tag_id: result.insertId,
            tag_name
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            // Tag already exists - return it instead of erroring 
            const [ rows ] = await pool.execute(
                `SELECT tag_id, tag_name FROM tags WHERE tag_name = ?`,
                [tag_name]
            )

            return res.status(200).json({ 
                message: 'Tag already exists',
                tag_id: rows[0].tag_id,
                tag_name: rows[0].tag_name
            })
        }
        next(err)
    }
}