const router = require('express').Router()
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')
const reportController = require('../../controllers/reportController')
const albumController = require('../../controllers/albumController')
const trackController = require('../../controllers/trackController')
const userController = require('../../controllers/userControllers')

// All admin routes require auth + admin middleware
router.get('/featured', auth, admin, albumController.getAdminFeatured)
router.get('/reports', auth, admin, reportController.getAllReports)
router.get('/reports/stats', auth, admin, reportController.getReportStats)
router.get('/inactive-users', auth, admin, userController.getInactiveUsers)

router.post('/featured', auth, admin, albumController.setFeaturedAlbum)

router.put('/reports/:id', auth, admin, reportController.updateReport)
router.put('/featured/reorder', auth, admin, albumController.reorderFeatured)

router.delete('/albums/:id', auth, admin, albumController.deleteAlbum)
router.delete('/featured', auth, admin, albumController.removeFeaturedAlbum)
router.delete('/tracks/:id', auth, admin, trackController.deleteTrack)

module.exports = router