const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
})

const sendReportEmail = async (report) => {
    try {
        await transporter.sendMail({
            from: `"Groovist" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `⚠️ New Album Report — ${report.album_title}`,
            html: `
                <h2>New Album Report</h2>
                <p><strong>Album:</strong> ${report.album_title}</p>
                <p><strong>Reported by:</strong> @${report.username}</p>
                <p><strong>Reason:</strong> ${report.reason}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <br />
                <a href="${process.env.CLIENT_URL}/admin" style="
                    background: #dc3545;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 4px;
                ">
                    Review in Admin Dashboard
                </a>
            `
        })
    } catch (err) {
        console.error('Failed to send report email:', err)
    }
}

module.exports = { sendReportEmail }