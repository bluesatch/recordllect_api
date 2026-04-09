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
            `SELECT users_id, first_name, last_name, email, status FROM users WHERE email = ? AND status = 'active'`,
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