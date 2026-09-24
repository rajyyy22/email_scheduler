# REST API Reference

Base URL: `/api/v1`

## Authentication
* `GET /auth/google`: Initiates Google OAuth 2.0 flow.
* `GET /auth/google/callback`: Handles Google redirect, creates session, and sets HTTP-only cookie `reachinbox_session`.
* `GET /auth/me`: Returns currently authenticated user profile.
* `POST /auth/logout`: Clears session from Redis and browser.

## Senders
* `GET /senders`: Lists all configured senders for the user.
* `POST /senders`: Creates a new sender with AES-256-GCM encrypted SMTP credentials.

## Campaigns
* `POST /campaigns`: Accepts multipart form data (fields: `senderId`, `subject`, `body`, `startAt`, `minimumDelayMs`, `hourlyLimit`, `file`). Requires `Idempotency-Key` header. Returns `202 Accepted` with schedule preview.
* `GET /campaigns`: Lists user campaigns.
* `GET /campaigns/:id`: Returns campaign details with live delivery counters.

## Emails
* `GET /emails?view=scheduled|sent&limit=20&cursor=...`: Cursor-paginated listing of user emails.
* `GET /emails/:id`: Full details of an email including delivery attempts and error codes.
* `POST /emails/:id/retry`: Manually triggers a retry attempt for a failed email.

## Search
* `GET /search/emails?q=...&status=...`: Elasticsearch fuzzy search across subjects and recipients scoped strictly to the authenticated user.

## Slack Integration
* `GET /integrations/slack`: Returns current Slack connection status.
* `GET /integrations/slack/connect`: Initiates Slack OAuth flow for incoming webhook authorization.
* `GET /integrations/slack/callback`: Handles callback and encrypts webhook URL.
* `DELETE /integrations/slack`: Disconnects Slack integration.

## Health Probes
* `GET /health/live`: Process liveness check.
* `GET /health/ready`: System readiness check validating MySQL, Redis, and Elasticsearch.
