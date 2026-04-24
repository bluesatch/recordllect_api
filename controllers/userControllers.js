// Import required libraries and dependencies
const pool = require('../config/dbconfig')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

// Validate password
const validatePassword = (password)=> {
    const rules = [
        { test: password.length >= 8, message: 'At least 8 characters' },
        { test: /[A-Z]/.test(password), message: 'At least one uppercase letter' },
        { test: /[a-z]/.test(password), message: 'At least one lowercase letter' },
        { test: /[^A-Za-z0-9]/.test(password), message: 'At least one special character' }
    ]

    return rules.filter(rule => !rule.test).map(rule => rule.message)
}


// Register user
exports.register = async (req, res, next)=> {
    const { first_name, last_name, email, username, password } = req.body

    // input validation
    if (!first_name || !last_name || !email || !username || !password) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
        return res.status(400).json({ 
            message: 'Username must be 3-50 characters and can only contain letters, numbers, and underscores' 
        })
    }

    const passwordErrors = validatePassword(password)

    if (passwordErrors.length > 0) {
        return res.status(400).json({
            message: `Password must contain: ${passwordErrors.join(', ')}`
        })
    }

    try {
        // Hash the password 
        const password_hash = await bcrypt.hash(password, 10)

        const [ result ] = await pool.execute(
            `INSERT INTO users (first_name, last_name, email, username, password_hash)
            VALUES (?, ?, ?, ?, ?)`,
            [ first_name, last_name, email, username, password_hash ]
        )

        res.status(201).json({ message: 'User registered successfully', users_id: result.insertId})
    } catch (err) {
        // Handle duplicate email
        if (err.code === 'ER_DUP_ENTRY') {
            const message = err.message.includes('username') 
            ? 'Username already taken'
            : 'Email already in use'
            return res.status(409).json({ message })
        }
        next(err)
    }
}


// Login user
exports.login = async (req, res, next)=> {
    const { email, password } = req.body

    // input validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' })
    }

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id, first_name, last_name, email, status, username, password_hash, is_admin FROM users WHERE email = ? AND status = 'active'`,
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
            { users_id: user.users_id, email: user.email, username: user.username, is_admin: user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '24h'}
        )

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // secure: true will block cookies in development
            sameSite: 'Lax',
            // Lax allows cookies to be sent on same-site requests and top-level navigations
            maxAge: 24 * 60 * 60 * 1000
        })

        res.json({ message: 'Login successful' })
    } catch (err) {
        next(err)
    }
}


// Logout user
exports.logout = (req, res)=> {
    res.clearCookie('token')
    res.json({ message: 'Logged out successfully'})
}

// GET userById
exports.getUserById = async (req, res, next) => {
    const { id } = req.params

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                users_id,
                first_name,
                last_name,
                email,
                username,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                status,
                email_verified_at,
                profile_image_url,
                is_admin,
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

        const [ albumCount ] = await pool.execute(
            `SELECT COUNT(*) AS album_count FROM user_albums WHERE users_id = ?`,
            [id]
        )

        user.album_count = albumCount[0].album_count

        const [ wantlistCount ] = await pool.execute(
            `SELECT COUNT(*) AS wantlist_count FROM wantlists WHERE users_id = ?`,
            [id]
        )

        user.wantlist_count = wantlistCount[0].wantlist_count

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


// Update user
exports.updateUser = async (req, res, next) => {
    const { id } = req.params
    const {
        username,
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
                username = COALESCE(?, username),
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
                username || null,
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
        res.status(200).json({ message: 'User updated successfully' })
    } catch (err) {

        // Handle duplicate username or email 
        if (err.code === 'ER_DUP_ENTRY') {
            const message = err.message.includes('username')
                ? 'Username already taken'
                : 'Email already in use'
            return res.status(409).json({ message })
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' })
        }
        next(err)

    }
}

exports.getMe = async (req, res, next)=> {

    try {
        const [ rows ] = await pool.execute(
            `SELECT
                users_id,
                first_name,
                last_name,
                email,
                username,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                status,
                email_verified_at,
                profile_image_url,
                is_admin,
                created_at,
                updated_at
            FROM users
            WHERE users_id = ?`,
            [req.user.users_id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        const user = rows[0]

        const [followStats] = await pool.execute(
            `SELECT
                (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers_count,
                (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count`,
            [req.user.users_id, req.user.users_id]
        )

        user.followers_count = followStats[0].followers_count
        user.following_count = followStats[0].following_count

        res.status(200).json(user)

    } catch (err) {
        next(err)
    }
}

// Get user's album collection
exports.getUserAlbums = async (req, res, next)=> {
    const { id } = req.params
    const userId = Number(id)
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 60
    const offset = (page - 1) * limit
    const sort = req.query.sort || 'added_desc'

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'a.release_year ASC',
        'year_desc': 'a.release_year DESC',
        'added_desc': 'ua.added_at DESC',
        'added_asc': 'ua.added_at ASC'
    }

    const orderBy = sortMap[sort] || 'ua.added_at DESC'

    try {
        const [ countResult ] = await pool.execute(
            `SELECT COUNT(*) AS total FROM user_albums WHERE users_id = ?`,
            [userId]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        const [ rows ] = await pool.query(
            `SELECT 
                ua.user_album_id,
                ua.added_at,
                a.album_id,
                a.title,
                a.release_year,
                a.album_image_url,
                v.performer_name,
                v.performer_type,
                v.label_name,
                v.format_name
            FROM user_albums ua
            JOIN albums a ON ua.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE ua.users_id = ?
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
            [Number(id), Number(limit), Number(offset)]
        )

        res.status(200).json({
            count: rows.length,
            total,
            page,
            totalPages,
            albums: rows
        })
    } catch (err) {
        next(err)
    }
}

exports.addUserAlbum = async (req, res, next)=> {
    const { id } = req.params
    const { album_id } = req.body 

    if (!album_id) {
        return res.status(400).json({ message: 'album_id is required'})
    }

    try {
        const [ result ] = await pool.execute(
            `INSERT INTO user_albums (users_id, album_id) VALUES (?, ?)`,
            [id, album_id]
        )

        res.status(201).json({
            message: 'Album added to collection',
            user_album_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Album already in collection'})
        }

        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'Invalid album_id'})
        }
        next(err)
    }
}

exports.removeUserAlbum = async (req, res, next) => {
    const { id, album_id } = req.params

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM user_albums WHERE users_id = ? AND album_id = ?`,
            [id, album_id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Album not found in collection' })
        }

        res.status(200).json({ message: 'Album removed from collection' })
    } catch (err) {
        next(err)
    }
}

// Get user's followers
exports.getFollowers = async (req, res, next) => {
    const { id } = req.params

    try {
        const [rows] = await pool.execute(
            `SELECT
                u.users_id,
                u.first_name,
                u.last_name,
                u.username,
                u.profile_image_url
            FROM follows f
            JOIN users u ON f.follower_id = u.users_id
            WHERE f.following_id = ?
            ORDER BY u.first_name ASC`,
            [id]
        )

        res.status(200).json({
            count: rows.length,
            followers: rows
        })
    } catch (err) {
        next(err)
    }
}

// Get users that a user is following
exports.getFollowing = async (req, res, next) => {
    const { id } = req.params

    try {
        const [rows] = await pool.execute(
            `SELECT
                u.users_id,
                u.first_name,
                u.last_name,
                u.username,
                u.profile_image_url
            FROM follows f
            JOIN users u ON f.following_id = u.users_id
            WHERE f.follower_id = ?
            ORDER BY u.first_name ASC`,
            [id]
        )

        res.status(200).json({
            count: rows.length,
            following: rows
        })
    } catch (err) {
        next(err)
    }
}

exports.checkUserAlbum = async (req, res, next)=> {
    const { id, album_id} = req.params 

    try {
        const [rows] = await pool.execute(
            `SELECT user_album_id FROM user_albums
            WHERE users_id = ? AND album_id = ?`,
            [id, album_id]
        )

        res.status(200).json({
            inCollection: rows.length > 0
        })
    } catch (err) {
        next(err)
    }
}

// SEARCH USERS
exports.searchUsers = async (req, res, next)=> {
    const search = req.query.search || ''
    const { id } = req.query 

    try {
        const [ rows ] = await pool.query(
            `SELECT 
                users_id,
                username,
                first_name,
                last_name,
                profile_image_url
            FROM users 
            WHERE username LIKE ?
            AND status = 'active'
            AND users_id != ?
            ORDER BY username ASC
            LIMIT 10`,
            [`%${search}%`, id || 0]
        )

        res.status(200).json({ users: rows })
    } catch (err) {
        next(err)
    }
}

// FOLLOW A USER 
exports.followUser = async (req, res, next)=> {
    const { id } = req.params
    const follower_id = req.user.users_id 

    if (parseInt(id) === follower_id) {
        return res.status(400).json({ message: "I know you're awesome. But you cannot follow yourself."})
    }

    try {
        await pool.execute(
            `INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`,
            [follower_id, id]
        )

        res.status(201).json({ message: 'User followed successfully'})
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already following this user' })
        }
        next(err)
    } 
}

// UNFOLLOW A USER 
exports.unfollowUser = async (req, res, next)=> {
    const { id } = req.params 
    const follower_id = req.user.users_id

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM follows
            WHERE follower_id = ? AND following_id = ?`,
            [follower_id, id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Not following this user'})
        }

        res.status(200).json({ message: 'User unfollowed successfully'})
    } catch (err) {
        next(err)
    }
}

exports.checkFollowing = async (req, res, next)=> {
    const { id } = req.params 
    const follower_id = req.user.users_id

    try {
        const [ rows ] = await pool.execute(
            `SELECT follow_id FROM follows
            WHERE follower_id = ? AND following_id = ?`,
            [follower_id, id]
        )

        res.status(200).json({ isFollowing: rows.length > 0 })
    } catch (err) {
        next(err)
    }
}