# Groovist API

> REST API for Groovist — a vinyl collection social platform

**Live:** https://api.groovist.co  
**Frontend:** https://groovist.co

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express |
| Database | MySQL 8.0+ via mysql2/promise |
| Authentication | JWT in httpOnly cookies |
| Real-time | Socket.io |
| Email | Resend |
| Logging | Winston |
| Security | Helmet, express-rate-limit, hpp, xss |

---

## Prerequisites

- Node.js 18+
- MySQL 8.0+
- A [Discogs](https://discogs.com) account and personal access token
- A [Resend](https://resend.com) account for transactional email

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/recordllect_api.git
cd recordllect_api
npm install
```

### 2. Create `.env`

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=album_db

JWT_SECRET=your_64_char_random_string
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:3000

DISCOGS_TOKEN=your_discogs_token

RESEND_API_KEY=re_your_api_key
EMAIL_USER=you@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Set up the database

```bash
mysql -u root -p -e "CREATE DATABASE album_db;"
mysql -u root -p album_db < ../recordllect_db/schema_final.sql
mysql -u root -p album_db < ../recordllect_db/seed.sql
```

### 4. Start the server

```bash
npm run dev
# You found the groove at port 3001
```

### 5. Verify

```bash
curl http://localhost:3001/health
# { "status": "ok" }
```

---

## Project Structure

```
recordllect_api/
├── config/
│   ├── dbconfig.js          # MySQL connection pool
│   ├── logger.js            # Winston logger
│   └── mailer.js            # Resend email functions
├── controllers/             # Route handlers
├── middleware/
│   ├── auth.js              # JWT verification
│   ├── admin.js             # Admin-only protection
│   ├── ownership.js         # Resource ownership checks
│   └── sanitize.js          # XSS sanitization
├── routes/api/              # Express routers
├── scripts/
│   ├── matchDiscogsIds.js   # Match albums to Discogs IDs
│   ├── importAlbumCovers.js # Import cover art
│   ├── importAllTracks.js   # Import track listings
│   └── generateTestUsers.js # Create test accounts
├── logs/                    # Winston logs (gitignored)
└── server.js                # Express + Socket.io entry point
```

---

## API Endpoints

Full API documentation is available in `docs/groovist_api_documentation.pdf`.

### Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register new account |
| POST | `/api/users/login` | Login |
| POST | `/api/users/logout` | Logout |
| GET | `/api/users/me` | Get current user |
| GET | `/api/albums` | Browse albums |
| GET | `/api/albums/featured` | Get featured albums |
| GET | `/api/posts/feed` | Get social feed |
| POST | `/api/posts` | Create a post |
| GET | `/api/conversations` | Get conversations |
| POST | `/api/conversations/:id/messages` | Send a message |
| GET | `/api/discogs/search` | Search Discogs |
| POST | `/api/discogs/import` | Import from Discogs |

---

## Utility Scripts

Run from inside `recordllect_api/`:

```bash
# Match albums to Discogs IDs (run first)
node scripts/matchDiscogsIds.js

# Import album cover art
node scripts/importAlbumCovers.js

# Import track listings
node scripts/importAllTracks.js

# Generate test users (password: TestPass1!)
node scripts/generateTestUsers.js
```

---

## Authentication

JWT tokens are issued on login and stored in `httpOnly` cookies. All protected routes require the cookie to be present. The cookie is set with:

```javascript
{
  httpOnly: true,
  secure: true,        // HTTPS only
  sameSite: 'none',    // Cross-domain support
  maxAge: 7 days
}
```

---

## Security

- **Rate limiting** — Auth endpoints: 10 req/15min | Global: 100 req/15min
- **CORS** — Restricted to `groovist.co` in production
- **Helmet** — 11 security headers including CSP
- **XSS** — All request body strings sanitized
- **HPP** — HTTP parameter pollution prevention
- **Ownership** — Users can only edit their own resources
- **Trust Proxy** — Enabled for Railway deployment

---

## Real-time Events (Socket.io)

Users connect via a short-lived token from `/api/users/socket-token` and join a personal room `user_{id}`.

| Event | Direction | Payload |
|-------|-----------|---------|
| `notification` | Server → Client | New notification object |
| `new_message` | Server → Client | `{ message, conversation_id }` |
| `message_unread_count` | Server → Client | Trigger to refresh count |

---

## Deployment (Railway)

1. Create project at [railway.app](https://railway.app)
2. Add MySQL service
3. Add GitHub repo service — **must be in same project as MySQL**
4. Set environment variables (use `${{MySQL.MYSQLHOST}}` references)
5. Add `app.set('trust proxy', 1)` for rate limiting
6. Add custom domain `api.groovist.co` under Settings → Networking

See `docs/groovist_setup_guide.pdf` for detailed deployment instructions.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | MySQL hostname |
| `DB_PORT` | Yes | MySQL port |
| `DB_USER` | Yes | MySQL username |
| `DB_PASSWORD` | Yes | MySQL password |
| `DB_NAME` | Yes | Database name |
| `JWT_SECRET` | Yes | 64+ char secret for JWT signing |
| `PORT` | Yes | Server port (3001) |
| `NODE_ENV` | Yes | development or production |
| `CLIENT_URL` | Yes | Frontend URL for CORS |
| `DISCOGS_TOKEN` | Yes | Discogs personal access token |
| `RESEND_API_KEY` | Yes | Resend API key |
| `EMAIL_USER` | Yes | Sender email address |
| `ADMIN_EMAIL` | Yes | Admin notification recipient |

---

## License

Private — All rights reserved.
