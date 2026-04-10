const router = require('express').Router()
const albumController = require('../../controllers/albumController')

// GET
router.get('/', albumController.getAllAlbums)
router.get('/:id', albumController.getAlbumById)

// POST
router.post('/', albumController.createAlbum)

// PUT
router.put('/:id', albumController.updateAlbum)

/**
 * ! DELETE
 */
router.delete('/:id', albumController.deleteAlbum)

module.exports = router