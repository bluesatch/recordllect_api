const router = require('express').Router()
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')
const reportController = require('../../controllers/reportController')
const albumController = require('../../controllers/albumController')

// All admin routes require auth + admin middleware
router.get('/reports', auth, admin, reportController.getAllReports)
router.get('/reports/stats', auth, admin, reportController.getReportStats)
router.put('/reports/:id', auth, admin, reportController.updateReport)
router.delete('/albums/:id', auth, admin, albumController.deleteAlbum)

module.exports = router