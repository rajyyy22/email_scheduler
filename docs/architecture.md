# ReachInbox System Architecture

## Overview
The ReachInbox Email Job Scheduler is a distributed platform engineered for high-throughput, rate-limited email dispatching with strict persistence and recovery guarantees.

## Data Layer Strategy
* **MySQL 8.0**: Authoritative source of truth for all users, senders, campaigns, emails, delivery audit logs, and transactional outbox events.
* **Redis 7.2 (AOF Persistence)**:
  * BullMQ delayed job queues (`email-send-v1`, `slack-notification-v1`, `email-index-v1`, `outbox-dispatch-v1`).
  * Atomic rate-limiting reservation state (`rate:v1:{senderId}:*`).
  * Server-side user sessions (`session:v1:{sessionId}`).
* **Elasticsearch 8.13**: Asynchronous read projection for full-text search across recipients, subjects, and email content. Strictly decoupled from the transactional sending path.
* **Ethereal Email**: Fake SMTP transport providing real message IDs and verifiable browser preview URLs.

## Core Architectural Invariants
1. **Zero Long-Term In-Memory Timers**: Long-range scheduling is managed strictly via BullMQ delayed jobs persisted in Redis sorted sets.
2. **Transactional Outbox Pattern**: Ingestion writes the campaign, email rows, and an outbox event in a single atomic MySQL transaction. If the API process dies before BullMQ insertion, the outbox processor recovers and schedules the campaign.
3. **Multi-Worker Concurrency**: Workers execute an atomic conditional claim (`UPDATE emails SET status = 'SENDING' WHERE id = ? AND status = 'SCHEDULED'`) to ensure exactly one worker claims an email.
