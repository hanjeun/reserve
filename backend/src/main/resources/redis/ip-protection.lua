#!lua
local mode = ARGV[1]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local retention = 30 * 86400000
if mode == 'known' or mode == 'remember' then
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
