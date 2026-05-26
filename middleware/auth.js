const jwt = require('jsonwebtoken')

module.exports = (req, res, next)=> {

    let token = req.cookies?.token

    // Fall back to Authorization header (mobile)
    if (!token) {
        const authHeader = req.headers.authorization
        if (authHeader?.startsWith('Bearer')) {
            token = authHeader.substring(7)
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'groovist'
        })

        req.user = decoded
        next()
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Session expired, please log in again' })
        }

        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' })
        }
        return res.status(401).json({ message: 'Not authenticated' })
    }
}