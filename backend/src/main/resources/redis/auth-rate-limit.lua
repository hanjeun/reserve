local mode, capacity, period = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local boot = string.match(redis.call('INFO', 'server'), 'run_id:([a-f0-9]+)')
if not boot or #boot ~= 40 then return redis.error_reply('Redis server identity is unavailable') end
local state = redis.call('HMGET', KEYS[1], 'boot', 'ready')
if state[1] ~= boot or not tonumber(state[2]) then
    -- Redis 재시작·marker 유실 뒤에는 최장 인증 제한 창이 끝날 때까지 새 증명을 보류한다.
    redis.call('HSET', KEYS[1], 'boot', boot, 'ready', now + 600000)
    return -600
end
if now < tonumber(state[2]) then return -math.max(1, math.ceil((tonumber(state[2]) - now) / 1000)) end
local values = redis.call('HMGET', KEYS[2], 'tokens', 'refilled', 'boot')
local tokens, refilled = tonumber(values[1]), tonumber(values[2])
if not tokens or not refilled or values[3] ~= boot then
    tokens, refilled = capacity, now
elseif now - refilled >= period then
    tokens = capacity
    refilled = refilled + math.floor((now - refilled) / period) * period
end
if mode == 'refund' then
    local proof = redis.call('GET', KEYS[3])
    if not proof then return 0 end
    redis.call('DEL', KEYS[3])
    if proof ~= boot .. ':' .. tostring(refilled) then return 0 end
    tokens = math.min(capacity, tokens + 1)
elseif mode == 'consume' then
    if tokens <= 0 then return 0 end
    tokens = tokens - 1
    if ARGV[4] == '1' then
        redis.call('SET', KEYS[3], boot .. ':' .. tostring(refilled), 'PX', period * 2)
    end
else
    return redis.error_reply('Unsupported authentication limit operation')
end
redis.call('HSET', KEYS[2], 'tokens', tokens, 'refilled', refilled, 'boot', boot)
redis.call('PEXPIRE', KEYS[2], period * 2)
return 1
