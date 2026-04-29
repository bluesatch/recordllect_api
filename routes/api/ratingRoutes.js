const router = require('express').Router()
const auth = require('../../middleware/auth')
const ratingController = require('../../controllers/ratingController')
const reviewController = require('../../controllers/reviewController')

// Ratings
router.get('/:id/ratings', auth, ratingController.getAlbumRatings)
router.post('/:id/ratings', auth, ratingController.rateAlbum)
router.put('/:id/ratings', auth, ratingController.updateRating)
router.delete('/:id/ratings', auth, ratingController.deleteRating)

// Reviews
router.get('/:id/reviews', auth, reviewController.getAlbumReviews)
router.post('/:id/reviews', auth, reviewController.createReview)

module.exports = router