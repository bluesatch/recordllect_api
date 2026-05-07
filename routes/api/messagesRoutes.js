const express = require('express')
const router = express.Router()
const messageController = require('../../controllers/messageController.js')
const auth = require('../../middleware/auth.js')

router.get('/unread', auth, messageController.getUnreadCount)
router.get('/', auth, messageController.getConversations)
router.post('/', auth, messageController.startConversation)
router.get('/:id/messages', auth, messageController.getMessages)
router.post('/:id/messages', auth, messageController.sendMessage)
router.delete('/:id', auth, messageController.deleteConversation)

module.exports = router