const router = require('express').Router()
const auth = require('../../middleware/auth')
const userController = require('../../controllers/userControllers')

// GET
router.get('/me', auth, userController.getMe)
router.get('/:id', auth, userController.getUserById)
router.get('/:id/albums', auth, userController.getUserAlbums)


// POST
router.post('/register', userController.register)
router.post('/login', userController.login)
router.post('/logout', userController.logout)
router.post('/:id/albums', auth, userController.addUserAlbum)

// PUT
router.put('/:id', auth, userController.updateUser)

// DELETE
router.delete('/:id/albums/:album_id', auth, userController.removeUserAlbum)

module.exports = router