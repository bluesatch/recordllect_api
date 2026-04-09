const jwt = require('jsonwebtoken')

module.exports = (req, res, next)=> {

    const token = req.cookies.token

    if (!token) {
        return res.status(401).json({ message: 'No token provided' })
    }

    try {
        const tokenDecoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = tokenDecoded
        next()
    } catch (err) {
        res.status(403).json({ message: 'Invalid or expired token'})
    }
}