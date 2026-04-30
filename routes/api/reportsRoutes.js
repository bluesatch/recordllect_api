const router = require('express').Router()
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')
const reportController = require('../../controllers/reportController')

router.post('/:id/report', auth, reportController.reportAlbum)

module.exports = router