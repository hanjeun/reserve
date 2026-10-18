-- Bucket4j refillIntervally와 같은 용량·주기를 사용한다. 시각과 소비는 Redis 한 명령에서 결정한다.
local capacity = tonumber(ARGV[1])
local period = tonumber(ARGV[2])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local values = redis.call('HMGET', KEYS[1], 'tokens', 'refilled')
local tokens = tonumber(values[1])
local refilled = tonumber(values[2])
if not tokens or not refilled then
    tokens = capacity
    refilled = now
elseif now - refilled >= period then
    tokens = capacity
    refilled = refilled + math.floor((now - refilled) / period) * period
end
local allowed = 0
if tokens > 0 then
    tokens = tokens - 1
    allowed = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'refilled', refilled)
redis.call('PEXPIRE', KEYS[1], period * 2)
return allowed
