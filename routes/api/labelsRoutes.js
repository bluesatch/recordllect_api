const router = require('express').Router()
const labelController = require('../../controllers/labelControllers')

router.get('/', (req, res)=> {
    res.status(200).send('Labels')
})

router.post('/create', labelController.createLabel)

module.exports = router