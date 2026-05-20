require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const http = require('http')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const hpp = require('hpp')

const app = express()
app.set('trust proxy', 1)
const server = http.createServer(app)

const router = require('./routes/router')
const logger = require('./config/logger')
const sanitizeBody = require('./middleware/sanitize')

// ============================================
// 1. CORS — must be first
// ============================================
const allowedOrigins = [
    'http://localhost:3000',
    'https://groovist.co',
    'https://www.groovist.co'
]

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}))

// ============================================
// 2. HELMET — after CORS
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: [
                "'self'",
                "https://groovist.co",
                "https://www.groovist.co",
                "https://api.groovist.co",
                process.env.CLIENT_URL
            ]
        }
    },
    crossOriginEmbedderPolicy: false
}))

// ============================================
// 3. RATE LIMITERS
// ============================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
})

const discogsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: 'Too many Discogs requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
})

const collectionImportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { message: 'Too many collection imports. Please wait an hour before trying again.' },
    standardHeaders: true,
    legacyHeader: false
})

app.use('/api', globalLimiter)
app.use('/api/users/login', authLimiter)
app.use('/api/users/register', authLimiter)
app.use('/api/users/forgot-password', authLimiter)
app.use('/api/discogs', discogsLimiter)
app.use('/api/discogs/import-collection', collectionImportLimiter)

// ============================================
// 4. BODY PARSING & SECURITY
// ============================================
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())
app.use(hpp())
app.use(sanitizeBody)

// ============================================
// 5. LOGGER
// ============================================
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    })
    next()
})

// ============================================
// 6. SOCKET.IO
// ============================================
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
})

app.set('io', io)

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token ||
            socket.handshake.headers.cookie
                ?.split(';')
                .find(c => c.trim().startsWith('token='))
                ?.split('=')[1]

        if (!token) {
            return next(new Error('Authentication required'))
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.user = decoded
        next()
    } catch (err) {
        next(new Error('Invalid token'))
    }
})

io.on('connection', (socket) => {
    const userId = socket.user.users_id
    logger.info(`User ${userId} connected via WebSocket`)
    socket.join(`user_${userId}`)

    socket.on('disconnect', () => {
        logger.info(`User ${userId} disconnected`)
    })
})

// ============================================
// 7. ROUTES
// ============================================
app.use('/api', router)

// ============================================
// 8. HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
})

// ============================================
// 9. GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
        message: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.users_id
    })

    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    })
})

// ============================================
// 10. START SERVER
// ============================================
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`You found the groove at port ${PORT}`)
})