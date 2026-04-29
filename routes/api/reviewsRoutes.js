const router = require('express').Router()
const auth = require('../../middleware/auth')
const reviewController = require('../../controllers/reviewController')

router.put('/:id', auth, reviewController.updateReview)
router.delete('/:id', auth, reviewController.deleteReview)
router.post('/:id/helpful', auth, reviewController.markHelpful)
router.delete('/:id/helpful', auth, reviewController.unmarkHelpful)

module.exports = router