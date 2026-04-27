const router = require('express').Router()
const auth = require('../../middleware/auth')
const commentController = require('../../controllers/commentController')

router.delete('/:id', auth, commentController.deleteComment)
router.post('/:id/like', auth, commentController.likeComment)
router.delete('/:id/like', auth, commentController.unlikeComment)
router.post('/:id/replies', auth, commentController.addReply)

module.exports = router