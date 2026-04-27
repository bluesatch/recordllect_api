const router = require('express').Router()
const auth = require('../../middleware/auth')
const tagController = require('../../controllers/tagController')

router.get('/', tagController.getAllTags)
router.post('/', auth, tagController.createTag)

module.exports = router

