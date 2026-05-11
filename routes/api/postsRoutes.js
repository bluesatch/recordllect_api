const router = require('express').Router()
const auth = require('../../middleware/auth')
const postController = require('../../controllers/postController')
const commentController = require('../../controllers/commentController')
const { verifyPostOwnership } = require('../../middleware/ownership')

// Feed 
router.get('/feed', auth, postController.getFeed)
router.get('/reposts/:id', auth, postController.getRepostById)
router.get('/tags/:tagName', auth, postController.getPostsByTag)
router.get('/:id', auth, postController.getPostById)

// Posts 
router.post('/', auth, postController.createPost)
router.put('/:id', auth, verifyPostOwnership, postController.updatePost)
router.delete('/:id', auth, verifyPostOwnership, postController.deletePost)

// Post likes 
router.post('/:id/like', auth, postController.likePost)
router.post('/:id/repost', auth, postController.repostPost)
router.delete('/:id/like', auth, postController.unlikePost)
router.delete('/:id/repost', auth, postController.undoRepost)

// Comments 
router.get('/:id/comments', auth, commentController.getComments)
router.post('/:id/comments', auth, commentController.addComment)


module.exports = router 