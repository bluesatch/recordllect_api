// scripts/testMailer.js
require('dotenv').config()
const { sendReportEmail } = require('../config/mailer')

sendReportEmail({
    album_title: 'Test Album',
    username: 'testuser',
    reason: 'This is a test report'
}).then(() => {
    console.log('Email sent successfully!')
    process.exit(0)
}).catch(err => {
    console.error('Email failed:', err)
    process.exit(1)
})