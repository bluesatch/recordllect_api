// Import required libraries and dependencies
const pool = require('../config/dbconfig')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { createNotification } = require('./notificationController')
const logger = require('../config/logger')
const { sendVerificationEmail, sendResendVerificationEmail, sendPasswordResetEmail } = require('../config/mailer')

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
    const { 
        first_name, last_name, email, username, password,
        address_line_1, address_line_2, city, state,
        postal_code, country, profile_image_url
    } = req.body

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
        // const password_hash = await bcrypt.hash(password, 10)

        // const [ result ] = await pool.execute(
        //     `INSERT INTO users (first_name, last_name, email, username, password_hash)
        //     VALUES (?, ?, ?, ?, ?)`,
        //     [ first_name, last_name, email, username, password_hash ]
        // )

        // res.status(201).json({ message: 'User registered successfully', users_id: result.insertId})
        const [existing] = await pool.execute(
            `SELECT users_id FROM users
            WHERE email = ? OR username = ?`,
            [email, username]
        )

        if (existing.length > 0) {
            return res.status(409).json({
                message: 'Email or username already in use'
            })
        }

        const hashedPassword = await bcrypt.hash(password, 12)

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex')
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        const [result] = await pool.execute(
            `INSERT INTO users (
                first_name, last_name, email, username, password_hash,
                address_line_1, address_line_2, city, state,
                postal_code, country, profile_image_url,
                verification_token, verification_token_expires,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                first_name, last_name, email, username, hashedPassword,
                address_line_1 || null, address_line_2 || null,
                city || null, state || null, postal_code || null,
                country || null, profile_image_url || null,
                verificationToken, tokenExpires, 'pending_verification'
            ]
        )

        try {
            await sendVerificationEmail(email, username, verificationToken)
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr)
            // Don't fail registration if email fails
        }

        res.status(201).json({
            message: 'User registered successfully. Please check your email to verify your account.'
        })
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
        {
            users_id: user.users_id,
            username: user.username,
            is_admin: user.is_admin
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '7d',
            algorithm: 'HS256',
            issuer: 'groovist'
        }
    )


        res.cookie('token', token, {
            httpOnly: true,
            secure: true, // secure: true will block cookies in development
            sameSite: 'none',
            // Lax allows cookies to be sent on same-site requests and top-level navigations
            maxAge: 24 * 60 * 60 * 1000
        })

        // res.json({ message: 'Login successful' })
        res.status(200).json({ message: 'Login successful', token})
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
    const requesterId = req.user.users_id

    try {
        // Check if either user has blocked the other 
        if (parseInt(id) !== requesterId) {
            const [blockCheck] = await pool.execute(
                `SELECT block_id FROM blocked_users
                WHERE (blocker_id = ? AND blocked_id = ?)
                OR (blocker_id = ? AND blocked_id = ?)`,
                [requesterId, id, id, requesterId]
            )

            if (blockCheck.length > 0) {
                return res.status(403).json({
                    message: 'Profile not available',
                    blocked: true
                })
            }
        }

        const [ rows ] = await pool.execute(
            `SELECT
                users_id,
                first_name,
                last_name,
                email,
                bio,
                username,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                status,
                is_verified,
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

        const [ userGenres ] = await pool.execute(
            `SELECT g.genre_id, g.genre_name
            FROM user_genres ug
            JOIN genres g ON ug.genre_id = g.genre_id
            WHERE ug.users_id = ?
            ORDER BY g.genre_name ASC`,
            [id]
        )

        user.genres = userGenres

        const [ nowPlaying ] = await pool.execute(
            `SELECT 
                np.album_id,
                a.title,
                v.performer_name
            FROM now_playing np
            JOIN albums a ON np.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE np.users_id = ?`,
            [id]
        )

        user.now_playing = nowPlaying[0] || null

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
        profile_image_url,
        bio,
        genre_ids
    } = req.body

    const con = await pool.getConnection()

    try {

        await con.beginTransaction()

        const [result] = await con.execute(
            `UPDATE users SET
                username = COALESCE(?, username),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                bio = COALESCE(?, bio),
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
                bio || null,
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
            await con.rollback()
            return res.status(400).json({ message: 'User not found'})
        }

        // Update genre preferences if provided 
        if (genre_ids && Array.isArray(genre_ids)) {
            await con.execute(
                `DELETE FROM user_genres WHERE users_id = ?`,
                [id]
            )

            if (genre_ids.length > 0) {
                const genreValues = genre_ids.map(genre_id => [id, genre_id])
                await con.query(
                    `INSERT INTO user_genres (users_id, genre_id) VALUES ?`,
                    [genreValues]
                )
            }
        }

        await con.commit()

        res.status(200).json({ message: 'User updated successfully' })
    } catch (err) {
        await con.rollback()
        // Handle duplicate username or email 
        if (err.code === 'ER_DUP_ENTRY') {
            const message = err.message.includes('username')
                ? 'Username already taken'
                : 'Email already in use'
            return res.status(409).json({ message })
        }

        next(err)
    } finally {
        con.release()
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
                bio,
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
                is_verified,
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

        const [ userGenres ] = await pool.execute(
            `SELECT g.genre_id, g.genre_name
            FROM user_genres ug
            JOIN genres g ON ug.genre_id = g.genre_id
            WHERE ug.users_id = ?
            ORDER BY g.genre_name ASC`,
            [req.user.users_id]
        )

        user.genres = userGenres

        const [ nowPlaying ] = await pool.execute(
            `SELECT
                np.album_id,
                a.title,
                a.album_image_url,
                v.performer_name
            FROM now_playing np
            JOIN albums a ON np.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE np.users_id = ?`,
            [req.user.users_id]
        )

        user.now_playing = nowPlaying[0] || null

        console.log('getMe user object:', JSON.stringify(user))
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
    const search = req.query.search?.trim() || ''

    const sortMap = {
        'title_asc': 'a.title ASC',
        'title_desc': 'a.title DESC',
        'year_asc': 'a.release_year ASC',
        'year_desc': 'a.release_year DESC',
        'added_desc': 'ua.added_at DESC',
        'added_asc': 'ua.added_at ASC',
        'performer_asc': 'v.performer_name ASC',
        'performer_desc': 'v.performer_name DESC'
    }

    let orderBy = sortMap[sort] || 'ua.added_at DESC'

    // switch(sort) {
    //     case 'title_asc':
    //         orderBy = 'a.title ASC'
    //         break
    //     case 'title_desc':
    //         orderBy = 'a.title DESC'
    //         break
    //     case 'year_desc':
    //         orderBy = 'a.release_year DESC'
    //         break
    //     case 'year_asc':
    //         orderBy = 'a.release_year ASC'
    //         break
    //     case 'added_desc':
    //         orderBy = 'ua.added_at DESC'
    //         break
    //     case 'added_asc':
    //         orderBy = 'ua.added_at ASC'
    //         break
    //     case 'performer_asc':
    //         orderBy = 'v.performer_name ASC'
    //         break
    //     case 'performer_desc':
    //         orderBy = 'v.performer_name DESC'
    //         break
    // }


    try {
        const searchCondition = search 
            ? `AND (a.title LIKE ? OR v.performer_name LIKE ? or v.label_name LIKE ?)`
            : ''
        
        const searchParams = search
            ? [`%${search}%`, `%${search}%`, `%${search}%`]
            : []

        const [ countResult ] = await pool.query(
            `SELECT COUNT(*) AS total
            FROM user_albums ua 
            JOIN albums a ON ua.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE ua.users_id = ? ${searchCondition}`,
            [userId, ...searchParams]
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
                v.performer_id,
                v.performer_type,
                v.label_name,
                v.format_name
            FROM user_albums ua
            JOIN albums a ON ua.album_id = a.album_id
            JOIN v_album_details v ON a.album_id = v.album_id
            WHERE ua.users_id = ? ${searchCondition}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
            [Number(id), ...searchParams,  Number(limit), Number(offset)]
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
    const city = req.query.city || ''
    const state = req.query.state || ''
    const country = req.query.country || ''
    const genres = req.query.genres ? req.query.genres.split(',').map(Number) : []
    const context = req.query.context || 'discover'
    const requesterId = req.user.users_id 

    try {

        const conditions = []
        const params = []
        
        // Exclude self 
        conditions.push(`u.users_id != ?`)
        params.push(requesterId)

        conditions.push(`u.users_id NOT IN (
            SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
        )`)
        params.push(requesterId, requesterId)

        if (context === 'discover') {
            conditions.push(`u.users_id NOT IN (
                SELECT following_id FROM follows WHERE follower_id = ?
            )`)
            params.push(requesterId)
        }

        // Active users only
        conditions.push(`u.status = 'active'`)

        // Search by username 
        if (search) {
            conditions.push(`u.username LIKE ?`)
            params.push(`%${search}%`)
        }

        // Filter by city 
        if (city) {
            conditions.push(`u.city LIKE ?`)
            params.push(`%${city}%`)
        }

        // Filter by state 
        if (state) {
            conditions.push(`u.state LIKE ?`)
            params.push(`%${state}%`)
        }

        // Filter by country 
        if (country) {
            conditions.push(`u.country LIKE ?`)
            params.push(`%${country}%`)
        }

        // Filter by genres - user must have ALL selected genres 
        if (genres.length > 0) {
            conditions.push(`(
                SELECT COUNT(*) FROM user_genres ug 
                WHERE ug.users_id = u.users_id 
                AND ug.genre_id IN (${genres.map(() => '?').join(',')})
            ) = ?`)
            params.push(...genres, genres.length)
        }

        

        const whereClause = `WHERE ${conditions.join(' AND ')}`

        const [ rows ] = await pool.query(
            `SELECT 
                u.users_id,
                u.username,
                u.first_name,
                u.last_name,
                u.city,
                u.state,
                u.country,
                u.bio,
                u.profile_image_url,
                GROUP_CONCAT(DISTINCT g.genre_name ORDER BY g.genre_name SEPARATOR ', ') AS genres
            FROM users u
            LEFT JOIN user_genres ug ON u.users_id = ug.users_id 
            LEFT JOIN genres g ON ug.genre_id = g.genre_id 
            ${whereClause}
            GROUP BY 
                u.users_id,
                u.username,
                u.first_name,
                u.last_name,
                u.city,
                u.state,
                u.country,
                u.bio,
                u.profile_image_url
            ORDER BY u.username ASC 
            LIMIT 20`,
            params
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

        const io = req.app.get('io')
        const [follower] = await pool.execute(
            `SELECT username FROM users WHERE users_id = ?`, [follower_id]
        )
        await createNotification(io, {
            recipientId: parseInt(id),
            senderId: follower_id,
            type: 'follow',
            referenceId: follower_id,
            message: `@${follower[0].username} started following you`
        })

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

// SET now playing
exports.setNowPlaying = async (req, res, next) => {
    const { id } = req.params
    const { album_id } = req.body

    if (!album_id) {
        return res.status(400).json({ message: 'album_id is required' })
    }

    try {
        await pool.execute(
            `INSERT INTO now_playing (users_id, album_id)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE album_id = ?, updated_at = CURRENT_TIMESTAMP`,
            [id, album_id, album_id]
        )

        res.status(200).json({ message: 'Now playing updated' })
    } catch (err) {
        next(err)
    }
}

// CLEAR now playing
exports.clearNowPlaying = async (req, res, next) => {
    const { id } = req.params

    try {
        await pool.execute(
            `DELETE FROM now_playing WHERE users_id = ?`,
            [id]
        )

        res.status(200).json({ message: 'Now playing cleared' })
    } catch (err) {
        next(err)
    }
}

// BLOCK A USER 
exports.blockUser = async (req, res, next)=> {
    const { id } = req.params 
    const blockerId = req.user.users_id 

    if (parseInt(id) === blockerId) {
        return res.status(400).json({ message: "You cannot block yourself" })
    }

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        // INSERT BLOCK
        await con.execute(
            `INSERT INTO blocked_users (blocker_id, blocked_id)
            VALUES (?, ?)`,
            [blockerId, id]
        )

        // UNFOLLOW EACH OTHER IF FOLLOWING 
        await con.execute(
            `DELETE FROM follows 
            WHERE (follower_id = ? AND following_id = ?)
            OR (follower_id = ? AND following_id = ?)`,
            [blockerId, id, id, blockerId]
        )

        await con.commit()
        res.status(201).json({ message: 'User blocked successfully'})
    } catch (err) {
        await con.rollback()
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already blocked this user' })
        }
        next(err)
    } finally {
        con.release()
    }
}

// UNBLOCK A USER 
exports.unblockUser = async (req, res, next)=> {
    const { id } = req.params
    const blockerId = req.user.users_id 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM blocked_users 
            WHERE blocker_id = ? AND blocked_id = ?`,
            [blockerId, id]
        ) 

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Block not found'})
        }

        res.status(200).json({ message: 'User unblocked successfully' })
    } catch (err) {
        next(err)
    }
}

// GET blocked users list 
exports.getBlockedUsers = async (req, res, next)=> {
    const userId = req.user.users_id 

    try {
        const [ rows ] = await pool.execute(
            `SELECT 
                u.users_id,
                u.username,
                u.profile_image_url,
                bu.created_at AS blocked_at
            FROM blocked_users bu
            JOIN users u ON bu.blocked_id = u.users_id
            WHERE bu.blocker_id = ?
            ORDER BY bu.created_at DESC`,
            [userId]
        )

        res.status(200).json({ 
            count: rows.length,
            blocked_users: rows
        })
    } catch (err) {
        next(err)
    }
}

// CHECK if a user is blocked 
exports.checkBlocked = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        const [ blockedByMe ] = await pool.execute(
            `SELECT block_id FROM blocked_users
            WHERE blocker_id = ? AND blocked_id = ?`,
            [userId, id]
        )

        const [ blockedByThem ] = await pool.execute(
            `SELECT block_id FROM blocked_users
            WHERE blocker_id = ? AND blocked_id = ?`,
            [id, userId]
        )

        res.status(200).json({
            blocked_by_me: blockedByMe.length > 0,
            blocked_by_them: blockedByThem.length > 0
        })
    } catch (err) {
        next(err)
    }
}

exports.getSocketToken = async (req, res, next)=> {
    try {
        const token = jwt.sign(
            {
                users_id: req.user.users_id,
                email: req.user.email,
                is_admin: req.user.is_admin
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        )
        res.status(200).json({ token })
    } catch (err) {
        next(err)
    }
}

// DEACTIVATE ACCOUNT 
exports.deactivateAccount = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    // USERS CAN ONLY DEACTIVATE THEIR OWN ACCOUNT 
    // ADMINS CAN DEACTIVATE ANY ACCOUNT 
    if (parseInt(id) !== userId && !req.user.is_admin) {
        return res.status(403).json({
            message: 'You can only deactivate your own account'
        })
    }

    try {
        const [ result ] = await pool.execute(
            `UPDATE users SET 
                status = 'inactive',
                updated_at = CURRENT_TIMESTAMP
            WHERE users_id = ?`,
            [id]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        if (parseInt(id) === userId) {
            res.clearCookie('token')
        }

        res.status(200).json({ message: 'Account deactivated successfully'})
    } catch (err) {
        next(err)
    }
}

// REACTIVATE ACCOUNT - admin only 
exports.reactivateAccount = async (req, res, next)=> {
    const { id } = req.params 

    try {
        const [ result ] = await pool.execute(
            `UPDATE users SET 
                status = 'active',
                email_verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE users_id = ?`,
            [id]    
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.status(200).json({ message: 'Account reactivated successfully' })
    } catch (err) {
        next(err)
    }
}

// GET inactive users — admin only
exports.getInactiveUsers = async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                users_id,
                username,
                first_name,
                last_name,
                email,
                profile_image_url,
                updated_at
            FROM users
            WHERE status = 'inactive'
            ORDER BY updated_at DESC`
        )

        res.status(200).json({
            count: rows.length,
            users: rows
        })
    } catch (err) {
        next(err)
    }
}

exports.getUserByUsername = async (req, res, next)=> {
    const { username } = req.params 

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM users
            WHERE LOWER(username) = LOWER(?)
            AND status = 'active'`,
            [username]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found'})
        }

        res.status(200).json({ users_id: rows[0].users_id})
    } catch (err) {
        next(err)
    }
}

exports.verifyEmail = async (req, res, next) => {
    const { token } = req.params

    try {
        const [rows] = await pool.execute(
            `SELECT users_id, username, verification_token_expires
            FROM users
            WHERE verification_token = ?
            AND is_verified = 0`,
            [token]
        )

        if (rows.length === 0) {
            return res.status(400).json({
                message: 'Invalid or already used verification link'
            })
        }

        const user = rows[0]

        // Check if token has expired
        if (new Date() > new Date(user.verification_token_expires)) {
            return res.status(400).json({
                message: 'Verification link has expired. Please request a new one.',
                expired: true
            })
        }

        // Mark as verified and clear token
        await pool.execute(
            `UPDATE users
            SET is_verified = 1,
                status = 'active',
                verification_token = NULL,
                verification_token_expires = NULL
            WHERE users_id = ?`,
            [user.users_id]
        )

        res.status(200).json({
            message: 'Email verified successfully! You can now log in.'
        })
    } catch (err) {
        next(err)
    }
}

exports.resendVerification = async (req, res, next) => {
    const userId = req.user.users_id

    try {
        const [rows] = await pool.execute(
            `SELECT email, username, is_verified
            FROM users WHERE users_id = ?`,
            [userId]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        const user = rows[0]

        if (user.is_verified) {
            return res.status(400).json({
                message: 'Email is already verified'
            })
        }

        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex')
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

        await pool.execute(
            `UPDATE users
            SET verification_token = ?,
                verification_token_expires = ?
            WHERE users_id = ?`,
            [verificationToken, tokenExpires, userId]
        )

        await sendResendVerificationEmail(
            user.email,
            user.username,
            verificationToken
        )

        res.status(200).json({
            message: 'Verification email sent. Please check your inbox.'
        })
    } catch (err) {
        next(err)
    }
}

// CHANGE PASSWORD — authenticated user
exports.changePassword = async (req, res, next) => {
    const userId = req.user.users_id
    const { current_password, new_password } = req.body

    if (!current_password || !new_password) {
        return res.status(400).json({
            message: 'Current password and new password are required'
        })
    }

    const passwordErrors = validatePassword(new_password)
    if (passwordErrors.length > 0) {
        return res.status(400).json({
            message: `Password must contain: ${passwordErrors.join(', ')}`
        })
    }

    try {
        // Get current password hash
        const [rows] = await pool.execute(
            `SELECT password_hash FROM users WHERE users_id = ?`,
            [userId]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' })
        }

        // Verify current password
        const match = await bcrypt.compare(current_password, rows[0].password_hash)
        if (!match) {
            return res.status(401).json({ message: 'Current password is incorrect' })
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 12)

        await pool.execute(
            `UPDATE users SET password_hash = ? WHERE users_id = ?`,
            [hashedPassword, userId]
        )

        res.status(200).json({ message: 'Password changed successfully' })
    } catch (err) {
        next(err)
    }
}

// FORGOT PASSWORD — request reset email
exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body

    if (!email) {
        return res.status(400).json({ message: 'Email is required' })
    }

    try {
        const [rows] = await pool.execute(
            `SELECT users_id, username FROM users
            WHERE email = ? AND status = 'active'`,
            [email]
        )

        // Always return success even if email not found
        // Prevents email enumeration attacks
        if (rows.length === 0) {
            return res.status(200).json({
                message: 'If that email exists you will receive a reset link shortly.'
            })
        }

        const user = rows[0]

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex')
        const tokenExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

        await pool.execute(
            `UPDATE users
            SET reset_token = ?,
                reset_token_expires = ?
            WHERE users_id = ?`,
            [resetToken, tokenExpires, user.users_id]
        )

        // Send reset email
        try {
            await sendPasswordResetEmail(email, user.username, resetToken)
        } catch (emailErr) {
            console.error('Failed to send reset email:', emailErr)
        }

        res.status(200).json({
            message: 'If that email exists you will receive a reset link shortly.'
        })
    } catch (err) {
        next(err)
    }
}

// RESET PASSWORD — via token from email
exports.resetPassword = async (req, res, next) => {
    const { token } = req.params
    const { new_password } = req.body

    if (!new_password) {
        return res.status(400).json({ message: 'New password is required' })
    }

    const passwordErrors = validatePassword(new_password)
    if (passwordErrors.length > 0) {
        return res.status(400).json({
            message: `Password must contain: ${passwordErrors.join(', ')}`
        })
    }

    try {
        const [rows] = await pool.execute(
            `SELECT users_id, username, reset_token_expires
            FROM users
            WHERE reset_token = ?`,
            [token]
        )

        if (rows.length === 0) {
            return res.status(400).json({
                message: 'Invalid or already used reset link'
            })
        }

        const user = rows[0]

        // Check expiry
        if (new Date() > new Date(user.reset_token_expires)) {
            return res.status(400).json({
                message: 'Reset link has expired. Please request a new one.',
                expired: true
            })
        }

        // Hash new password and clear reset token
        const hashedPassword = await bcrypt.hash(new_password, 12)

        await pool.execute(
            `UPDATE users
            SET password_hash = ?,
                reset_token = NULL,
                reset_token_expires = NULL
            WHERE users_id = ?`,
            [hashedPassword, user.users_id]
        )

        res.status(200).json({
            message: 'Password reset successfully. You can now log in.'
        })
    } catch (err) {
        next(err)
    }
}