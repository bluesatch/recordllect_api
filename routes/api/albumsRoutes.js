const router = require('express').Router()
const albumController = require('../../controllers/albumController')
const auth = require('../../middleware/auth')

// GET
router.get('/', albumController.getAllAlbums)
router.get('/featured', albumController.getFeaturedAlbums)
router.get('/:id', auth, albumController.getAlbumById)

// POST
router.post('/', albumController.createAlbum)

// PUT
router.put('/:id', albumController.updateAlbum)

/**
 * ! DELETE
 */
router.delete('/:id', albumController.deleteAlbum)

module.exports = router