const router = require('express').Router()
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')
const userController = require('../../controllers/userControllers')
const postController = require('../../controllers/postController')

const { verifyUserOwnership } = require('../../middleware/ownership')
const { verify } = require('jsonwebtoken')

// GET
router.get('/search', auth, userController.searchUsers)
router.get('/blocked', auth, userController.getBlockedUsers)
router.get('/me', auth, userController.getMe)
router.get('/socket-token', auth, userController.getSocketToken)
router.get('/by-username/:username', auth, userController.getUserByUsername)
router.get('/verify/:token', userController.verifyEmail)
router.get('/:id/block/check', auth, userController.checkBlocked)
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
router.post('/resend-verification', auth, userController.resendVerification)
router.post('/forgot-password', userController.forgotPassword)
router.post('/reset-password/:token', userController.resetPassword)
router.post('/push-token', auth, userController.savePushToken)
router.post('/:id/albums', auth, userController.addUserAlbum)
router.post('/:id/follow', auth, userController.followUser)
router.post('/:id/block', auth, userController.blockUser)

// PUT
router.put('/change-password', auth, userController.changePassword)
router.put('/:id', auth, verifyUserOwnership,  userController.updateUser)
router.put('/:id/deactivate', auth,verifyUserOwnership, userController.deactivateAccount)
router.put('/:id/reactivate', auth, admin, userController.reactivateAccount)
router.put('/:id/now-playing', auth, userController.setNowPlaying)

// DELETE
router.delete('/:id/albums/:album_id', auth, userController.removeUserAlbum)
router.delete('/:id/follow', auth, userController.unfollowUser)
router.delete('/:id/now-playing', auth, userController.clearNowPlaying)
router.delete('/:id/block', auth, userController.unblockUser)

module.exports = router