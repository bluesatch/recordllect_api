const router = require('express').Router()
const auth = require('../../middleware/auth')
const userController = require('../../controllers/userControllers')

// GET
router.get('/:id', auth, userController.getUserById)

// POST
router.post('/register', userController.register)
router.post('/login', userController.login)
router.post('/logout', userController.logout)

// PUT
router.put('/:id', auth, userController.updateUser)

module.exports = router