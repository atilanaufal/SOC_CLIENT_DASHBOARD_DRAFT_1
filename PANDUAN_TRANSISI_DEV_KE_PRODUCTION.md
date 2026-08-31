# 📘 PANDUAN KOMPREHENSIF: TRANSISI DARI DEVELOPMENT KE PRODUCTION
**Sistem:** SOC Multi-Tenant Client Dashboard  
**Teknologi:** Next.js 15 (App Router), React 19, Better Auth, MySQL, MongoDB, Redis, Wazuh API, DFIR-IRIS  
**Target Pembaca:** DevOps Engineer, Fullstack Developer, Security Administrator  
**Status Sistem:** Production-Ready (Zero Mock Data, Zero Hardcoding, Query-Only Architecture)

---

## 📑 DAFTAR ISI
1. [Prinsip & Perbedaan Arsitektur (Dev vs Prod)](#1-prinsip--perbedaan-arsitektur-dev-vs-prod)
2. [Langkah 1: Pengerasan Keamanan (Security Hardening)](#2-langkah-1-pengerasan-keamanan-security-hardening)
3. [Langkah 2: Standarisasi Manajemen Environment Variables](#3-langkah-2-standarisasi-manajemen-environment-variables)
4. [Langkah 3: Konfigurasi & Isolasi Database Multi-Tenancy](#4-langkah-3-konfigurasi--isolasi-database-multi-tenancy)
5. [Langkah 4: Optimasi Kompilasi & Standalone Build Next.js](#5-langkah-4-optimasi-kompilasi--standalone-build-nextjs)
6. [Langkah 5: Pengaturan Transport Security & TLS/SSL](#6-langkah-5-pengaturan-transport-security--tlsssl)
7. [Langkah 6: Pre-Flight Checklist Kesiapan Produksi](#7-langkah-6-pre-flight-checklist-kesiapan-produksi)

---

## 1. Prinsip & Perbedaan Arsitektur (Dev vs Prod)

Aplikasi Dashboard ini beroperasi dengan prinsip **Query-Only & Display** untuk menyajikan visibilitas keamanan bagi setiap tenant. Seluruh proses *ingestion*, sinkronisasi log dari Wazuh/OpenSearch/DFIR-IRIS, dan pengelolaan *TTL/caching* dijalankan secara independen oleh *background services* di infrastruktur backend.

```
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│       DEVELOPMENT ENVIRONMENT        │        │        PRODUCTION ENVIRONMENT        │
├──────────────────────────────────────┤        ├──────────────────────────────────────┤
│ • Hot Module Replacement (HMR) Aktif │        │ • AOT Pre-compiled Standalone Bundle │
│ • Verbose Error & Full Stack Traces  │        │ • Sanitized Generic Error Messages   │
│ • Mock Data & Debugger Modals        │  ───►  │ • Zero Mock Data (Strict DB Query)   │
│ • In-App Manual Sync Endpoints       │        │ • External Automated VM Ingestion    │
│ • Single-Process Node Server         │        │ • Multi-Core Cluster / Containerized │
│ • Plain HTTP & Relaxed CORS/CSP      │        │ • HTTPS Strict, HSTS, CSP, Anti-XSS  │
│ • No Rate Limiting (Bebas Request)   │        │ • Redis/IP-based Brute-Force Limiter │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

---

## 2. Langkah 1: Pengerasan Keamanan (Security Hardening)

Seluruh komponen mock, debugger, dan hardcoding telah dibersihkan secara permanen:

### A. Isolasi Multi-Tenancy Dinamis & Validasi Sesi Kriptografis
* **Prinsip Utama:** Tidak ada nama tenant, database, ataupun prefix Redis yang di-hardcode ke dalam kode sumber.
* **Implementasi:**
  * File [`lib/tenant-context.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/lib/tenant-context.ts) mengautentikasi sesi asinkron ke Better Auth (`auth.api.getSession`).
  * Informasi tenant (`databaseName`, `redisPrefix`, `campusName`, `tenantCode`) diekstrak murni dari relasi database MySQL `users` & `tenants`.
  * Jika sesi tidak sah atau pengguna tidak terhubung ke tenant mana pun, sistem **menolak request dengan status HTTP 401 Unauthorized** tanpa fallback default apa pun.

### B. Proteksi Brute-Force Rate Limiting pada Login
* Modul [`lib/rate-limit.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/lib/rate-limit.ts) menggunakan Redis sebagai sliding-window limiter (dengan fallback in-memory map + auto cleanup).
* Endpoint [`app/api/auth/login/route.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/app/api/auth/login/route.ts) membatasi maksimal **5 percobaan login gagal per 15 menit** per kombinasi IP address dan username.

### C. Keamanan Password Hashing (Bcrypt)
* File [`lib/mysql.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/lib/mysql.ts) menggunakan `bcryptjs` (`bcrypt.compare`) untuk seluruh akun tenant.
* Komparasi password plaintext telah **dihapus total**.

### D. Eliminasi Total Mock Data, Debug Modal, & Hardcoding
* Seluruh mock data (`mock-data.ts`), manual sync script (`redis-sync.ts`), dan modal debug status database telah dihapus.
* Frontend dan backend dashboard murni menjalankan pembacaan (*query*) data tenant dari Redis dan MongoDB Master melalui [`lib/data-service.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/lib/data-service.ts).

---

## 3. Langkah 2: Standarisasi Manajemen Environment Variables

Gunakan berkas template [`.env.example`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/.env.example) sebagai acuan di server produksi.

### Daftar Environment Variables Wajib

| Kategori | Nama Variabel | Wajib? | Deskripsi & Contoh Nilai |
| :--- | :--- | :--- | :--- |
| **System** | `NODE_ENV` | Ya | `production` |
| **System** | `PORT` | Ya | `3000` |
| **Auth** | `BETTER_AUTH_SECRET` | Ya | String acak 32-64 byte (`openssl rand -base64 32`) |
| **Auth** | `BETTER_AUTH_URL` | Ya | `https://dashboard.domainanda.com` |
| **Frontend**| `NEXT_PUBLIC_APP_URL` | Ya | `https://dashboard.domainanda.com` |
| **MySQL** | `MYSQL_HOST` | Ya | Host server MySQL (misal: `127.0.0.1`) |
| **MySQL** | `MYSQL_PORT` | Ya | `3306` |
| **MySQL** | `MYSQL_DATABASE` | Ya | `auth_db` |
| **MySQL** | `MYSQL_USER` | Ya | Username MySQL dengan hak akses SELECT pada `tenants` & `users` |
| **MySQL** | `MYSQL_PASSWORD` | Ya | Password user MySQL |
| **Redis** | `REDIS_HOST` | Ya | Host Redis (misal: `127.0.0.1`) |
| **Redis** | `REDIS_PORT` | Ya | `6379` |
| **Redis** | `REDIS_PASSWORD` | Opsional | Password autentikasi Redis (`requirepass`) |
| **MongoDB**| `MONGODB_URI` | Ya | `mongodb://user:pass@127.0.0.1:27017/?authSource=admin` |
| **Wazuh** | `WAZUH_API_URL` | Ya | `https://127.0.0.1:55000` |
| **Wazuh** | `WAZUH_API_USER` | Ya | Akun API Wazuh |
| **Wazuh** | `WAZUH_API_PASSWORD` | Ya | Password akun API Wazuh |
| **Wazuh** | `WAZUH_API_CA_PATH` | Opsional | Path absolut ke file `root-ca.pem` Wazuh jika menggunakan internal CA |

---

## 4. Langkah 3: Konfigurasi & Isolasi Database Multi-Tenancy

### A. Database MySQL (`auth_db`)
Pastikan tabel `tenants` dan `users` telah memiliki skema dinamis per tenant:
```sql
-- Indeks performa untuk autentikasi cepat
ALTER TABLE users ADD INDEX idx_username (username);
ALTER TABLE tenants ADD INDEX idx_tenant_id (tenant_id);
```

### B. Database MongoDB (Historic Master)
Setiap tenant memiliki database fisik tersendiri yang didaftarkan di tabel MySQL `tenants.database_name` (misal: `tenant_db_alpha`). Buat indeks performa pada koleksi utama masing-masing database tenant:
```javascript
// Di mongo shell / mongosh:
use <nama_database_tenant>;

db.incident.createIndex({ "last_observed": -1, "severity": 1 });
db.incident.createIndex({ "host": 1 });
db.incident.createIndex({ "rule_id": 1 });

db.vulnerabilities.createIndex({ "detected_at": -1, "severity": 1 });
db.reports.createIndex({ "date_generated": -1 });
```

---

## 5. Langkah 4: Optimasi Kompilasi & Standalone Build Next.js

Aplikasi telah dikonfigurasi dengan mode **Standalone Output** di [`next.config.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/next.config.ts):

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
};
```

---

## 6. Langkah 5: Pengaturan Transport Security & TLS/SSL

### A. Wazuh Scoped TLS Agent
Pada [`lib/wazuh-api.ts`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/lib/wazuh-api.ts), sistem menggunakan `https.Agent` dengan validasi sertifikat CA yang terisolasi.

### B. HTTP Security Headers
Setiap respon HTTP dari Next.js telah diinjeksi header keamanan standar OWASP:
* **`Strict-Transport-Security`** (HSTS)
* **`X-Frame-Options: DENY`** (Anti-Clickjacking)
* **`X-Content-Type-Options: nosniff`**
* **`Referrer-Policy: strict-origin-when-cross-origin`**
* **`Content-Security-Policy`** & **`Permissions-Policy`**

---

## 7. Langkah 6: Pre-Flight Checklist Kesiapan Produksi

| No | Komponen Pemeriksaan | Status Verifikasi | Keterangan |
| :---: | :--- | :---: | :--- |
| 1 | **Build Verification** (`npm run build`) | ✅ LULUS | 0 error TypeScript, 0 syntax error, seluruh route terkompilasi. |
| 2 | **Zero Mock Data** | ✅ BERSIH | Seluruh mock-data dan dummy arrays telah dihapus total. |
| 3 | **Zero Hardcoding Tenant/IP** | ✅ LULUS | 100% tenant name & IP di-resolve secara dinamis dari DB & ENV. |
| 4 | **Brute-Force Rate Limiting** | ✅ AKTIF | 5 percobaan login gagal per 15 menit per user/IP. |
| 5 | **Bcrypt Password Hash** | ✅ AKTIF | Mendukung salt `$2a$`, `$2b$`, `$2y$`, plaintext matching dinonaktifkan. |
| 6 | **HTTP Security Headers** | ✅ AKTIF | HSTS, X-Frame-Options, CSP, nosniff aktif di `next.config.ts`. |
| 7 | **Artefak Deployment Lengkap** | ✅ LENGKAP | `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js`, `nginx.conf`. |

---
*Lanjutkan ke dokumen operasional: **[`PANDUAN_MENJALANKAN_SERVER_PRODUCTION.md`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/PANDUAN_MENJALANKAN_SERVER_PRODUCTION.md)** untuk petunjuk langkah demi langkah menjalankan server.*
