const router = require('express').Router()
const auth = require('../../middleware/auth')
const userController = require('../../controllers/userControllers')
const postController = require('../../controllers/postController')

// GET
router.get('/search', auth, userController.searchUsers)
router.get('/me', auth, userController.getMe)
router.get('/:id/albums/:album_id', auth, userController.checkUserAlbum)
router.get('/:id/albums', auth, userController.getUserAlbums)
router.get('/:id/followers', auth, userController.getFollowers)
router.get('/:id/following/check', auth, userController.checkFollowing)
router.get('/:id/following', auth, userController.getFollowing)
router.get('/:id/posts', auth, postController.getUserPosts)
router.get('/:id', auth, userController.getUserById)

// POST
router.post('/register', userController.register)
router.post('/login', userController.login)
router.post('/logout', userController.logout)
router.post('/:id/albums', auth, userController.addUserAlbum)
router.post('/:id/follow', auth, userController.followUser)

// PUT
router.put('/:id', auth, userController.updateUser)
router.put('/:id/now-playing', auth, userController.setNowPlaying)

// DELETE
router.delete('/:id/albums/:album_id', auth, userController.removeUserAlbum)
router.delete('/:id/follow', auth, userController.unfollowUser)
router.delete('/:id/now-playing', auth, userController.clearNowPlaying)

module.exports = router