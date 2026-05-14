const router = require('express').Router() 
const auth = require('../../middleware/auth')
const uploadController = require('../../controllers/uploadController')

const {
    uploadImage,
    uploadVideo,
    uploadAvatar
} = require('../../config/cloudinary')

// Image upload - for posts 
router.post('/image', auth, uploadImage.single('image'), uploadController.uploadImage)

// Video upload - for posts
router.post('/video', auth, uploadVideo.single('video'), uploadController.uploadVideo)

// Avatar upload - for profile image 
router.post('/avatar', auth, uploadAvatar.single('avatar'), uploadController.uploadAvatar)

// Delete file from Cloudinary 
router.delete('/', auth, uploadController.deleteFile)

module.exports = router