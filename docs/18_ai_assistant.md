# AI ASSISTANT — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/AIAssistant.js`, `backend/routes/ai.py`, `backend/services/ai_service.py`, `backend/sql/seed_ai_menu.sql`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu AI Assistant menyediakan chatbot analitik bisnis berbasis LLM (OpenAI/Gemini) yang dapat menjawab pertanyaan natural language tentang penjualan, stok, karyawan, shift, dan performa bisnis. AI mengakses data via SQL query ke PostgreSQL dengan outlet scope enforcement.

---

## 2. Business Purpose

Memberikan insight bisnis cepat melalui pertanyaan natural language tanpa perlu membuka report manual.

---

## 3. Business Objective

- Menjawab pertanyaan bisnis dalam bahasa natural (Indonesia/English).
- Mengakses data penjualan, stok, karyawan, shift.
- Menghormati outlet scope user.
- Menyediakan analisa tren, top products, anomalies.
- Menyimpan history chat per user.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | TIDAK | Tidak ada menu AI Assistant |

Berdasarkan `seed_ai_menu.sql`: AI Assistant menu hanya untuk owner, admin, manager, supervisor.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- AI service menerima `outlet_ids` dari user context.
- SQL query yang di-generate di-inject dengan `WHERE outlet_id IN (...)` filter.
- Owner (`outlet_ids=[]`) → semua outlet.
- Non-owner → hanya outlet yang di-assign.

Sumber: `backend/services/ai_service.py`.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View AI Assistant | YA | YA | YA | YA | TIDAK |
| Chat | YA | YA | YA | YA | TIDAK |
| View History | YA | YA | YA | YA | TIDAK |

Backend: `get_current_user` untuk semua endpoint.

---

## 7. Business Flow

```
MANAGER BUKA MENU AI ASSISTANT
 ↓
LIHAT CHAT HISTORY
 ↓
KETIK PERTANYAAN (natural language)
 ↓
KIRIM
 ↓
AI SERVICE:
 ├── BUILD CONTEXT (outlet_ids, user role)
 ├── GENERATE SQL (LLM)
 ├── EXECUTE SQL (dengan outlet filter)
 ├── FORMAT RESPONSE (LLM)
 └── RETURN ANSWER
 ↓
TAMPILKAN JAWABAN
 ↓
SIMPAN KE HISTORY
```

---

## 8. Detailed Business Rules

1. AI menggunakan LLM (OpenAI/Gemini) untuk generate SQL dari natural language.
2. SQL di-execute dengan outlet scope enforcement.
3. Hasil SQL diformat menjadi jawaban natural language oleh LLM.
4. Chat history disimpan per user.
5. AI dapat query: sales, products, stock, employees, shifts, attendance.
6. AI menghormati outlet scope — non-owner tidak bisa akses outlet lain.
7. System prompt menginstruksikan LLM untuk hanya query data yang diizinkan.

---

## 9. State / Status

AI Assistant tidak memiliki state machine. Chat adalah stateless per message (kecuali history).

---

## 10. Technical Architecture

```
Browser → React (AIAssistant.js) → API → FastAPI (ai.py) → AI Service (ai_service.py) → LLM API (OpenAI/Gemini) + PostgreSQL → Response → UI
```

---

## 11. Technical Flow

### Chat
1. `AIAssistant.js` → user ketik pertanyaan → `POST /api/ai/chat` dengan `{ message, history }`.
2. Backend `chat` (ai.py):
   - Load user context (outlet_ids, role).
   - Build system prompt dengan schema info + outlet scope.
   - Call LLM untuk generate SQL.
   - Execute SQL dengan outlet filter.
   - Call LLM untuk format response dari query result.
   - Save to chat history.
3. Response → frontend display.

### History
1. `GET /api/ai/history` → chat history per user.

---

## 12. Frontend

**File:** `frontend/src/pages/AIAssistant.js`

| Elemen | Detail |
|--------|--------|
| Context | `useAuth()` (`user`), `useOutlet()` (`outletIdForApi`) |
| API Calls | `POST /ai/chat`, `GET /ai/history` |
| State | `messages`, `input`, `loading`, `history` |
| UI | Chat interface (message list, input box, send button), suggested questions, history sidebar |

---

## 13. Backend

**File:** `backend/routes/ai.py`

| Endpoint | Method | Function | Auth |
|----------|--------|----------|------|
| `/api/ai/chat` | POST | `chat` | `get_current_user` |
| `/api/ai/history` | GET | `get_history` | `get_current_user` |

**File:** `backend/services/ai_service.py`

| Function | Purpose |
|----------|---------|
| `process_query` | Main entry — generate SQL, execute, format response |
| `_build_system_prompt` | Build system prompt with schema + outlet scope |
| `_generate_sql` | Call LLM untuk generate SQL |
| `_execute_sql` | Execute SQL dengan outlet filter |
| `_format_response` | Call LLM untuk format natural language response |

---

## 14. API

```
POST /api/ai/chat { message, history }
GET /api/ai/history
```

---

## 15. Database

AI Assistant tidak memiliki table sendiri. Chat history disimpan di:
- NOT CONFIRMED FROM SOURCE — kemungkinan di `ai_chat_history` table atau di memory.

AI mengakses tables:
- `sales`, `products`, `outlet_stocks`, `users`, `shifts`, `attendance`, `outlets`, `categories`, `customers`, `expenses`.

---

## 16. Data Flow

```
USER MESSAGE (natural language)
 ↓
POST /ai/chat
 ↓
AI SERVICE: build context (outlet_ids, role)
 ↓
LLM: generate SQL
 ↓
EXECUTE SQL (with outlet filter)
 ↓
LLM: format response
 ↓
SAVE HISTORY
 ↓
RESPONSE (natural language answer)
 ↓
UI DISPLAY
```

---

## 17. Validation

- User must be authenticated.
- Outlet scope enforced di SQL execution.
- SQL injection prevention: LLM di-instruct untuk hanya generate SELECT queries.

---

## 18. Calculation

AI dapat melakukan calculation via SQL aggregation (SUM, AVG, COUNT, dll).

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| AI Chat | `ai_chat` | NOT CONFIRMED — history disimpan tapi audit log tidak terlihat eksplisit |

---

## 20. Reports

AI Assistant adalah alternative interface untuk Reports — dapat menjawab pertanyaan yang sama dengan report manual.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| LLM API | OpenAI/Gemini untuk generate SQL & format response |
| PostgreSQL | Source data |
| Sales | Query penjualan |
| Products | Query produk & stok |
| Users | Query karyawan |
| Shifts | Query shift |
| Attendance | Query absensi |
| Outlets | Outlet scope |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| LLM API error | 500 | Error message |
| SQL error | 500 | Error message |
| No API key | 500 | "AI service not configured" |
| Unauthorized | 401 | Redirect ke login |

---

## 23. Edge Cases

- Pertanyaan di luar scope bisnis → AI menjawab di luar konteks atau menolak.
- SQL yang di-generate berbahaya (DROP/DELETE) → dicegah oleh system prompt (SELECT only).
- Outlet scope bypass → dicegah oleh SQL filter injection.
- LLM hallucination → AI dapat memberikan jawaban yang tidak akurat.
- API key tidak ada → fallback error.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | `get_current_user` saja |
| Outlet Enforcement | YA — SQL filter injection |
| SQL Injection | POTENTIAL RISK — LLM generate SQL, mitigasi via system prompt + SELECT only |
| API Key | Disimpan di env variable |
| Data Leakage | Outlet scope enforced |

---

## 25. QA / Test Cases

```
TC-AI-001: Ask about sales
Given: Manager dengan data penjualan
When: "Berapa total penjualan hari ini?"
Then: AI return total penjualan untuk outlet yang di-assign

TC-AI-002: Ask about top products
Given: Data penjualan
When: "Produk terlaris minggu ini?"
Then: AI return top products

TC-AI-003: Outlet scope
Given: Manager outlet A
When: "Penjualan outlet B?"
Then: AI tidak dapat akses data outlet B

TC-AI-004: Out of scope
Given: Manager
When: "Cuaca hari ini?"
Then: AI menolak atau menjawab di luar konteks
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

AI chat, history, outlet scope enforcement berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| AI-F-01 | MEDIUM | LLM-generated SQL berpotensi SQL injection jika system prompt tidak cukup restriktif |
| AI-F-02 | MEDIUM | LLM hallucination — AI dapat memberikan jawaban tidak akurat |
| AI-F-03 | LOW | API key fallback tidak ada — jika env tidak set, AI error |
| AI-F-04 | LOW | Audit logging untuk AI chat tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Voice input | Tidak ada voice input |
| Chart visualization | AI return text, tidak ada chart |
| Export AI report | Tidak ada export hasil AI |
| Multi-turn context | NOT CONFIRMED — kemungkinan terbatas |

---

## 29. Dependency Map

```
AI Assistant
 ├── LLM API (OpenAI/Gemini)
 ├── PostgreSQL (source data)
 ├── Sales (query)
 ├── Products (query)
 ├── Users (query)
 ├── Shifts (query)
 ├── Attendance (query)
 ├── Outlets (scope)
 └── Reports (alternative interface)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU AI ASSISTANT
 ↓
LOAD HISTORY (GET /ai/history)
 ↓
KETIK PERTANYAAN
 ↓
POST /ai/chat { message, history }
 ↓
AI SERVICE:
 ├── BUILD CONTEXT (outlet_ids, role, schema)
 ├── LLM: generate SQL
 ├── EXECUTE SQL (outlet filter)
 ├── LLM: format response
 └── SAVE HISTORY
 ↓
RESPONSE (natural language)
 ↓
UI DISPLAY
```
