const router = require('express').Router()
const labelController = require('../../controllers/labelControllers')
const albumController = require('../../controllers/albumController')

// GET
router.get('/', labelController.getAllLabels)
router.get('/:id', labelController.getLabelById)
router.get('/:id/albums', albumController.getAlbumsByLabel)

// POST
router.post('/', labelController.createLabel)

// PUT
router.put('/:id', labelController.updateLabel)

/**
 * ! DELETE
 */
router.delete('/:id', labelController.deleteLabel)

module.exports = router