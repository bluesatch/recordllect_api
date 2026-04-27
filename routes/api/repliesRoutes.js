const router = require('express').Router()
const auth = require('../../middleware/auth')
const commentController = require('../../controllers/commentController')

router.delete('/:id', auth, commentController.deleteReply)

module.exports = router