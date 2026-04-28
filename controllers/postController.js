const pool = require('../config/dbconfig')

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

// GET feed - posts from followed users 
exports.getFeed = async (req, res, next)=> {
    const userId = req.user.users_id
    const page = parseInt(req.query.page) || 1 
    const limit = parseInt(req.query.limit) || 10 
    const offset = (page - 1) * limit 

    try {
        
        const [ countResult ] = await pool.execute (
            `SELECT COUNT(*) AS total 
            FROM posts p 
            WHERE p.users_id IN (
                SELECT following_id FROM follows WHERE follower_id = ?
                UNION
                SELECT ?
            )`,
            [userId, userId]
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
            WHERE p.users_id IN (
                SELECT following_id FROM follows WHERE follower_id = ?
                UNION
                SELECT ?
            )
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
            [userId, userId, userId, Number(limit), Number(offset)]
        )

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
            `SELECT COUNT(*) AS total FROM posts WHERE users_id = ?`,
            [id]
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
    const { body, image_url, video_url, alt_text, tag_ids } = req.body 

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
            `INSERT INTO posts (users_id, body, image_url, video_url, alt_text)
            VALUES (?, ?, ?, ?, ?)`,
            [userId, body || null, image_url || null, video_url || null, alt_text || null]
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

        await con.commit()

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