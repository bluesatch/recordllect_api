// REWRITING TO INCLUDE SOCKET.IO 
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const http = require('http')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const router = require('./routes/router')
const logger = require('./config/logger')

const app = express()
const server = http.createServer(app)

// SOCKET.IO SETUP 
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
    }
})

// Make io accessible to controllers 
app.set('io', io)

// MIDDLEWARE 
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://lcoalhost:3000',
    credentials: true
}))

app.use(express.json())
app.use(cookieParser())

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