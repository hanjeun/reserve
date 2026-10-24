-- Dedicated visitor capacity. It confers no member or reservation authority.
-- KEYS control(hash), waiting(zset), active(zset), heartbeats(zset), born(hash), sequence(string)
-- Automatic uses existingTicket=writer UUID, newServerTicket=signal, and adds pressure/recovery/minimum ms.
-- The eight optional auto fields never change pass identity, capacity, or lifetime.
local control = redis.call('HMGET', KEYS[1], 'marker', 'mode', 'autoState', 'autoOwner', 'autoLeaseUntil',
    'autoObservedAt', 'autoHighMs', 'autoClearMs', 'autoEmergencyMs', 'autoSignal')
local mode = control[2]
if control[1] ~= ARGV[4] or (mode ~= 'OFF' and mode ~= 'CORE' and mode ~= 'EMERGENCY') then return {'UNAVAILABLE'} end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local action, ticket = ARGV[1], ARGV[2]
local function integer(value)
    if type(value) ~= 'string' or #value > 16 or not string.match(value, '^%d+$') then return nil end
    local n = tonumber(value)
    if not n or n > 9007199254740991 then return nil end
    return n
end
local function writer(value)
    if type(value) ~= 'string' or #value ~= 36 or string.find(value, '[^0-9a-f%-]')
        or string.sub(value, 9, 9) ~= '-' or string.sub(value, 14, 14) ~= '-'
        or string.sub(value, 19, 19) ~= '-' or string.sub(value, 24, 24) ~= '-' then return false end
    local compact = string.gsub(value, '-', '')
    return #compact == 32
end
local autoState, owner, lease, observed, highMs, clearMs, emergencyMs, previousSignal
-- Manual OFF/EMERGENCY always take precedence, including when an auto field needs operator repair.
if mode == 'CORE' then
    local present = 0
    for i = 3, 10 do if control[i] then present = present + 1 end end
    if present ~= 0 then
        if present ~= 8 then return {'UNAVAILABLE'} end
        autoState, owner = control[3], control[4]
        lease, observed = integer(control[5]), integer(control[6])
        highMs, clearMs, emergencyMs = integer(control[7]), integer(control[8]), integer(control[9])
        previousSignal = control[10]
        if (autoState ~= 'CORE' and autoState ~= 'EMERGENCY') or not writer(owner)
            or (previousSignal ~= 'HIGH' and previousSignal ~= 'CLEAR' and previousSignal ~= 'HOLD' and previousSignal ~= 'UNKNOWN')
            or not lease or not observed or observed <= 0 or lease ~= observed + 20000
            or not highMs or highMs > 600000 or not clearMs or clearMs > 3600000
            or not emergencyMs or emergencyMs > 3600000
            or (autoState == 'CORE' and (clearMs ~= 0 or emergencyMs ~= 0))
            or (autoState == 'EMERGENCY' and highMs ~= 0) then return {'UNAVAILABLE'} end
        if autoState == 'EMERGENCY' then mode = 'EMERGENCY' end
    end
end
local function result(state, ticket, position, expires, absolute)
    return {state, ticket or '', tostring(position or 0), tostring(expires or 0), tostring(absolute or 0), tostring(now), mode}
end
if mode == 'OFF' then return result('BYPASS') end
if action == 'automatic' then
    if control[2] ~= 'CORE' then return result('MODE') end
    local signal = ARGV[3]
    local pressure, recovery, minimum = integer(ARGV[10]), integer(ARGV[11]), integer(ARGV[12])
    if not writer(ticket) or (signal ~= 'HIGH' and signal ~= 'CLEAR' and signal ~= 'HOLD' and signal ~= 'UNKNOWN')
        or not pressure or pressure < 30000 or pressure > 600000
        or not recovery or recovery < 120000 or recovery > 3600000
        or not minimum or minimum < 120000 or minimum > 3600000 then return {'UNAVAILABLE'} end
    -- A second Blue/Green process cannot reset or advance the current writer's evidence.
    if owner and owner ~= ticket and lease > now then return result('MODE') end
    local continuous = owner == ticket and now > observed and now - observed <= 15000
    local credit = continuous and math.min(now - observed, 5000) or 0
    if not continuous then highMs, clearMs, emergencyMs = 0, 0, 0 end
    autoState = autoState or 'CORE'
    if autoState == 'CORE' then
        highMs = signal == 'HIGH' and previousSignal == 'HIGH' and math.min(highMs + credit, pressure) or 0
        clearMs, emergencyMs = 0, 0
        if highMs >= pressure then autoState, highMs = 'EMERGENCY', 0 end
    else
        highMs = 0
        emergencyMs = math.min(emergencyMs + credit, minimum)
        clearMs = signal == 'CLEAR' and previousSignal == 'CLEAR' and math.min(clearMs + credit, recovery) or 0
        if clearMs >= recovery and emergencyMs >= minimum then autoState, clearMs, emergencyMs = 'CORE', 0, 0 end
    end
    redis.call('HSET', KEYS[1], 'autoState', autoState, 'autoOwner', ticket, 'autoLeaseUntil', string.format('%.0f', now + 20000),
        'autoObservedAt', string.format('%.0f', now), 'autoHighMs', highMs, 'autoClearMs', clearMs, 'autoEmergencyMs', emergencyMs,
        'autoSignal', signal)
    mode = autoState
    return result('MODE')
end
if action == 'mode' then return result('MODE') end
local capacity, sessionMs, maxSessionMs, heartbeatMs = tonumber(ARGV[5]), tonumber(ARGV[6]), tonumber(ARGV[7]), tonumber(ARGV[8])

-- Pure inspection precedes every renewal, so bounded cleanup can never revive its unvisited expired tail.
local function inspect(id)
    local lease = redis.call('ZSCORE', KEYS[3], id)
    if lease then
        local born = tonumber(redis.call('HGET', KEYS[5], id))
        if not born then return 'EXPIRED', 0, 0, 0 end
        local absolute = born + maxSessionMs
        if tonumber(lease) <= now or absolute <= now then return 'EXPIRED', 0, 0, 0 end
        return 'ADMITTED', 0, tonumber(lease), absolute
    end
    local rank = redis.call('ZRANK', KEYS[2], id)
    if rank then
        local heartbeat = redis.call('ZSCORE', KEYS[4], id)
        if not heartbeat or tonumber(heartbeat) <= now then return 'EXPIRED', 0, 0, 0 end
        return 'WAITING', rank + 1, tonumber(heartbeat), 0
    end
    return 'EXPIRED', 0, 0, 0
end

-- The app-request fast path must not scan, promote, create, remove, or keep a waiting visitor alive.
if action == 'check' then
    if ticket == '' then return result('NOT_JOINED') end
    local lease = redis.call('ZSCORE', KEYS[3], ticket)
    local born = lease and tonumber(redis.call('HGET', KEYS[5], ticket)) or nil
    if not lease or not born or tonumber(lease) <= now or born + maxSessionMs <= now then return result('EXPIRED') end
    local expires = math.min(now + sessionMs, born + maxSessionMs)
    redis.call('ZADD', KEYS[3], expires, ticket)
    return result('ADMITTED', ticket, 0, expires, born + maxSessionMs)
end
if action ~= 'join' and action ~= 'status' and action ~= 'cancel' then return {'UNAVAILABLE'} end
if action ~= 'join' and ticket == '' then return result('NOT_JOINED') end

local function forget(id)
    redis.call('ZREM', KEYS[2], id)
    redis.call('ZREM', KEYS[3], id)
    redis.call('ZREM', KEYS[4], id)
    redis.call('HDEL', KEYS[5], id)
end
-- At most 100 stale tickets and 100 promotion candidates are processed per queue operation.
local cleanupBudget = 100
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now, 'LIMIT', 0, cleanupBudget)) do
    forget(id)
    cleanupBudget = cleanupBudget - 1
end
if cleanupBudget > 0 then
    for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[4], '-inf', now, 'LIMIT', 0, cleanupBudget)) do forget(id) end
end
local promotionBudget = 100
local function promote()
    local vacancies = math.max(0, capacity - redis.call('ZCARD', KEYS[3]))
    if vacancies == 0 or promotionBudget == 0 then return end
    for _, id in ipairs(redis.call('ZRANGE', KEYS[2], 0, promotionBudget - 1)) do
        promotionBudget = promotionBudget - 1
        local heartbeat = redis.call('ZSCORE', KEYS[4], id)
        if not heartbeat or tonumber(heartbeat) <= now then forget(id)
        else
            redis.call('ZREM', KEYS[2], id)
            redis.call('ZREM', KEYS[4], id)
            redis.call('HSET', KEYS[5], id, now)
            redis.call('ZADD', KEYS[3], math.min(now + sessionMs, now + maxSessionMs), id)
            vacancies = vacancies - 1
            if vacancies == 0 then break end
        end
    end
end

local state, position, expires, absolute = inspect(ticket)
if state == 'EXPIRED' and ticket ~= '' then forget(ticket) end
if action == 'join' then
    if state == 'EXPIRED' then
        -- Existing FIFO waiters receive vacancies before a new arrival is queued.
        promote()
        if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[9]) then return result('FULL') end
        ticket = ARGV[3]
        if ticket == '' or redis.call('ZSCORE', KEYS[2], ticket) or redis.call('ZSCORE', KEYS[3], ticket) then return {'UNAVAILABLE'} end
        redis.call('ZADD', KEYS[2], redis.call('INCR', KEYS[6]), ticket)
        redis.call('ZADD', KEYS[4], now + heartbeatMs, ticket)
        state = 'WAITING'
    end
elseif state == 'EXPIRED' then
    promote()
    return result('EXPIRED')
elseif action == 'cancel' then
    forget(ticket)
    promote()
    return result('CANCELLED')
end
if state == 'ADMITTED' then redis.call('ZADD', KEYS[3], math.min(now + sessionMs, absolute), ticket)
elseif state == 'WAITING' then redis.call('ZADD', KEYS[4], now + heartbeatMs, ticket) end
promote()
state, position, expires, absolute = inspect(ticket)
if state == 'EXPIRED' then return result('EXPIRED') end
return result(state, ticket, position, expires, absolute)
