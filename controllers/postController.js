const pool = require('../config/dbconfig')
const logger = require('../config/logger')

const { createNotification } = require('./notificationController')

const { logActivity } = require('./activityController')

// Helper - fetch tags for a post 
const getPostTags = async (postId)=> {
    const [ tags ] = await pool.execute(
        `SELECT t.tag_id, t.tag_name
        FROM post_tags pt 
        JOIN tags t ON pt.tag_id = t.tag_id 
        WHERE pt.post_id = ?`,
        [postId]
    )

    return tags
}

// Helper - fetch like count and whether current user liked a post 
const getPostLikes = async (postId, userId)=> {

    const [ countResult ] = await pool.execute(
        `SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id = ?`,
        [postId]
    )

    const [ userLike ] = await pool.execute(
        `SELECT like_id FROM post_likes WHERE post_id = ? AND users_id = ?`,
        [postId, userId]
    )

    return {
        like_count: countResult[0].like_count,
        liked_by_user: userLike.length > 0
    }
}

// Helper - parse @mentions from post body 
const parseMentions = (body)=> {
    if (!body) return 
    const mentionRegex = /@([a-zA-Z0-9_]+)/g
    const matches = []
    let match 
    while ((match = mentionRegex.exec(body)) !== null) {
        matches.push(match[1].toLowerCase())
    }

    return [...new Set(matches)]
}

// Helper - look up user ids for mentioned usernames
const resolveMentions = async (usernames, authorId)=> {
    if (usernames.length === 0) return []

    const placeholders = usernames.map(()=> '?').join(',')
    const [ rows ] = await pool.execute(
        `SELECT users_id, username FROM users
        WHERE LOWER(username) IN (${placeholders})
        AND users_id != ?
        AND status = 'active'`,
        [...usernames, authorId]
    )
    return rows
}

// GET feed - posts from followed users 
exports.getFeed = async (req, res, next) => {
    const userId = req.user.users_id
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit

    try {
        const [rows] = await pool.query(
            `SELECT * FROM (
                SELECT
                    p.post_id,
                    p.body,
                    p.image_url,
                    p.video_url,
                    p.alt_text,
                    p.created_at,
                    p.updated_at,
                    u.users_id,
                    u.username,
                    u.profile_image_url,
                    COUNT(DISTINCT pl.like_id) AS like_count,
                    COUNT(DISTINCT c.comment_id) AS comment_count,
                    MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user,
                    NULL AS repost_id,
                    NULL AS reposted_by_id,
                    NULL AS reposted_by_username,
                    NULL AS quote,
                    p.created_at AS sort_date,
                    CAST(0 AS UNSIGNED) AS is_repost
                FROM posts p
                JOIN users u ON p.users_id = u.users_id
                LEFT JOIN post_likes pl ON p.post_id = pl.post_id
                LEFT JOIN comments c ON p.post_id = c.post_id
                WHERE p.users_id IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                    UNION SELECT ?
                )
                AND p.users_id NOT IN (
                    SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                    UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
                )
                GROUP BY
                    p.post_id, p.body, p.image_url, p.video_url,
                    p.alt_text, p.created_at, p.updated_at,
                    u.users_id, u.username, u.profile_image_url

                UNION ALL

                SELECT
                    p.post_id,
                    p.body,
                    p.image_url,
                    p.video_url,
                    p.alt_text,
                    p.created_at,
                    p.updated_at,
                    u.users_id,
                    u.username,
                    u.profile_image_url,
                    COUNT(DISTINCT pl.like_id) AS like_count,
                    COUNT(DISTINCT c.comment_id) AS comment_count,
                    MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user,
                    r.repost_id,
                    ru.users_id AS reposted_by_id,
                    ru.username AS reposted_by_username,
                    r.quote,
                    r.created_at AS sort_date,
                    CAST(1 AS UNSIGNED) AS is_repost
                FROM reposts r
                JOIN posts p ON r.post_id = p.post_id
                JOIN users u ON p.users_id = u.users_id
                JOIN users ru ON r.users_id = ru.users_id
                LEFT JOIN post_likes pl ON p.post_id = pl.post_id
                LEFT JOIN comments c ON p.post_id = c.post_id
                WHERE r.users_id IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                    UNION SELECT ?
                )
                AND r.users_id NOT IN (
                    SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                    UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
                )
                GROUP BY
                    p.post_id, p.body, p.image_url, p.video_url,
                    p.alt_text, p.created_at, p.updated_at,
                    u.users_id, u.username, u.profile_image_url,
                    r.repost_id, ru.users_id, ru.username,
                    r.quote, r.created_at
            ) AS feed
            ORDER BY sort_date DESC
            LIMIT ? OFFSET ?`,
            [
                userId,         // liked_by_user check — original posts
                userId,         // following_id
                userId,         // UNION SELECT ? (own posts)
                userId,         // blocked check 1
                userId,         // blocked check 2
                userId,         // liked_by_user check — reposts
                userId,         // following_id — reposts
                userId,         // UNION SELECT ? (own reposts)
                userId,         // blocked check 1 — reposts
                userId,         // blocked check 2 — reposts
                Number(limit),
                Number(offset)
            ]
        )

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) AS total FROM (
                SELECT p.post_id, 0 AS is_repost
                FROM posts p
                WHERE p.users_id IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                    UNION SELECT ?
                )
                AND p.users_id NOT IN (
                    SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                    UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
                )
                UNION ALL
                SELECT r.post_id, 1 AS is_repost
                FROM reposts r
                WHERE r.users_id IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                    UNION SELECT ?
                )
                AND r.users_id NOT IN (
                    SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                    UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
                )
            ) AS feed_count`,
            [userId, userId, userId, userId, userId, userId, userId, userId]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        // Fetch tags for each post
        const posts = await Promise.all(rows.map(async post => ({
            ...post,
            tags: await getPostTags(post.post_id)
        })))

        res.status(200).json({
            count: posts.length,
            total,
            page,
            totalPages,
            posts
        })
    } catch (err) {
        next(err)
    }
}

// GET posts by user 
exports.getUserPosts = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit 

    try {
        const [ countResult ] = await pool.execute(
            `SELECT COUNT(*) AS total FROM (
                SELECT post_id FROM posts WHERE users_id = ?
                UNION ALL 
                SELECT post_id FROM reposts WHERE users_id = ?
            ) AS user_feed`,
            [id, id]
        )

        const total = countResult[0].total 
        const totalPages = Math.ceil(total / limit)

        const [ rows ] = await pool.query(
            `SELECT 
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT pl.like_id) AS like_count,
                COUNT(DISTINCT c.comment_id) AS comment_count,
                MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user 
            FROM posts p 
            JOIN users u ON p.users_id = u.users_id 
            LEFT JOIN post_likes pl ON p.post_id = pl.post_id 
            LEFT JOIN comments c ON p.post_id = c.post_id 
            WHERE p.users_id = ? 
            GROUP BY 
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url
            ORDER BY p.created_at DESC 
            LIMIT ? OFFSET ?`,
            [userId, id, Number(limit), Number(offset)]
        )

        const [repostRows] = await pool.query(
            `SELECT
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT pl.like_id) AS like_count,
                COUNT(DISTINCT c.comment_id) AS comment_count,
                MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user,
                r.repost_id,
                ru.users_id AS reposted_by_id,
                ru.username AS reposted_by_username,
                r.quote,
                r.created_at AS reposted_at,
                1 AS is_repost
            FROM reposts r
            JOIN posts p ON r.post_id = p.post_id
            JOIN users u ON p.users_id = u.users_id
            JOIN users ru ON r.users_id = ru.users_id
            LEFT JOIN post_likes pl ON p.post_id = pl.post_id
            LEFT JOIN comments c ON p.post_id = c.post_id
            WHERE r.users_id = ?
            GROUP BY
                p.post_id, p.body, p.image_url, p.video_url,
                p.alt_text, p.created_at, p.updated_at,
                u.users_id, u.username, u.profile_image_url,
                r.repost_id, ru.users_id, ru.username,
                r.quote, r.created_at`,
            [userId, id]
        )

        const allPosts = [...rows, ...repostRows].sort((a, b)=> {
            const dateA = new Date(a.is_repost ? a.reposted_at : a.created_at)
            const dateB = new Date(b.is_repost ? b.reposted_at : b.created_at)
            return dateB - dateA
        }).slice(offset, offset + limit)

        const posts = await Promise.all(rows.map(async post => ({
            ...post,
            tags: await getPostTags(post.post_id)
        })))

        res.status(200).json({
            count: posts.length,
            total,
            page,
            totalPages,
            posts
        })
    } catch (err) {
        next(err)
    }
}

// CREATE post 
exports.createPost = async (req, res, next)=> {
    const userId = req.user.users_id 
    const { body, image_url, video_url, audio_url, alt_text, tag_ids } = req.body 

    if (!body && !image_url && !video_url) {
        return res.status(400).json({
            message: 'Post must have at least a body, image, or video'
        })
    }

    if (tag_ids && !Array.isArray(tag_ids)) {
        return res.status(400).json({ message: 'tag_ids must be an array'})
    }

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        const [ result ] = await con.execute(
            `INSERT INTO posts (users_id, body, image_url, video_url, audio_url, alt_text)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, body || null, image_url || null, video_url || null, audio_url || null, alt_text || null]
        )

        const post_id = result.insertId 


        // Insert tags if provided 
        if (tag_ids && tag_ids.length > 0) {
            const tagValues = tag_ids.map(tag_id => [post_id, tag_id])
            await con.query(
                `INSERT INTO post_tags (post_id, tag_id) VALUES ?`,
                [tagValues]
            )
        }

        const mentionedUsernames = parseMentions(body)

        if (mentionedUsernames.length > 0) {
            const mentionedUsers = await resolveMentions(mentionedUsernames, userId)

            if (mentionedUsers.length > 0) {
                const io = req.app.get('io')

                const [ author ] = await pool.execute(
                    `SELECT username FROM users WHERE users_id = ?`,
                    [userId]
                )

                const authorUsername = author[0]?.username || 'Someone'

                for (const mentionedUser of mentionedUsers) {
                    await createNotification(io, {
                        recipientId: mentionedUser.users_id,
                        senderId: userId,
                        type: 'mention',
                        referenceId: post_id,
                        message: `@${authorUsername} mentioned you in a post`
                    })
                }
            }
        }

        await con.commit()

        await logActivity(req.user.users_id, 'created_post', post_id)

        res.status(201).json({
            message: 'Post created successfully',
            post_id
        })
    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}

// UPDATE post 
exports.updatePost = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 
    const { body, image_url, video_url, alt_text, tag_ids } = req.body 

    const con = await pool.getConnection()

    try {
        await con.beginTransaction()

        // Verify ownership
        const [ rows ] = await con.execute(
            `SELECT users_id FROM posts WHERE post_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            await con.rollback()
            return res.status(404).json({ message: 'Post not found' })
        }

        if (rows[0].users_id !== userId) {
            await con.rollback()
            return res.status(403).json({ message: 'You can only edit your own posts' })
        }

        await con.execute(
            `UPDATE posts SET 
                body = COALESCE(?, body),
                image_url = COALESCE(?, image_url),
                video_url = COALESCE(?, video_url),
                alt_text = COALESCE(?, alt_text)
            WHERE post_id = ?`,
            [body || null, image_url || null, video_url || null, alt_text || null, id]
        )

        // Update tags if provided 
        if (tag_ids && Array.isArray(tag_ids)) {
            await con.execute(
                `DELETE FROM post_tags WHERE post_id = ?`,
                [id]
            )

            if (tag_ids.length > 0) {
                const tagValues = tag_ids.map(tag_id => [id, tag_id])
                await con.query(
                    `INSERT INTO post_tags (post_id, tag_id) VALUES ?`,
                    [tagValues]
                )
            }
        }

        await con.commit()
        res.status(200).json({ message: 'Post updated successfully' })
    } catch (err) {
        await con.rollback()
        next(err)
    } finally {
        con.release()
    }
}

// DELETE post 
exports.deletePost = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        const [ rows ] = await pool.execute(
            `SELECT users_id FROM posts WHERE post_id = ?`,
            [id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Post not found'})
        }

        // Admins only can delete any post, users can only delete their own 
        if (rows[0].users_id !== userId && !req.user.is_admin) {
            return res.status(403).json({ message: 'You can only delete your own posts' })
        }

        await pool.execute(`DELETE FROM posts WHERE post_id = ?`, [id])

        res.status(200).json({ message: 'Post deleted successfully'})
    } catch (err) {
        next(err)
    }
}

// LIKE a post 
exports.likePost = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id

    try {
        await pool.execute(
            `INSERT INTO post_likes (post_id, users_id) VALUES (?, ?)`,
            [id, userId]
        )

        // Add NOTIFICATIONS
        const io = req.app.get('io')

        const [ postOwner ] = await pool.execute(
            `SELECT users_id FROM posts WHERE post_id = ?`, [id]
        )

        const [ liker ] = await pool.execute(
            `SELECT username FROM users WHERE users_id = ?`, [userId]
        )
        await createNotification(io, {
            recipientId: postOwner[0].users_id,
            senderId: userId,
            type: 'like_post',
            referenceId: parseInt(id),
            message: `@${liker[0].username} liked your post`
        })

        res.status(201).json({ message: 'Post liked'})
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already liked this post' })
        }
        next(err)
    }
}

// UNLIKE a post 
exports.unlikePost = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM post_likes WHERE post_id = ? AND users_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Like not found' })
        }

        res.status(200).json({ message: 'Post unliked' })
    } catch (err) {
        next(err)
    }
}

exports.getPostById = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [rows] = await pool.query(
            `SELECT
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT pl.like_id) AS like_count,
                COUNT(DISTINCT c.comment_id) AS comment_count,
                MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user
            FROM posts p
            JOIN users u ON p.users_id = u.users_id
            LEFT JOIN post_likes pl ON p.post_id = pl.post_id
            LEFT JOIN comments c ON p.post_id = c.post_id
            WHERE p.post_id = ?
            GROUP BY
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url`,
            [userId, id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Post not found' })
        }

        const post = rows[0]
        post.tags = await getPostTags(post.post_id)

        res.status(200).json(post)
    } catch (err) {
        next(err)
    }
}

// REPOST or quote repost 
exports.repostPost = async (req, res, next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 
    const { quote } = req.body 

    try {
        
        const [ postRows ] = await pool.execute(
            `SELECT users_id FROM posts WHERE post_id = ?`,
            [id]
        )

        if (postRows.length === 0) {
            return res.status(404).json({ message: 'Post not found' })
        }

        if (postRows[0].users_id === userId) {
            return res.status(400).json({ message: 'You cannot repost your own post' })
        }

        const [ result ] = await pool.execute(
            `INSERT INTO reposts (users_id, post_id, quote)
            VALUES (?, ?, ?)`,
            [userId, id, quote || null]
        )

        const io = req.app.get('io')
        const [ reposter ] = await pool.execute(
            `SELECT username FROM users WHERE users_id = ?`,
            [userId]
        )

        await createNotification(io, {
            recipientId: postRows[0].users_id,
            senderId: userId,
            type: 'repost',
            referenceId: quote ? result.insertId : parseInt(id),
            message: quote ? `@${reposter[0].username} quote reposted your post` : `@${reposter[0].username} reposted your post`
        })

        res.status(201).json({
            message: quote ? 'Post quote reposted' : 'Post reposted',
            repost_id: result.insertId
        })
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already reposted this post' })
        }
        next(err)
    }
}

// UNDO repost 
exports.undoRepost = async (req, res,  next)=> {
    const { id } = req.params 
    const userId = req.user.users_id 

    try {
        const [ result ] = await pool.execute(
            `DELETE FROM reposts WHERE post_id = ? AND users_id = ?`,
            [id, userId]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Repost not found'})
        }

        res.status(200).json({ message: 'Repost removed' })
    } catch (err) {
        next(err)
    }
}

exports.getRepostById = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.users_id

    try {
        const [rows] = await pool.query(
            `SELECT
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT pl.like_id) AS like_count,
                COUNT(DISTINCT c.comment_id) AS comment_count,
                MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user,
                r.repost_id,
                ru.users_id AS reposted_by_id,
                ru.username AS reposted_by_username,
                r.quote,
                r.created_at AS reposted_at,
                1 AS is_repost
            FROM reposts r
            JOIN posts p ON r.post_id = p.post_id
            JOIN users u ON p.users_id = u.users_id
            JOIN users ru ON r.users_id = ru.users_id
            LEFT JOIN post_likes pl ON p.post_id = pl.post_id
            LEFT JOIN comments c ON p.post_id = c.post_id
            WHERE r.repost_id = ?
            GROUP BY
                p.post_id, p.body, p.image_url, p.video_url,
                p.alt_text, p.created_at, p.updated_at,
                u.users_id, u.username, u.profile_image_url,
                r.repost_id, ru.users_id, ru.username,
                r.quote, r.created_at`,
            [userId, id]
        )

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Repost not found' })
        }

        const post = rows[0]
        post.tags = await getPostTags(post.post_id)

        res.status(200).json(post)
    } catch (err) {
        next(err)
    }
}

exports.getPostsByTag = async (req, res, next) => {
    const { tagName } = req.params
    const userId = req.user.users_id
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit


    try {
        // Verify tag exists
        const [tagRows] = await pool.execute(
            `SELECT tag_id, tag_name FROM tags
            WHERE LOWER(tag_name) = LOWER(?)`,
            [tagName]
        )

        if (tagRows.length === 0) {
            return res.status(404).json({ message: 'Tag not found' })
        }

        const tag = tagRows[0]

        const tagId = Number(tag.tag_id)
    
        // Fetch posts with this tag
        const [posts] = await pool.query(
            `SELECT
                p.post_id,
                p.body,
                p.image_url,
                p.video_url,
                p.alt_text,
                p.created_at,
                p.updated_at,
                u.users_id,
                u.username,
                u.profile_image_url,
                COUNT(DISTINCT pl.like_id) AS like_count,
                COUNT(DISTINCT c.comment_id) AS comment_count,
                MAX(CASE WHEN pl.users_id = ? THEN 1 ELSE 0 END) AS liked_by_user,
                0 AS is_repost
            FROM posts p
            JOIN users u ON p.users_id = u.users_id
            JOIN post_tags pt ON p.post_id = pt.post_id
            LEFT JOIN post_likes pl ON p.post_id = pl.post_id
            LEFT JOIN comments c ON p.post_id = c.post_id
            WHERE pt.tag_id = ?
            AND p.users_id NOT IN (
                SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
            )
            GROUP BY
                p.post_id, p.body, p.image_url, p.video_url,
                p.alt_text, p.created_at, p.updated_at,
                u.users_id, u.username, u.profile_image_url
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?`,
            [userId, tagId, userId, userId, Number(limit), Number(offset)]
        )


        // Fetch tags for each post
        const postsWithTags = await Promise.all(
            posts.map(async post => {
                const tags = await getPostTags(post.post_id)
                return { ...post, tags }
            })
        )

        // Count total
        const [countResult] = await pool.query(
            `SELECT COUNT(DISTINCT p.post_id) AS total
            FROM posts p
            JOIN post_tags pt ON p.post_id = pt.post_id
            WHERE pt.tag_id = ?
            AND p.users_id NOT IN (
                SELECT blocked_id FROM blocked_users WHERE blocker_id = ?
                UNION SELECT blocker_id FROM blocked_users WHERE blocked_id = ?
            )`,
            [tagId, userId, userId]
        )

        const total = countResult[0].total
        const totalPages = Math.ceil(total / limit)

        res.status(200).json({
            tag: tag.tag_name,
            tag_id: tag.tag_id,
            posts: postsWithTags,
            total,
            totalPages,
            page
        })
    } catch (err) {
        next(err)
    }
}