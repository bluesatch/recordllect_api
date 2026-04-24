const router = require('express').Router()
const auth = require('../../middleware/auth')
const wantlistController = require('../../controllers/wantlistController')

// GET 
router.get('/:id/wantlist/check/:album_id', auth, wantlistController.checkWantlist)
router.get('/:id/wantlist', auth, wantlistController.getWantlist)

// POST
router.post('/:id/wantlist', auth, wantlistController.addToWantlist)

// PUT 
router.put('/:id/wantlist/:wantlist_id', auth, wantlistController.updateWantlistItem)

// ! DELETE 
router.delete('/:id/wantlist/:wantlist_id', auth, wantlistController.removeFromWantlist)

module.exports = router