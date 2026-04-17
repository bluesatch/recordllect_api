const router = require('express').Router()
const performerController = require('../../controllers/performerController')
const albumController = require('../../controllers/albumController')
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')

// GET
router.get('/', performerController.getAllPerformers)
router.get('/:id', performerController.getPerformerById)
router.get('/:id/albums', albumController.getAlbumsByPerformer)


// POST
router.post('/', performerController.createPerformer)

// PUT
router.put('/:id', auth, admin, performerController.updatePerformer)

/* 
! DELETE
*/
router.delete('/:id', auth, admin, performerController.deletePerformer)

module.exports = router