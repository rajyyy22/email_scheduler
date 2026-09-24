-- Redis Lua Script for Atomic Rate-Limiting & Delayed Slot Reservation
-- KEYS:
-- KEYS[1] = rate:v1:{senderId}:state
-- KEYS[2] = rate:v1:{senderId}:hours
-- KEYS[3] = rate:v1:{senderId}:reservations
-- KEYS[4] = rate:v1:{senderId}:notifications

-- ARGV:
-- ARGV[1] = senderMinimumDelayMs (number)
-- ARGV[2] = senderHourlyLimit (number)
-- ARGV[3] = itemCount (number)
-- Followed by chunks of 5 args per item:
--   ARGV[3 + (i-1)*5 + 1] = reservationId (string)
--   ARGV[3 + (i-1)*5 + 2] = campaignId (string)
--   ARGV[3 + (i-1)*5 + 3] = requestedAtMs (number)
--   ARGV[3 + (i-1)*5 + 4] = campaignHourlyLimit (number)
--   ARGV[3 + (i-1)*5 + 5] = campaignMinimumDelayMs (number)

local stateKey = KEYS[1]
local hoursKey = KEYS[2]
local resvKey  = KEYS[3]
local notifKey = KEYS[4]

local senderMinDelay = tonumber(ARGV[1])
local senderHourlyLimit = tonumber(ARGV[2])
local itemCount = tonumber(ARGV[3])

-- 1. Obtain authoritative Redis server time
local timeArr = redis.call('TIME')
local nowMs = (tonumber(timeArr[1]) * 1000) + math.floor(tonumber(timeArr[2]) / 1000)

-- 2. Read current sender state
local nextAvailableMs = tonumber(redis.call('HGET', stateKey, 'nextAvailableMs')) or nowMs
if nextAvailableMs < nowMs then
    nextAvailableMs = nowMs
end

local results = {}
local oneHourMs = 3600000

for i = 1, itemCount do
    local baseIdx = 3 + (i - 1) * 5
    local reservationId = ARGV[baseIdx + 1]
    local campaignId = ARGV[baseIdx + 2]
    local requestedAtMs = tonumber(ARGV[baseIdx + 3])
    local campHourlyLimit = tonumber(ARGV[baseIdx + 4])
    local campMinDelay = tonumber(ARGV[baseIdx + 5])

    -- Check idempotency: if reservation already exists, return existing schedule
    local existingSchedule = redis.call('HGET', resvKey, reservationId)
    if existingSchedule then
        table.insert(results, cjson.encode({
            reservationId = reservationId,
            scheduledMs = tonumber(existingSchedule),
            isIdempotentReplay = true,
            hitLimit = false
        }))
    else
        local effectiveDelay = math.max(senderMinDelay, campMinDelay)
        local candidateMs = math.max(requestedAtMs, nextAvailableMs)

        local scheduledMs = nil
        local hitLimitNotification = 0
        local notificationHourStart = 0

        -- Search for an allowable hour slot
        while scheduledMs == nil do
            -- Compute current hour bucket (aligned to top of UTC hour)
            local hourStart = math.floor(candidateMs / oneHourMs) * oneHourMs
            local hourEnd = hourStart + oneHourMs

            local sField = "s:" .. tostring(hourStart)
            local cField = "c:" .. campaignId .. ":" .. tostring(hourStart)

            local currentSenderCount = tonumber(redis.call('HGET', hoursKey, sField)) or 0
            local currentCampCount = tonumber(redis.call('HGET', hoursKey, cField)) or 0

            if currentSenderCount < senderHourlyLimit and currentCampCount < campHourlyLimit then
                -- Slot available in this hour
                scheduledMs = candidateMs
                
                -- Increment counters
                local newSenderCount = currentSenderCount + 1
                redis.call('HSET', hoursKey, sField, newSenderCount)
                redis.call('HSET', hoursKey, cField, currentCampCount + 1)
                
                -- Check if sender limit is now reached
                if newSenderCount >= senderHourlyLimit then
                    -- Atomically record notification flag
                    local added = redis.call('SADD', notifKey, tostring(hourStart))
                    if added == 1 then
                        hitLimitNotification = 1
                        notificationHourStart = hourStart
                    end
                end

                -- Advance nextAvailableMs
                nextAvailableMs = scheduledMs + effectiveDelay
            else
                -- Capacity exhausted for this hour; jump candidate to start of next hour
                candidateMs = hourEnd
                if candidateMs < nextAvailableMs then
                    candidateMs = nextAvailableMs
                end
            end
        end

        -- Persist reservation
        redis.call('HSET', resvKey, reservationId, tostring(scheduledMs))

        table.insert(results, cjson.encode({
            reservationId = reservationId,
            scheduledMs = scheduledMs,
            isIdempotentReplay = false,
            hitLimit = (hitLimitNotification == 1),
            hourStart = notificationHourStart,
            hourEnd = notificationHourStart + oneHourMs
        }))
    end
end

-- Save updated sender state
redis.call('HSET', stateKey, 'nextAvailableMs', tostring(nextAvailableMs))

return results
