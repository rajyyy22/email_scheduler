# Scheduling & Worker Lifecycle

## End-to-End Scheduling Flow
1. **Multipart CSV Upload**: `POST /api/v1/campaigns` streams and validates CSV rows, normalizing email addresses, removing duplicates, and enforcing size limits.
2. **Atomic DB Transaction**:
   * Creates `Campaign` in `SCHEDULE_PENDING`.
   * Inserts $N$ rows into `Email` with sequence 1..$N$.
   * Creates an `OutboxEvent` (`status = PENDING`).
   * Records the `IdempotencyKey`.
   * Returns HTTP `202 Accepted` immediately with estimated timeline preview.
3. **Outbox Dispatcher**:
   * Claims the outbox event and fetches candidate emails in order.
   * Invokes the atomic Redis Lua script with deterministic reservation IDs (`${emailId}-a1`).
   * Updates emails to `SCHEDULED`, records `EmailAttempt` row #1, and marks the outbox event `DONE`.
   * Uses BullMQ `addBulk()` to inject delayed jobs with millisecond precision.

## Worker Send Execution
1. BullMQ pops job at `scheduledAt`.
2. Worker queries email; if already `SENT`, acks immediately.
3. Worker executes conditional MySQL update (`status = 'SENDING' WHERE id = ? AND status = 'SCHEDULED'`).
4. If row claimed, worker decrypts SMTP credentials (AES-256-GCM) and sends via Nodemailer.
5. On success: records Ethereal preview link, updates attempt to `SENT`, updates email to `SENT`, increments campaign sent counter, and enqueues Elasticsearch index update.
