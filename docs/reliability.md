# Reliability & Fault Tolerance

## Restart Persistence
* **Redis AOF (Append Only File)**: Configured with `appendonly yes` and `appendfsync everysec`. BullMQ delayed jobs are stored in Redis sorted sets and survive container or process restarts.
* **Worker Crash Recovery**: If a worker process terminates abruptly while holding a lock on an email in `SENDING` state, an automated liveness reaper checks for emails with `locked_at > 5 minutes`. It inspects provider message logs; if unsent, it safely resets the status to `SCHEDULED` and re-enqueues the job.
* **Outbox Recovery**: A background sweeper scans every 30s for any `PENDING` outbox events whose process may have died before queue insertion, ensuring zero campaign loss.

## The Exactly-Once Delivery Discussion
In distributed systems, mathematical exactly-once delivery across an external network boundary (such as an external SMTP server) is subject to the Two Generals' Paradox:
* An SMTP server may accept and queue an email for delivery, but a network disconnect or process crash may occur before the TCP ACK reaches our application.
* **Our Engineering Solution**:
  1. We enforce strict at-most-once semantics on the database claim via conditional SQL updates (`WHERE status = 'SCHEDULED'`).
  2. We enforce queue-level idempotency via deterministic BullMQ Job IDs (`email-send-${emailId}`).
  3. We enforce reservation-level idempotency in Redis Lua via unique reservation IDs (`${emailId}-a${attemptNo}`).
  4. Ambiguous outcomes (e.g. socket drops during send) are classified as `UNKNOWN` rather than blindly retried, preventing spam bursts while preserving an auditable history.
