const router = require('express').Router()

router.get('/', (req, res)=> {
    res.status(200).send('Labels')
})

module.exports = router