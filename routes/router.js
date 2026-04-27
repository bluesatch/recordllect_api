const router = require('express').Router()
require('dotenv').config()
const PORT = process.env.PORT || 3001

router.get('/', (req, res)=> {
    res.status(200).json({
        'users': `http://${process.env.API_HOST}:${PORT}/api/users`,
        'artists': `http://${process.env.API_HOST}:${PORT}/api/artists`,
        'albums': `http://${process.env.API_HOST}:${PORT}/api/albums`,
        'performers': `http://${process.env.API_HOST}:${PORT}/api/performers`,
        'bands': `http://${process.env.API_HOST}:${PORT}/api/bands`,
        'genres': `http://${process.env.API_HOST}:${PORT}/api/genres`,
        'labels': `http://${process.env.API_HOST}:${PORT}/api/labels`,
        'formats': `http://${process.env.API_HOST}:${PORT}/api/formats`
    })
})

const endpoints = [
    'users', 'artists', 'albums', 'performers', 'bands', 'genres', 'labels', 'formats', 'tags'
]

endpoints.forEach(endpoint => {
    router.use(`/${endpoint}`, require(`./api/${endpoint}Routes`))
})

// Register topEight routes 
const topEightRoutes = require('./api/topEightRoutes')
router.use('/users', topEightRoutes)

//  Wantlist routes
const wantlistRoutes = require('./api/wantlistRoutes')
router.use('/users', wantlistRoutes)

const postRoutes = require('./api/postsRoutes')
const commentsRoutes = require('./api/commentsRoutes')
const repliesRoutes = require('./api/repliesRoutes')

router.use('/posts', postRoutes)
router.use('/comments', commentsRoutes)
router.use('/replies', repliesRoutes)



/** ERROR HANDLING **/
router.use((req, res)=> {
    res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` })
})

module.exports = router