#!lua
local mode = ARGV[1]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local retention = 30 * 86400000
if mode == 'forget-browsers' then
    redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
    return 1
end
local registering = mode == 'register-browser'
if mode == 'browser' or mode == 'remember-browser' or mode == 'forget-browser' or mode == 'renew-browser'
        or mode == 'track-browser' or mode == 'devices' or registering then
    if registering and redis.call('HGET', KEYS[4], 'binding') ~= ARGV[8] then return 0 end
    local function removeDetails(id)
        redis.call('HDEL', KEYS[2], id)
        if KEYS[3] then redis.call('HDEL', KEYS[3], id) end
    end
    local function track(id, environment, session)
        if not session then return end
        local previous = redis.call('HGET', KEYS[3], id) or ''
        local metadata = environment .. ':' .. session
        local count = 1
        for reference in string.gmatch(previous, ':([a-f0-9]+)') do
            if #reference == 64 and reference ~= session and count < 5 then
                metadata = metadata .. ':' .. reference
                count = count + 1
            end
        end
        redis.call('HSET', KEYS[3], id, metadata)
        redis.call('PEXPIRE', KEYS[3], redis.call('PTTL', KEYS[1]))
    end

    local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now)
    for _, id in ipairs(expired) do removeDetails(id) end
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
    if mode == 'devices' then
        local entries = {}
        local registered = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
        for i = 1, #registered, 2 do
            local id = registered[i]
            table.insert(entries, {id, registered[i + 1], redis.call('HGET', KEYS[3], id) or ''})
        end
        return entries
    end
    local id = ARGV[2]
    if mode == 'forget-browser' then
        redis.call('ZREM', KEYS[1], id)
        removeDetails(id)
        return 1
    end
    if mode == 'remember-browser' or registering then
        redis.call('ZADD', KEYS[1], now + retention, id)
        redis.call('HSET', KEYS[2], id, ARGV[3] .. ':' .. ARGV[4] .. ':' .. ARGV[5])
        local count = redis.call('ZCARD', KEYS[1])
        if count > 8 then
            for _, old in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do
                if old ~= id and count > 8 then
                    removeDetails(old)
                    redis.call('ZREM', KEYS[1], old)
                    count = count - 1
                end
            end
        end
        redis.call('PEXPIRE', KEYS[1], retention)
        redis.call('PEXPIRE', KEYS[2], retention)
        track(id, ARGV[6], ARGV[7])
        if registering then
            if ARGV[9] == '' then redis.call('DEL', KEYS[4])
            else redis.call('HSET', KEYS[4], 'binding', ARGV[9]) end
        end
        return 1
    end
    if not redis.call('ZSCORE', KEYS[1], id) then return 0 end
    local details = redis.call('HGET', KEYS[2], id)
    if not details then return 0 end
    local network, prefix, family = string.match(details, '^([^:]+):([^:]+):([^:]+)$')
    if mode == 'track-browser' then
        if family ~= ARGV[3] then return 0 end
        track(id, ARGV[4], ARGV[5])
        return 1
    end
    if mode == 'renew-browser' then
        if family ~= ARGV[5] or (network ~= ARGV[3] and prefix ~= ARGV[4]) then return 0 end
        redis.call('ZADD', KEYS[1], now + retention, id)
        for _, key in ipairs(KEYS) do redis.call('PEXPIRE', key, retention) end
        return 1
    end
    if family ~= ARGV[5] then return 4 end
    if network == ARGV[3] then return 1 end
    if prefix == ARGV[4] then return 2 end
    return 3
elseif mode == 'known' or mode == 'remember' then
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - retention)
    if mode == 'known' then return redis.call('ZSCORE', KEYS[1], ARGV[2]) and 1 or 0 end
    redis.call('ZADD', KEYS[1], now, ARGV[2])
    redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -9)
    redis.call('PEXPIRE', KEYS[1], retention)
    return 1
elseif mode == 'bind' then
    redis.call('HSET', KEYS[1], 'binding', ARGV[2])
    redis.call('PEXPIRE', KEYS[1], 300000)
    return 1
elseif mode == 'binding' then
    return redis.call('HGET', KEYS[1], 'binding') == ARGV[2] and 1 or 0
elseif mode == 'issue-code' then
    if redis.call('HGET', KEYS[1], 'binding') ~= ARGV[2] then return 0 end
    local sent = tonumber(redis.call('HGET', KEYS[1], 'sent') or '0')
    if sent > 0 and now - sent < 60000 then return -2 end
    redis.call('HSET', KEYS[1], 'code', ARGV[3], 'sent', now)
    return 1
elseif mode == 'verify-code' then
    if redis.call('HGET', KEYS[1], 'binding') ~= ARGV[2] then return 0 end
    if redis.call('HGET', KEYS[1], 'code') ~= ARGV[3] then return 0 end
    redis.call('HDEL', KEYS[1], 'code')
    return 1
elseif mode == 'blocked' then
    return math.max(0, redis.call('PTTL', KEYS[1]))
elseif mode == 'failed' then
    local remaining = redis.call('PTTL', KEYS[2])
    if remaining > 0 then return remaining end
    local attempts = redis.call('INCR', KEYS[1])
    if attempts == 1 then redis.call('PEXPIRE', KEYS[1], 300000) end
    if attempts < 20 then return 0 end
    local strikes = redis.call('INCR', KEYS[3])
    redis.call('PEXPIRE', KEYS[3], 86400000)
    local duration = strikes == 1 and 900000 or 3600000
    redis.call('SET', KEYS[2], '1', 'PX', duration)
    redis.call('DEL', KEYS[1])
    return duration
end
return redis.error_reply('Unsupported IP protection operation')
