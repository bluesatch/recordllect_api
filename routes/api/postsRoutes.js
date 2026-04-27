const router = require('express').Router()
const auth = require('../../middleware/auth')
const postController = require('../../controllers/postController')
const commentController = require('../../controllers/commentController')

// Feed 
router.get('/feed', auth, postController.getFeed)

// Posts 
router.post('/', auth, postController.createPost)
router.put('/:id', auth, postController.updatePost)
router.delete('/:id', auth, postController.deletePost)

// Post likes 
router.post('/:id/like', auth, postController.likePost)
router.delete('/:id/like', auth, postController.unlikePost)

// Comments 
router.get('/:id/comments', auth, commentController.getComments)
router.post('/:id/comments', auth, commentController.addComment)

module.exports = router 