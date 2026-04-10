// Import required libraries and dependencies
const pool = require('../config/dbconfig')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

exports.register = async (req, res, next)=> {
    const { first_name, last_name, email, password } = req.body

    // input validation
    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    try {
        // Hash the password 
        const password_hash = await bcrypt.hash(password, 10)

        const [ result ] = await pool.execute(
            `INSERT INTO users (first_name, last_name, email, password_hash)
            VALUES (?, ?, ?, ?)`,
            [ first_name, last_name, email, password_hash ]
        )

        res.status(201).json({ message: 'User registered successfully', users_id: result.insertId})
    } catch (err) {
        // Handle duplicate email
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email already in use' })
        }
        next(err)
    }
}

exports.login = async (req, res, next)=> {
    const { email, password } = req.body

    // input validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' })
    }

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id, first_name, last_name, email, status, password_hash FROM users WHERE email = ? AND status = 'active'`,
            [email]
        )

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials'})
        }

        // compare password with password hash to authenticate
        const user = rows[0]
        const match = await bcrypt.compare(password, user.password_hash)

        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials'})
        }

        // Generate jwt 
        const token = jwt.sign(
            { users_id: user.users_id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h'}
        )

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // secure: true will block cookies in development
            sameSite: 'Strict',
            maxAge: 24 * 60 * 60 * 1000
        })

        res.json({ message: 'Login successful' })
    } catch (err) {
        next(err)
    }
}

exports.logout = (req, res)=> {
    res.clearCookie('token')
    res.json({ message: 'Logged out successfully'})
}

exports.getUserById = async (req, res, next) => {
    const { id } = req.params

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                users_id,
                first_name,
                last_name,
                email,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                status,
                email_verified_at,
                profile_image_url,
                created_at,
                updated_at
            FROM users
            WHERE users_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        const user = rows[0]

        // Fetch follower and following counts
        const [ followStats ] = await pool.execute(
                `SELECT
                    (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers_count,
                    (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count`,
                [id, id]
        )

        user.followers_count = followStats[0].followers_count
        user.following_count = followStats[0].following_count

        res.status(200).json(user)
    } catch (err) {
        next(err)
    }
}

exports.updateUser = async (req, res, next) => {
    const { id } = req.params
    const {
        first_name,
        last_name,
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
        country,
        profile_image_url
    } = req.body

    try {
        const [result] = await pool.execute(
            `UPDATE users SET
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                address_line_1 = COALESCE(?, address_line_1),
                address_line_2 = COALESCE(?, address_line_2),
                city = COALESCE(?, city),
                state = COALESCE(?, state),
                postal_code = COALESCE(?, postal_code),
                country = COALESCE(?, country),
                profile_image_url = COALESCE(?, profile_image_url)
            WHERE users_id = ?`,
            [
                first_name || null,
                last_name || null,
                address_line_1 || null,
                address_line_2 || null,
                city || null,
                state || null,
                postal_code || null,
                country || null,
                profile_image_url || null,
                id
            ]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.status(200).json({ message: 'User updated successfully' })
    } catch (err) {
        next(err)
    }
}