/**
 * Generates Test Users for app
 * Password for all is 'TestPass1!'
 */

require('dotenv').config()
const bcrypt = require('bcrypt')
const pool = require('../config/dbconfig')

const password = 'TestPass1!'

const users = [
    {
        username: 'vinylking',
        first_name: 'Marcus',
        last_name: 'Johnson',
        email: 'vinylking@test.com',
        city: 'Chicago',
        state: 'IL',
        country: 'US',
        bio: 'Lifelong vinyl collector. Jazz and Soul are my everything.'
    },
    {
        username: 'groovequeen',
        first_name: 'Diane',
        last_name: 'Williams',
        email: 'groovequeen@test.com',
        city: 'New Orleans',
        state: 'LA',
        country: 'US',
        bio: 'Funk and R&B all day. Always on the hunt for rare pressings.'
    },
    {
        username: 'cratedigger',
        first_name: 'James',
        last_name: 'Brown',
        email: 'cratedigger@test.com',
        city: 'Detroit',
        state: 'MI',
        country: 'US',
        bio: 'Hip-Hop head and Blues lover. Detroit born and raised.'
    },
    {
        username: 'soulpatrol',
        first_name: 'Angela',
        last_name: 'Davis',
        email: 'soulpatrol@test.com',
        city: 'Atlanta',
        state: 'GA',
        country: 'US',
        bio: 'Soul music is life. Collector of first pressings and rare finds.'
    },
    {
        username: 'basslineking',
        first_name: 'Derek',
        last_name: 'Miles',
        email: 'basslineking@test.com',
        city: 'Los Angeles',
        state: 'CA',
        country: 'US',
        bio: 'Funk, Jazz and Electronic. Bass is everything.'
    }
]

const seedUsers = async () => {
    console.log('Seeding test users...')
    console.log(`Password for all accounts: ${password}`)
    console.log('=====================================')

    try {
        const password_hash = await bcrypt.hash(password, 10)

        for (const user of users) {
            try {
                const [result] = await pool.execute(
                    `INSERT INTO users 
                    (username, first_name, last_name, email, password_hash, status, email_verified_at, city, state, country, bio)
                    VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
                    [
                        user.username,
                        user.first_name,
                        user.last_name,
                        user.email,
                        password_hash,
                        user.city,
                        user.state,
                        user.country,
                        user.bio
                    ]
                )

                const userId = result.insertId
                console.log(`✓ Created @${user.username} (ID: ${userId})`)

            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    console.log(`→ @${user.username} already exists — skipping`)
                } else {
                    console.error(`✗ Failed to create @${user.username}:`, err.message)
                }
            }
        }

        console.log('=====================================')
        console.log('Done! Now seeding genres, follows and albums...')

        // Fetch user IDs
        const [users_rows] = await pool.execute(
            `SELECT users_id, username FROM users 
            WHERE username IN ('vinylking', 'groovequeen', 'cratedigger', 'soulpatrol', 'basslineking')`
        )

        const userMap = {}
        users_rows.forEach(u => { userMap[u.username] = u.users_id })

        console.log('User IDs:', userMap)

        // Seed user_genres
        const userGenres = [
            { username: 'vinylking', genres: ['Jazz', 'Soul', 'Blues'] },
            { username: 'groovequeen', genres: ['Funk', 'R&B', 'Soul', 'Disco'] },
            { username: 'cratedigger', genres: ['Hip-Hop', 'Blues', 'Jazz'] },
            { username: 'soulpatrol', genres: ['Soul', 'R&B', 'Gospel'] },
            { username: 'basslineking', genres: ['Funk', 'Jazz', 'Electronic'] }
        ]

        // Fetch genre IDs
        const [genre_rows] = await pool.execute(
            `SELECT genre_id, genre_name FROM genres`
        )

        const genreMap = {}
        genre_rows.forEach(g => { genreMap[g.genre_name] = g.genre_id })

        for (const ug of userGenres) {
            const userId = userMap[ug.username]
            if (!userId) continue

            for (const genreName of ug.genres) {
                const genreId = genreMap[genreName]
                if (!genreId) {
                    console.log(`→ Genre "${genreName}" not found — skipping`)
                    continue
                }

                try {
                    await pool.execute(
                        `INSERT IGNORE INTO user_genres (users_id, genre_id) VALUES (?, ?)`,
                        [userId, genreId]
                    )
                } catch (err) {
                    console.error(`Failed to add genre ${genreName} for @${ug.username}:`, err.message)
                }
            }
            console.log(`✓ Genres seeded for @${ug.username}`)
        }

        // Seed follows
        const follows = [
            { follower: 'vinylking', following: 'groovequeen' },
            { follower: 'vinylking', following: 'cratedigger' },
            { follower: 'vinylking', following: 'soulpatrol' },
            { follower: 'groovequeen', following: 'vinylking' },
            { follower: 'groovequeen', following: 'basslineking' },
            { follower: 'cratedigger', following: 'vinylking' },
            { follower: 'cratedigger', following: 'groovequeen' },
            { follower: 'soulpatrol', following: 'vinylking' },
            { follower: 'soulpatrol', following: 'groovequeen' },
            { follower: 'basslineking', following: 'cratedigger' },
            { follower: 'basslineking', following: 'soulpatrol' }
        ]

        for (const follow of follows) {
            const followerId = userMap[follow.follower]
            const followingId = userMap[follow.following]
            if (!followerId || !followingId) continue

            try {
                await pool.execute(
                    `INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`,
                    [followerId, followingId]
                )
            } catch (err) {
                console.error(`Failed to add follow:`, err.message)
            }
        }
        console.log('✓ Follows seeded')

        // Seed user_albums — grab 10 random albums for each test user
        const [albumRows] = await pool.execute(
            `SELECT album_id FROM albums ORDER BY RAND() LIMIT 50`
        )

        const albumIds = albumRows.map(a => a.album_id)

        let albumIndex = 0
        for (const username of Object.keys(userMap)) {
            const userId = userMap[username]
            const userAlbums = albumIds.slice(albumIndex, albumIndex + 10)
            albumIndex += 10

            for (const albumId of userAlbums) {
                try {
                    await pool.execute(
                        `INSERT IGNORE INTO user_albums (users_id, album_id) VALUES (?, ?)`,
                        [userId, albumId]
                    )
                } catch (err) {
                    console.error(`Failed to add album for @${username}:`, err.message)
                }
            }
            console.log(`✓ Albums seeded for @${username}`)
        }

        console.log('=====================================')
        console.log('All done! Test accounts ready.')
        console.log('Password for all accounts: TestPass1!')
        console.log('=====================================')

    } catch (err) {
        console.error('Script failed:', err)
    } finally {
        await pool.end()
    }
}

seedUsers()