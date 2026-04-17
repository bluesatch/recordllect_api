/**
 * admin middleware
 * Checks if the authenticated user is an admin
 * Must be used after auth middleware
 */

module.exports = (req, res, next)=> {
    if (!req.user.is_admin) {
        return res.status(403).json({
            message: 'Access denied. Admin only.'
        })
    }
    next()
}