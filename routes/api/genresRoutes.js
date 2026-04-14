const router = require('express').Router()

router.get('/', (req, res)=> {
    res.status(200).send('Genres')
})

module.exports = router