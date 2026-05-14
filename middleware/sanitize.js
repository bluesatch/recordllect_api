const xss = require('xss')

/**
 * Sanitize middleware 
 * Strips XSS from string fields in request body 
 * Leaves numbers, booleans, arrays, and null untouched
 */

const sanitizeBody = (req, res, next)=> {

    // Skip multipart form data - multer handles these 
    if (req.headers['content-type']?.includes('multipart/form-data')) {
        return next()
    }

    if (!req.body || typeof req.body !== 'object') {
        return next()
    }

    const sanitize = (obj)=> {
        const cleaned = {}
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                cleaned[key] = xss(value.trim())
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                cleaned[key] = sanitize(value)
            } else if (Array.isArray(value)) {
                cleaned[key] = value.map(item => typeof item === 'string' ? xss(item.trim()) : item)
            } else {
                cleaned[key] = value
            }
        }
        return cleaned
    }

    req.body = sanitize(req.body)
    next()
}

module.exports = sanitizeBody 