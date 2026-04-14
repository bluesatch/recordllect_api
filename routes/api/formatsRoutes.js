const router = require('express').Router()
const formatController = require('../../controllers/formatController')

router.get('/', formatController.getAllFormats)

module.exports = router