// REWRITING TO INCLUDE SOCKET.IO 
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
const server = http.createServer(app)

const router = require('./routes/router')
const logger = require('./config/logger')
const auth = require('./middleware/auth')
const sanitizeBody = require('./middleware/sanitize')


app.use(express.json({ limit: '10mb' }))
app.use(sanitizeBody)
app.use(cookieParser())

app.use(hpp()) // => Prevents HTTP parameter pollution


// SOCKET.IO SETUP 
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
    }
})

// Make io accessible to controllers 
app.set('io', io)

const allowedOrigins = [
    'http://localhost:3000',
    'https://groovist.co',
    'https://www.groovist.co',
    'https://recordllect-fe.vercel.app'
]

// MIDDLEWARE 
app.use(cors({
    origin: (origin, callback)=> {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))


// Logger middleware 
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    })
    next()
})

app.use('/api', router)

// SOCKET.IO AUTH MIDDLEWARE 
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token || 
            socket.handshake.headers.cookie?.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]
        
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

// SOCKET.IO CONNECTION HANDLER 
io.on('connection', (socket)=> {
    const userId = socket.user.users_id 

    logger.info(`User ${userId} connected via WebSocket`)

    // JOIN PERSONAL ROOM - NOTIFICATIONS SENT TO THIS ROOM 
    socket.join(`user_${userId}`)

    socket.on('disconnect', ()=> {
        logger.info(`User ${userId} disconnected`)
    })
})

// SECURITY MIDDLEWARE 
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", process.env.CLIENT_URL]
        }
    },
    crossOriginEmbedderPolicy: false
}))

// Global rate limit - 100 requests per 15 minutes
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'Too many requests, please try again later.'},
    standardHeaders: true,
    legacyHeaders: false
})

// Auth rate limit - 10 attepmts per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many login attempts, please try again later.'},
    standardHeaders: true,
    legacyHeaders: false

})

// Discogs rate limit - 20 requests per minute 
const discogsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: 'Too many Discogs requests, please slow down.'},
    standardHeaders: true,
    legacyHeaders: false
})

app.use('/api', globalLimiter)

app.use('/api/users/login', authLimiter)
app.use('/api/users/register', authLimiter)
app.use('/api/users/forgot-password', authLimiter)

app.use('/api/discogs', discogsLimiter)

app.get('/health', (req, res)=> {
    res.json({ status: 'ok'})
})


// GLOBAL ERROR HANDLER 
app.use((err, req, res, next)=> {
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

const PORT = process.env.PORT || 3001
server.listen(PORT, ()=> {
    console.log(`You found the groove at port ${PORT}`)
})