const cloudinary = require('cloudinary').v2 
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')

// Configure Cloudinary 
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

// Image storage - for post images and profile photos 
const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'groovist/images',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
        ]
    }
})

// Video storage - for post videos
const videoStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'groovist/videos',
        allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
        resource_type: 'video',
        transformation: [
            { width: 1280, height: 720, crop: 'limit' },
            { quality: 'auto' }
        ]
    }
})

// Avatar storage - for profile images 
const avatarStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'groovist/avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
        ]
    }
})

// Multer upload handlers 
const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }
})

const uploadVideo = multer({
    storage: videoStorage, 
    limit: { fileSize: 100 * 1024 * 1024 }
})

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }
})

module.exports = {
    cloudinary,
    uploadImage,
    uploadVideo,
    uploadAvatar
}
