const router = require('express').Router()
const auth = require('../../middleware/auth')
const admin = require('../../middleware/admin')
const trackController = require('../../controllers/trackController')
const discogsController = require('../../controllers/discogsController')

// Get tracks for an album
router.get('/:id/tracks', trackController.getAlbumTracks)

// Import tracks from Discogs for existing album — admin only
router.post('/:id/import-tracks', auth, admin, discogsController.importTracksForAlbum)

module.exports = router