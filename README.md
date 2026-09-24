# ReachInbox | Full-Stack Email Job Scheduler

[![CI Pipeline](https://github.com/reachinbox/email-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/reachinbox/email-scheduler/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.7-red.svg)](https://bullmq.io/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)](https://www.mysql.com/)
[![Redis](https://img.shields.io/badge/Redis-7.2-crimson.svg)](https://redis.io/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.13-yellow.svg)](https://www.elastic.co/)

A production-grade, distributed cold email scheduling platform engineered for high throughput, strict per-sender throttling, persistent BullMQ delayed queue orchestration, atomic Redis Lua rate limiting, transactional outbox reliability, and real-time OAuth integrations.

Built for the **Outbox Labs / ReachInbox** Software Development assignment.

---

## 🏛️ System Architecture

```text
                             ┌──────────────────────────────────────┐
                             │       React 18 + TypeScript          │
                             │       Tailwind CSS + shadcn/ui       │
                             └──────────────────┬───────────────────┘
                                                │ HTTPS / Cookies
                                                ▼
                             ┌──────────────────────────────────────┐
                             │       Express API (TypeScript)       │
                             │  - Auth & Session Middleware         │
                             │  - CSV Validator & Normalizer        │
                             │  - Campaign & Sender Controllers     │
                             │  - Health Checks & Bull Board UI     │
                             └──────────┬────────────────┬──────────┘
                                        │                │
                        Prisma / SQL TX │                │ Atomic Lua & Queue
                                        ▼                ▼
                 ┌─────────────────────────────┐  ┌─────────────────────────────┐
                 │       MySQL 8.0             │  │        Redis 7.2            │
                 │  - users                    │  │  - BullMQ Delayed Queues    │
                 │  - senders (encrypted creds)│  │  - rate:v1:{sender}:state   │
                 │  - campaigns                │  │  - rate:v1:{sender}:hours   │
                 │  - emails & email_attempts  │  │  - rate:v1:{sender}:resv    │
                 │  - outbox_events            │  │  - session:v1:{sessionId}   │
                 │  - idempotency_keys         │  │  - AOF Persistence Enabled  │
                 └──────────────┬──────────────┘  └──────────────┬──────────────┘
                                │                                │
                        Polling Outbox Fallback                  │ Job Consumption
                                │                                │
                                └───────────────┬────────────────┘
                                                ▼
                             ┌──────────────────────────────────────┐
                             │        Worker Process                │
                             │  ┌────────────────────────────────┐  │
                             │  │ Outbox Dispatcher Worker       │  │
                             │  │ - Recovers pending DB events   │  │
                             │  │ - Pushes to BullMQ atomically  │  │
                             │  └────────────────────────────────┘  │
                             │  ┌────────────────────────────────┐  │
                             │  │ Email Send Worker (Concurrency)│  │
                             │  │ - Claims DB status atomically  │  │
                             │  │ - Sends via Ethereal SMTP      │  │
                             │  │ - Records EmailAttempt audit   │  │
                             │  │ - Enqueues Indexing & Slack    │  │
                             │  └────────────────────────────────┘  │
                             │  ┌────────────────────────────────┐  │
                             │  │ Slack Notification Worker      │  │
                             │  │ - Sends rate limit hit webhooks│  │
                             │  └────────────────────────────────┘  │
                             │  ┌────────────────────────────────┐  │
                             │  │ Elasticsearch Index Worker     │  │
                             │  │ - Updates search projection    │  │
                             │  └────────────────────────────────┘  │
                             └──────────┬──────────────────┬────────┘
                                        │                  │
                                        ▼                  ▼
                         ┌───────────────────────┐  ┌───────────────────────┐
                         │  Ethereal SMTP Server │  │  Elasticsearch 8.x    │
                         │  (Fake SMTP Provider) │  │  reachinbox-emails-v1 │
                         └───────────────────────┘  └───────────────────────┘
```

---

## ⚡ Core Technical Principles

1. **MySQL 8 = Authoritative Source of Truth**: All campaigns, lead rows, attempts, senders, and outbox events reside in MySQL.
2. **Redis 7 = Transient State & Queues**: Hosts BullMQ delayed queues, atomic rate-limiting counters, and session storage. Uses AOF persistence (`appendonly yes`, `appendfsync everysec`).
3. **No Cron / In-Memory Timers**: Long-term timers (`setTimeout`/`setInterval`) or cron libraries (`node-cron`, `agenda`) are strictly forbidden. All scheduling relies on BullMQ persistent delayed jobs.
4. **Elasticsearch 8 = Read Projection Only**: Search queries run against `reachinbox-emails-v1`. Elasticsearch cluster downtime never halts email dispatching.
5. **Transactional Outbox Pattern**: Ingestion writes the campaign, email rows, and outbox event in a single atomic database transaction. If the API process dies before queue insertion, the outbox worker completes dispatch.
6. **Multi-Worker Concurrency Control**: Workers claim scheduled emails via an atomic conditional SQL update:
   ```sql
   UPDATE emails
   SET status = 'SENDING', locked_at = NOW(3), locked_by = :workerId
   WHERE id = :emailId AND status = 'SCHEDULED';
   ```
   Ensuring zero duplicate sends across concurrent worker instances.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo** | `pnpm` workspaces (`apps/api`, `apps/worker`, `apps/web`, `packages/*`) |
| **Backend API** | Node.js 20 LTS, TypeScript 5.4, Express.js 4.19, Helmet, CORS |
| **Database & ORM** | MySQL 8.0, Prisma ORM 5.14 |
| **Queue & Scheduling** | BullMQ 5.7, ioredis 5.4, Bull Board Express |
| **Search Engine** | Elasticsearch 8.13 |
| **SMTP Delivery** | Nodemailer 6.9, Ethereal Email fake transport |
| **Frontend UI** | React 18, Vite 5, Tailwind CSS 3.4, Lucide Icons |
| **Authentication** | Google OAuth 2.0 / OpenID Connect, Redis session store |
| **Integrations** | Slack OAuth 2.0, Incoming Webhooks |
| **Testing** | Vitest 1.6, Supertest 6.3 |

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
* Node.js v20+
* Docker & Docker Compose
* `pnpm` (install with `npm install -g pnpm`)

### 2. Clone & Configure Environment
```bash
cp .env.example .env
```
Ensure `.env` contains valid credentials (or default test settings provided in `.env.example`).

### 3. Database & Cloud Services
The application is pre-configured to connect to Cloud MySQL (Aiven) and Cloud Redis:
```bash
# Push Prisma schema to your cloud database
npm run prisma:push
```

### 4. Running the Application

You have two simple options depending on whether you want to use the **Cloud Backend (Render)** or run everything **Locally**:

#### Option A: Develop Frontend Locally Connected to Render Backend (Recommended & Fastest)
Since your backend and BullMQ email worker are already live and running on Render:
1. Ensure `frontend/.env` contains:
   ```env
   VITE_API_URL=https://reachinbox-api-j1ae.onrender.com
   ```
2. Start only the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:3000` — all campaigns, email dispatches, and rate limiting will be processed by the live Render backend and its embedded BullMQ worker!

#### Option B: Full-Stack Local Development (Self-Hosted with Local Services)
If you want to run MySQL, Redis, API, and workers entirely offline on your machine:
```bash
# Generate Prisma Client
npm run prisma:generate

# Push schema to local MySQL
npm run prisma:push

# Start all three services concurrently (API, BullMQ Worker, Frontend)
npm run dev
```

Or run them in separate terminals:
```bash
# Terminal 1: Express REST API (Port 4000)
npm run dev:api

# Terminal 2: Distributed BullMQ Queue Worker
npm run dev:worker

# Terminal 3: ReachInbox Frontend (Port 3000)
npm run dev:frontend
```

---

## 🌐 Live Deployments & Cloud Architecture

| Service | Host / Platform | URL |
| :--- | :--- | :--- |
| **Frontend Web App** | GitHub Pages | [https://rajyyy22.github.io/email_scheduler/](https://rajyyy22.github.io/email_scheduler/) |
| **API Server & Embedded Worker** | Render Cloud | [https://reachinbox-api-j1ae.onrender.com](https://reachinbox-api-j1ae.onrender.com) |
| **Health Check Endpoint** | Render Cloud | [https://reachinbox-api-j1ae.onrender.com/health/ready](https://reachinbox-api-j1ae.onrender.com/health/ready) |
| **Bull Board Queue Dashboard** | Render Cloud | [https://reachinbox-api-j1ae.onrender.com/admin/queues](https://reachinbox-api-j1ae.onrender.com/admin/queues) |

> [!NOTE]
> The backend on Render automatically runs the embedded BullMQ email workers upon boot (via `startWorker({ standalone: false })` in `src/server.ts`). You do not need to host or run a separate worker process when using Render.

---

## 🔑 Environment Variables Reference

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | API server listening port | `4000` |
| `DATABASE_URL` | MySQL 8.0 connection string | `mysql://...` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `ELASTICSEARCH_URL`| Elasticsearch cluster URL | `http://localhost:9200` |
| `SESSION_SECRET` | 32+ character session signing secret | |
| `CREDENTIAL_ENCRYPTION_KEY` | 32-byte (64-char) hex key for AES-256-GCM | |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth Client ID | |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth Client Secret | |
| `GOOGLE_CALLBACK_URL` | Google OAuth redirect callback URL | `http://localhost:4000/api/v1/auth/google/callback` |
| `SLACK_CLIENT_ID` | Slack App Client ID | |
| `SLACK_CLIENT_SECRET` | Slack App Client Secret | |
| `SLACK_CALLBACK_URL` | Slack App redirect callback URL | `http://localhost:4000/api/v1/integrations/slack/callback` |
| `EMAIL_WORKER_CONCURRENCY` | Maximum concurrent email sends per worker instance | `20` |
| `DEFAULT_SENDER_HOURLY_LIMIT` | Fallback hourly limit for senders | `100` |
| `DEFAULT_MINIMUM_DELAY_MS` | Fallback delay between consecutive sends per sender | `2000` |

---

## ⏱️ Rate Limiting & Scheduling Algorithm

### Redis Lua Atomic Script
Rate limiting uses an atomic Lua script executed in Redis (`rate-limiter.lua`), referencing Redis server time (`redis.call('TIME')`).

All keys use hash tags `{senderId}` for cluster compatibility:
* `rate:v1:{senderId}:state`: Holds `nextAvailableMs`.
* `rate:v1:{senderId}:hours`: Tracks reservation counts per UTC hour window.
* `rate:v1:{senderId}:reservations`: Stores deterministic `reservationId` $\to$ `scheduledMs`.
* `rate:v1:{senderId}:notifications`: Tracks triggered Slack notification hours via a Redis SET.

### Example Walkthrough (5 Emails / Hour with 2s Minimum Delay)
1. **Email 1**: 10:00:00
2. **Email 2**: 10:00:02
3. **Email 3**: 10:00:04
4. **Email 4**: 10:00:06
5. **Email 5**: 10:00:08 (Sender hourly limit 5 reached -> flags Slack notification)
6. **Email 6**: 11:00:00 (Capacity exhausted -> candidate jumps to next hour window!)
7. **Email 7**: 11:00:02
No emails are dropped or rejected under load.

---

## 🔄 Crash & Restart Recovery

* **Worker Crash**: If a worker terminates mid-flight, a periodic liveness sweeper flags emails locked $> 5\text{m}$. Unsent emails are safely reset to `SCHEDULED` and re-queued.
* **Redis Restart**: Redis restarts using AOF (`appendonly yes`). BullMQ restores delayed job timers from sorted sets.
* **Process Crash during Scheduling**: The Outbox pattern ensures pending events are replayed without double-counting, because deterministic reservation IDs (`${emailId}-a1`) return cached schedule timestamps.

---

## 🧪 Testing

Run all unit, integration, and acceptance tests:
```bash
# Run unit tests
pnpm test:unit

# Run acceptance tests (All 10 required scenarios)
pnpm test
```

### Verified Acceptance Scenarios:
1. Schedule future email -> BullMQ delayed job -> delivery.
2. Worker restart preserves scheduled jobs without loss.
3. Burst emails respect $\ge 2\text{s}$ spacing.
4. Hourly limit overflow cascades to subsequent hours without dropping.
5. Multi-worker concurrency with conditional atomic claim.
6. Repeated campaign submission with `Idempotency-Key` returns original result.
7. Duplicate reservation IDs avoid double-counting.
8. Sender hourly limit hit fires exactly one Slack notification.
9. Disconnected Slack handles limit breach gracefully.
10. Elasticsearch downtime does not block email dispatching.

---

## 📹 5-Minute Demo Video Walkthrough Guide

1. **Minute 0:00 - 0:45**: Architecture tour, Docker services, Google OAuth login.
2. **Minute 0:45 - 1:45**: Compose modal, CSV lead upload, instant lead validation, Scheduling Timeline Preview showing hour overflow.
3. **Minute 1:45 - 2:45**: Bull Board delayed jobs visualization, live Slack rate-limit webhook notification.
4. **Minute 2:45 - 3:45**: Worker container kill (`docker stop reachinbox_worker`) and restart resilience demo.
5. **Minute 3:45 - 5:00**: Sent emails table, Ethereal fake SMTP preview link, and debounced Elasticsearch search.

---

## ⚖️ Assumptions & Trade-offs

1. **SMTP Exactly-Once Boundary**: External SMTP delivery across TCP network partitions cannot be guaranteed mathematically exactly-once. We enforce conditional DB status transitions and deterministic IDs, marking ambiguous socket drops as `UNKNOWN` rather than blindly retrying.
2. **Elasticsearch Eventual Consistency**: Search index experiences an asynchronous 100–500ms projection lag so that email dispatching is never blocked by search availability.
3. **Redis Hash Tags**: Uses `{senderId}` hash tags to guarantee atomic multi-key Lua execution in both standalone Redis and clustered environments.
