const router = require('express').Router()
const auth = require('../../middleware/auth')
const discogsController = require('../../controllers/discogsController')

router.get('/search', auth, discogsController.searchDiscogs)
router.post('/import', auth, discogsController.importFromDiscogs)
router.post('/import-collection', auth, discogsController.importCollection)

module.exports = router 