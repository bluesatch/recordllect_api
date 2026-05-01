const router = require('express').Router()
const auth = require('../../middleware/auth')
const notificationController = require('../../controllers/notificationController')

router.get('/', auth, notificationController.getNotifications)
router.put('/read-all', auth, notificationController.markAllAsRead)
router.put('/:id/read', auth, notificationController.markAsRead)
router.delete('/:id', auth, notificationController.deleteNotification)

module.exports = router