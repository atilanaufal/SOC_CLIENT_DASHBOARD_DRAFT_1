# ASOC Client Dashboard

Production-grade Next.js Client Security Operations Center (SOC) Dashboard for real-time security incident monitoring, vulnerability tracking, device inventory, and automated reporting.

---

## Architecture & Core Tech Stack

- **Framework**: Next.js 15 (App Router, Standalone Output) + React 19 + TypeScript 5
- **Styling**: Tailwind CSS + Glassmorphism UI Components
- **Databases**:
  - **MySQL 8.0**: Multi-tenant authentication, user mapping, role-based access control (RBAC).
  - **Redis 7**: Hot cache, rate limiting, and authoritative server-side session store.
  - **MongoDB**: Incident records, audit logs, and security telemetry storage.
- **Cryptography & Security**:
  - **WebAssembly Argon2id**: Accelerated password verification via `hash-wasm` with `@noble/hashes` pure-JS fallback.
  - **Node.js Threadpool**: `UV_THREADPOOL_SIZE=16` configured for non-blocking cryptographic execution.
  - **B-Tree Database Indexing**: `idx_name` and virtual `idx_username` on `users` table for instant `<1ms` user lookups.
  - **Single Active Session**: Anti-concurrent login mechanism enforcing one browser session per account via Redis session binding.

---

## Authentication & Security Invariants

### 1. High-Performance Master User Authentication
- **Lookup Optimization**: User lookup queries MySQL `users` table utilizing dedicated B-Tree indexes (`idx_username` on virtual column `username` and `idx_name` on `name`).
- **In-Memory Schema Caching**: Table column metadata is cached in-memory with a 5-minute TTL, eliminating redundant `DESCRIBE users` database queries per login attempt.
- **Argon2id Password Verification**:
  - Uses `hash-wasm` (compiled WebAssembly) to execute Argon2id verification in ~500ms without blocking the Node.js event loop (compared to ~2.2s under pure JavaScript).
  - Supports all standard Argon2 parameter combinations stored in the database (`$argon2id$v=19$m=65536,t=3,p=4$`).
  - Constant-time dummy verification leverages OWASP/RFC 9106 balanced parameters (`m=19456, t=2, p=1`) executing in ~120ms to prevent username enumeration timing attacks with minimal CPU overhead.

### 2. Single Active Session Enforcement
- **Anti-Concurrent Login**: When an account logs in from a new browser, any existing session for that user is immediately revoked in Redis (`bindUserActiveSession`).
- **Active Heartbeat & Kickout**: Client-side layout ping (`Header.tsx`) checks session validity every 10 seconds. Terminated sessions are redirected to `/login?concurrent=1` displaying an informative session termination banner.

### 3. Dual-Bucket Rate Limiting
- **IP Bucket**: Limits failed requests per client IP address (30 attempts / 15 minutes).
- **User Bucket**: Limits failed attempts per username (10 attempts / 15 minutes).
- Returns HTTP 429 with standard `Retry-After` header when triggered.

---

## Environment Configuration

Configure the following environment variables in `.env.production` or `.env.local`:

```bash
# Node Environment & Thread Pool
NODE_ENV=production
PORT=3000
UV_THREADPOOL_SIZE=16

# Security Secret
BETTER_AUTH_SECRET=your_32_byte_random_secret_here

# Application Base URL
NEXT_PUBLIC_APP_URL=https://dashboard.example.com

# MySQL Authentication Database
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=auth_db
MYSQL_USER=tenant_app
MYSQL_PASSWORD=your_mysql_password
MYSQL_SALT=sec_auth_salt_2026

# Redis Hot Cache & Session Store
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

---

## Database Schema Requirements (MySQL)

Ensure the `users` table in `auth_db` includes the necessary B-Tree indexes:

```sql
-- Ensure index on name column
ALTER TABLE users ADD INDEX idx_name (name);

-- Ensure virtual generated username column and index for unified lookup
ALTER TABLE users ADD COLUMN username VARCHAR(191) GENERATED ALWAYS AS (name) VIRTUAL, ADD INDEX idx_username (username);
```

---

## Development & Deployment

### Local Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Docker Deployment
```bash
docker compose build
docker compose up -d
```
