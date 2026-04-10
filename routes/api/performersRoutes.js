const router = require('express').Router()
const performerController = require('../../controllers/performerController')

// GET
router.get('/', performerController.getAllPerformers)
router.get('/:id', performerController.getPerformerById)

// POST
router.post('/', performerController.createPerformer)

// PUT
router.put('/:id', performerController.updatePerformer)

/* 
! DELETE
*/
router.delete('/:id', performerController.deletePerformer)

module.exports = router