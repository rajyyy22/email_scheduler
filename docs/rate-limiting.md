# Distributed Rate-Limiting & Reservation Engine

## Key Design
All keys incorporate the Redis hash tag `{senderId}` to ensure they map to the exact same hash slot:
* `rate:v1:{senderId}:state`: Tracks `nextAvailableMs`.
* `rate:v1:{senderId}:hours`: Tracks reservation counts per UTC hour window (`s:<hourStart>` and `c:<campaignId>:<hourStart>`).
* `rate:v1:{senderId}:reservations`: Stores deterministic `reservationId` $\to$ `scheduledMs` mappings.
* `rate:v1:{senderId}:notifications`: Tracks triggered Slack notification hours via a Redis SET.

## The Lua Reservation Algorithm
1. Authoritative time is fetched from Redis server time (`redis.call('TIME')`).
2. Senders have an atomic state pointer `nextAvailableMs`.
3. For each candidate send:
   * Effective delay is calculated: $\text{effectiveDelay} = \max(\text{senderDelay}, \text{campaignDelay})$.
   * Candidate time is determined: $\text{candidate} = \max(\text{requestedAt}, \text{nextAvailableMs})$.
   * Current hour bucket is determined: $\text{hourStart} = \lfloor\text{candidate} / 3600000\rfloor \times 3600000$.
   * Quotas for sender and campaign are checked.
   * If quota is exceeded, $\text{candidate}$ jumps immediately to the beginning of the next hour ($\text{hourStart} + 3600000$).
   * Once a valid slot is found, counters are incremented and $\text{nextAvailableMs} = \text{slot} + \text{effectiveDelay}$.
4. If `newSenderCount >= senderHourlyLimit`, `SADD` is executed on the notifications set. If `1`, a Slack rate-limit webhook job is triggered.

## Mathematical Proof: 5/hr Limit with 2s Delay
Given:
* Hourly limit = 5
* Delay = 2000ms
* Start = 10:00:00 UTC

Execution slots:
* Email 1: 10:00:00
* Email 2: 10:00:02
* Email 3: 10:00:04
* Email 4: 10:00:06
* Email 5: 10:00:08 (Sender hourly limit 5 reached -> flags Slack alert)
* Email 6: 11:00:00 (Jumped to next hour window!)
* Email 7: 11:00:02
* ...
No emails are dropped or rejected.
