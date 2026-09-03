# Security Documentation — Republik Dimsum Imperium POS

## Architecture

### Authentication Flow

```
User submits email + password
        ↓
Backend validates credentials
        ↓
┌─ If role is owner/admin ──────────────────────────────┐
│  ↓                                                     │
│  Is MFA enabled?                                       │
│  ├─ Yes → Return MFA challenge token (5 min expiry)   │
│  │         ↓                                           │
│  │   User submits TOTP code                            │
│  │         ↓                                           │
│  │   Backend verifies TOTP                             │
│  │         ↓                                           │
│  │   Set HttpOnly access_token cookie (12h expiry)     │
│  │         ↓                                           │
│  │   Return user data (NO token in body)               │
│  │                                                     │
│  └─ No  → Return MFA setup challenge                   │
│           ↓                                            │
│      User scans QR, submits first TOTP code            │
│           ↓                                            │
│      Backend saves secret, enables MFA                 │
│           ↓                                            │
│      Set HttpOnly access_token cookie                  │
└────────────────────────────────────────────────────────┘
┌─ If role is kasir/manager/supervisor ─────────────────┐
│  ↓                                                     │
│  Set HttpOnly access_token cookie (12h expiry)         │
│  Return user data (NO token in body)                   │
└────────────────────────────────────────────────────────┘
```

### Security Controls

| Control | Implementation |
|---------|---------------|
| **Token Storage** | HttpOnly cookie only — no localStorage, no sessionStorage |
| **Cookie Flags** | `HttpOnly=True`, `SameSite=Lax`, `Secure` (conditional on HTTPS) |
| **CSRF Protection** | SameSite=Lax cookie + Origin/Referer validation middleware |
| **Brute Force** | 5 attempts max, 15-minute lockout per email |
| **MFA** | TOTP (RFC 6238) required for owner/admin roles |
| **Rate Limiting** | In-process per-email tracking with TTL |
| **CORS** | Explicit origin allow-list, no wildcards |
| **Security Headers** | CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| **Input Validation** | Pydantic models + server-side price/discount/tax validation |
| **File Upload** | Magic-byte validation, no SVG, UUID filenames, 5MB limit |
| **Error Handling** | Global exception handler, no stack trace leakage |
| **API Docs** | Disabled in production (DEBUG=false) |
| **Docker** | Non-root containers, multi-stage builds, no build tools in runtime |
| **Database** | Not exposed to host network, internal Docker network only |
| **Backend Port** | Bound to 127.0.0.1 only, traffic via Nginx |

## Environment Variables

### Required (production will fail without these)

```env
JWT_SECRET=<64+ char random string>
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<strong password>
POSTGRES_USER=<db user>
POSTGRES_PASSWORD=<db password>
POSTGRES_DB=<db name>
POSTGRES_URL=postgresql://<user>:<pass>@postgres:5432/<db>
```

### Optional

```env
DEBUG=false                    # Set to true for dev mode (enables docs, demo kasir)
ENVIRONMENT=production         # production | development
COOKIE_SECURE=false            # Set to true for HTTPS deployments
CORS_ORIGINS=http://localhost  # Comma-separated allowed origins
LOGIN_MAX_ATTEMPTS=5           # Brute force lockout threshold
LOGIN_LOCK_MINUTES=15          # Lockout duration
MFA_ISSUER=Republik Dimsum POS # TOTP issuer label
MIDTRANS_SERVER_KEY=           # Midtrans API key for QRIS
MIDTRANS_BASE_URL=             # Midtrans API base URL
```

## MFA Setup

### For Owner/Admin (first login)

1. Enter email and password
2. System detects MFA setup required
3. Scan QR code with Google Authenticator, Authy, or any TOTP app
4. Enter 6-digit code to verify and enable MFA
5. Access token cookie is set — you are logged in

### For Owner/Admin (subsequent logins)

1. Enter email and password
2. Enter 6-digit TOTP code
3. Access token cookie is set — you are logged in

### MFA Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Returns `mfa_required: true` if MFA needed |
| `/api/auth/mfa/setup` | POST | Generate new TOTP secret (requires MFA challenge token) |
| `/api/auth/mfa/enable` | POST | Verify code and enable MFA (requires MFA challenge token) |
| `/api/auth/mfa/verify` | POST | Verify TOTP code and set access token cookie |
| `/api/auth/mfa/status` | GET | Check MFA status for current user |

## Security Deployment Checklist

```
[ ] Production secrets configured (JWT_SECRET, ADMIN_PASSWORD)
[ ] No default password in use
[ ] No fallback JWT secret
[ ] HTTPS enabled (set COOKIE_SECURE=true)
[ ] HttpOnly cookie enabled (automatic)
[ ] Secure cookie enabled (COOKIE_SECURE=true for HTTPS)
[ ] SameSite=Lax configured (automatic)
[ ] CSRF protection enabled (automatic — Origin validation)
[ ] Rate limiting enabled (automatic — 5 attempts / 15 min lockout)
[ ] MFA owner/admin enabled (automatic — setup on first login)
[ ] PostgreSQL not public (port not exposed in docker-compose)
[ ] Nginx security headers enabled (automatic)
[ ] Containers non-root (automatic — appuser in backend)
[ ] Docker images scanned (manual — run `docker scout` or similar)
[ ] Dependencies scanned (manual — run `pip audit` or similar)
[ ] Backup encrypted (manual — configure PostgreSQL backup encryption)
[ ] Restore tested (manual — verify backup restoration)
[ ] Audit logging enabled (automatic — all sensitive actions logged)
[ ] Sensitive logging disabled (no tokens/passwords in logs)
[ ] Production data separated (use separate .env for production)
[ ] API docs disabled in production (automatic — DEBUG=false)
```

## Penetration Test Scenarios

### Authentication

| Scenario | Expected | Verified |
|----------|----------|----------|
| Login without credentials | 401 | ✅ |
| Login with wrong password | 401 | ✅ |
| 5 failed logins → lockout | 429 | ✅ |
| Login with expired JWT | 401 | ✅ |
| Login with invalid JWT | 401 | ✅ |
| Bearer header (no cookie) | 401 | ✅ |
| MFA challenge token as access | 401 | ✅ |
| Wrong MFA code | 401 | ✅ |

### Authorization

| Scenario | Expected | Verified |
|----------|----------|----------|
| Kasir → GET /menus | 403 | ✅ |
| Kasir → GET /roles/permission-tree | 403 | ✅ |
| Kasir → GET /menus/my-menus | 200 | ✅ |
| Kasir → other outlet's stock | 403 | ✅ |
| Owner → GET /menus | 200 | ✅ |

### CSRF

| Scenario | Expected | Verified |
|----------|----------|----------|
| POST with wrong Origin | 403 | ✅ |
| POST with valid Origin | accepted | ✅ |

### Input Validation

| Scenario | Expected | Verified |
|----------|----------|----------|
| Negative discount | 400 | ✅ |
| Discount > subtotal | 400 | ✅ |
| Negative tax | 400 | ✅ |

### File Upload

| Scenario | Expected | Verified |
|----------|----------|----------|
| SVG upload (XSS risk) | 400 | ✅ |
| Spoofed content-type | 400 | ✅ |

### Second-Pass Findings

| Scenario | Expected | Verified |
|----------|----------|----------|
| Kasir void sale | 403 | ✅ |
| /loyalty/tiers without auth | 401 | ✅ |
| Create payment account in other outlet | 403 | ✅ |
| Create table in other outlet | 403 | ✅ |
| List online orders from other outlet | 403 | ✅ |
| User change own role | 403 | ✅ |
| Negative quantity in sale | 422 | ✅ |
| QRIS error leaks gateway response | No | ✅ |

### Info Disclosure

| Scenario | Expected | Verified |
|----------|----------|----------|
| GET /docs in production | 404 | ✅ |
| GET /redoc in production | 404 | ✅ |
| GET /openapi.json in production | 404 | ✅ |
| Unhandled exception | 500 (no stack trace) | ✅ |
| QRIS error message | Generic (no gateway details) | ✅ |
| Console.error in Tables.js | No order/payment data leaked | ✅ |
