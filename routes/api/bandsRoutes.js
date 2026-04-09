const router = require('express').Router()

router.get('/', (req, res)=> {
    res.status(200).send('Bands')
})

module.exports = router