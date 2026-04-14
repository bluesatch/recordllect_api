const router = require('express').Router()
const labelController = require('../../controllers/labelControllers')

// GET
router.get('/', labelController.getAllLabels)
router.get('/:id', labelController.getLabelById)

// POST
router.post('/', labelController.createLabel)

// PUT
router.put('/:id', labelController.updateLabel)

/**
 * ! DELETE
 */
router.delete('/:id', labelController.deleteLabel)

module.exports = router