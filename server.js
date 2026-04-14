// Import and instantiate express as server
const express = require('express')
const server = express()

const cors = require('cors')


// Import and config dotenv. For environmental variables
const dotenv = require('dotenv')
dotenv.config()

server.use(express.json())
server.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}))

// cookieParser
const cookieParser = require('cookie-parser')
server.use(cookieParser())

// Routes
const router = require('./routes/router')
server.use('/api', router)

server.use((err, req, res, next)=> {
    console.error(err.stack)
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error'
    })
})

// Health Check
server.get('/health', (req, res)=> {
    res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, ()=> {
    console.log(`You found the groove on port ${PORT}`)
})