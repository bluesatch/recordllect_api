const router = require('express').Router()

router.get('/', (req, res)=> {
    res.status(200).send('Artists')
})

module.exports = router