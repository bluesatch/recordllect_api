const router = require('express').Router()
const userController = require('../../controllers/userControllers')

router.get('/', (req, res)=> {
    res.status(200).json({ })
})

router.post('/register', userController.register)
router.post('/login', userController.login)

module.exports = router