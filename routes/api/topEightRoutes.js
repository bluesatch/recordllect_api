const router = require('express').Router()
const auth = require('../../middleware/auth')
const topEightController = require('../../controllers/topEightController')

router.get('/:id/top-eight', topEightController.getTopEight)
router.post('/:id/top-eight', auth, topEightController.addToTopEight)
router.delete('/:id/top-eight/:position', auth, topEightController.removeFromTopEight)

module.exports = router