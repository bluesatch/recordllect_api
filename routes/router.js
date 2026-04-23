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
        'formats': `http://${process.env.API_HOST}:${PORT}/api/formats`,
        // 'topEight': `http://${process.env.API_HOST}:${PORT}/api/top-eight`
    })
})

const endpoints = [
    'users', 'artists', 'albums', 'performers', 'bands', 'genres', 'labels', 'formats'
]

endpoints.forEach(endpoint => {
    router.use(`/${endpoint}`, require(`./api/${endpoint}Routes`))
})

// Register topEight routes 
const topEightRoutes = require('./api/topEightRoutes')
router.use('/users', topEightRoutes)

// router.use('/users', require('./api/usersRoutes'))
// router.use('/performers', require('./api/performersRoutes'))
// router.use('/albums', require('./api/albumsRoutes'))
// router.use('/labels', require('./api/labelsRoutes'))


/** ERROR HANDLING **/
router.use((req, res)=> {
    res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` })
})

module.exports = router