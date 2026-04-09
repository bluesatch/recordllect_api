const router = require('express').Router()
const performerController = require('../../controllers/performerController')

router.get('/', (req, res)=> {
    res.status(200).send('Performers')
})

router.post('/create', performerController.createPerformer)

module.exports = router