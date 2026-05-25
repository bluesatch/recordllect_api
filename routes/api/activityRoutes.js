const router = require('express').Router()
const { getActivityFeed } = require('../controllers/activityController')
const auth = require('../middleware/auth')

router.get('/feed', auth, getActivityFeed)

module.exports = router