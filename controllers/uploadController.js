const { cloudinary } = require('../config/cloudinary')

// POST /upload/image - upload a single image 
exports.uploadImage = async (req, res, next)=> {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' })
        }

        res.status(200).json({
            url: req.file.path,
            public_id: req.file.filename,
            width: req.file.width,
            height: req.file.height,
            format: req.file.format,
            size: req.file.size
        })
    } catch (err) {
        next(err)
    }
}

// POST /upload/video - upload a single video 
exports.uploadVideo = async (req, res, next)=> {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No video file provided' })
        }

        res.status(200).json({
            url: req.file.path,
            public_id: req.file.filename,
            format: req.file.format,
            size: req.file.size
        })
    } catch (err) {
        next(err)
    }
}

// POST /upload/avatar - upload profile image 
exports.uploadAvatar = async (req, res, next)=> {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' })
        }

        res.status(200).json({
            url: req.file.path,
            public_id: req.file.filename
        })
    } catch (err) {
        next(err)
    }
}

// DELETE /upload - delete a file from Cluudinary 
exports.deleteFile = async (req, res, next)=> {
    const { public_id, resource_type = 'image' } = req.body 

    if (!public_id) {
        return res.status(400).json({ message: 'public_id is required' })
    }

    try {
        await cloudinary.uploader.destroy(public_id, {
            resource_type
        })

        res.status(200).json({ message: 'File deleted successfully' })
    } catch (err) {
        next(err)
    }
}