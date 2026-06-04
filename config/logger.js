const winston = require('winston')
const path = require('path')

// Safe JSON replacer — handles circular references from MySQL2 and other libs
const safeReplacer = () => {
    const seen = new WeakSet()
    return (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]'
            seen.add(value)
        }
        return value
    }
}

const safeJsonFormat = winston.format((info) => {
    try {
        // Force serialization through safe replacer so downstream json() never sees circular refs
        JSON.parse(JSON.stringify(info, safeReplacer()))
    } catch (_) {
        // If still can't serialize, strip to primitives only
        info.meta = '[unserializable]'
    }
    return info
})

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        safeJsonFormat(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    let metaStr = ''
                    if (Object.keys(meta).length) {
                        // safe replacer handles circular references
                        const seen = new WeakSet()
                        const safeJson = JSON.stringify(meta, (key, value) => {
                            if (typeof value === 'object' && value !== null) {
                                if (seen.has(value)) return '[Circular]'
                                seen.add(value)
                            }
                            return value
                        }, 2)
                        metaStr = `\n${safeJson}`
                    }
                    return `[${timestamp}] ${level}: ${message}${metaStr}`
                })
            )
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
})

module.exports = logger
