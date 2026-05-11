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

const sendVerificationEmail = async (email, username, token) => {
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${token}`

    await transporter.sendMail({
        from: `"Groovist" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your Groovist account',
        html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a1a; color: #f5f0e8;">
                <h1 style="font-family: Georgia, serif; color: #c8912a; margin-bottom: 0.5rem;">
                    Groovist
                </h1>
                <p style="color: #8a8a8a; margin-top: 0;">
                    Your vinyl community
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <h2 style="font-family: Georgia, serif; font-size: 1.25rem;">
                    Welcome, @${username}!
                </h2>
                <p style="color: #b0a898; line-height: 1.7;">
                    Thanks for joining Groovist. Please verify your email
                    address to unlock all features.
                </p>
                <a
                    href="${verifyUrl}"
                    style="
                        display: inline-block;
                        margin: 1.5rem 0;
                        padding: 0.75rem 2rem;
                        background-color: #c8912a;
                        color: #1a1a1a;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        font-size: 0.95rem;
                    "
                >
                    Verify Email Address
                </a>
                <p style="color: #6a6a6a; font-size: 0.8rem;">
                    This link expires in 24 hours. If you didn't create a
                    Groovist account you can safely ignore this email.
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <p style="color: #6a6a6a; font-size: 0.75rem;">
                    Or copy this link into your browser:<br />
                    <span style="color: #c8912a;">${verifyUrl}</span>
                </p>
            </div>
        `
    })
}

const sendResendVerificationEmail = async (email, username, token) => {
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${token}`

    await transporter.sendMail({
        from: `"Groovist" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your Groovist account — resent',
        html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a1a; color: #f5f0e8;">
                <h1 style="font-family: Georgia, serif; color: #c8912a; margin-bottom: 0.5rem;">
                    Groovist
                </h1>
                <p style="color: #8a8a8a; margin-top: 0;">
                    Your vinyl community
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <h2 style="font-family: Georgia, serif; font-size: 1.25rem;">
                    Here's your new verification link, @${username}
                </h2>
                <p style="color: #b0a898; line-height: 1.7;">
                    You requested a new verification email. Click below to
                    verify your email address.
                </p>
                <a
                    href="${verifyUrl}"
                    style="
                        display: inline-block;
                        margin: 1.5rem 0;
                        padding: 0.75rem 2rem;
                        background-color: #c8912a;
                        color: #1a1a1a;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        font-size: 0.95rem;
                    "
                >
                    Verify Email Address
                </a>
                <p style="color: #6a6a6a; font-size: 0.8rem;">
                    This link expires in 24 hours.
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <p style="color: #6a6a6a; font-size: 0.75rem;">
                    Or copy this link into your browser:<br />
                    <span style="color: #c8912a;">${verifyUrl}</span>
                </p>
            </div>
        `
    })
}

const sendPasswordResetEmail = async (email, username, token) => {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`

    await transporter.sendMail({
        from: `"Groovist" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Reset your Groovist password',
        html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a1a; color: #f5f0e8;">
                <h1 style="font-family: Georgia, serif; color: #c8912a; margin-bottom: 0.5rem;">
                    Groovist
                </h1>
                <p style="color: #8a8a8a; margin-top: 0;">
                    Your vinyl community
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <h2 style="font-family: Georgia, serif; font-size: 1.25rem;">
                    Password Reset Request
                </h2>
                <p style="color: #b0a898; line-height: 1.7;">
                    Hi @${username}, we received a request to reset your
                    Groovist password. Click below to set a new one.
                </p>
                <a
                    href="${resetUrl}"
                    style="
                        display: inline-block;
                        margin: 1.5rem 0;
                        padding: 0.75rem 2rem;
                        background-color: #c8912a;
                        color: #1a1a1a;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 600;
                        font-size: 0.95rem;
                    "
                >
                    Reset Password
                </a>
                <p style="color: #6a6a6a; font-size: 0.8rem;">
                    This link expires in 1 hour. If you didn't request a
                    password reset you can safely ignore this email.
                </p>
                <hr style="border-color: #2e2e2e; margin: 1.5rem 0;" />
                <p style="color: #6a6a6a; font-size: 0.75rem;">
                    Or copy this link into your browser:<br />
                    <span style="color: #c8912a;">${resetUrl}</span>
                </p>
            </div>
        `
    })
}

module.exports = {
    sendReportEmail,
    sendVerificationEmail,
    sendResendVerificationEmail,
    sendPasswordResetEmail
}