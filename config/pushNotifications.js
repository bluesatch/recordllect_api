const sendPushNotification = async (pushToken, title, body, data = {}) => {
    if (!pushToken) return

    const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        badge: 1,
    }

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate'
            },
            body: JSON.stringify(message)
        })

        const result = await response.json()

        if (result.data?.status === 'error') {
            console.error('Push notification error:', result.data.message)
        }

        return result
    } catch (err) {
        console.error('Failed to send push notification:', err.message)
    }
}

module.exports = { sendPushNotification }