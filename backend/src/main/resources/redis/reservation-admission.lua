-- 모든 키는 같은 Redis 해시 태그를 사용하고 정리·승격 작업량은 호출별로 제한한다.
-- KEYS: 1 대기, 2 임대, 3 생존 시각, 4 소유자, 5 회원, 6 상태, 7 점유, 8 순번, 9 준비 표식
-- ARGV: action/member/ticket/request/marker/open/close/concurrent/leaseMs/idleMs/maxWaiting/maxParticipants
if redis.call('GET', KEYS[9]) ~= ARGV[5] then return {'UNAVAILABLE'} end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local function short(state, id) return {state, id or '', '0', '0', tostring(now)} end
local opened, closed = tonumber(ARGV[6]), tonumber(ARGV[7])
if now < opened then return short('NOT_OPEN') end
if now >= closed then return short('CLOSED') end
local member, ticket, request = ARGV[2], ARGV[3], ARGV[4]
local function forget(id)
    local owner = redis.call('HGET', KEYS[4], id)
    if owner and redis.call('HGET', KEYS[5], owner) == id then redis.call('HDEL', KEYS[5], owner) end
    redis.call('ZREM', KEYS[1], id)
    redis.call('ZREM', KEYS[2], id)
    redis.call('ZREM', KEYS[3], id)
    redis.call('HDEL', KEYS[4], id)
    redis.call('HDEL', KEYS[6], id)
    redis.call('HDEL', KEYS[7], id)
end
-- 점유는 트랜잭션 제한 시간 동안 임대를 유지하며 대체 인원을 미리 승격하지 않는다.
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'LIMIT', 0, 100)) do forget(id) end
for _, id in ipairs(redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now, 'LIMIT', 0, 100)) do forget(id) end
if ARGV[1] == 'join' then
    local existing = redis.call('HGET', KEYS[5], member)
    -- 커밋된 요청의 사용 영수증은 보존하되 사용자가 새 예약을 시작하면 다시 순번대로 대기한다.
    if existing and redis.call('HGET', KEYS[6], existing) == 'CONSUMED' then existing = nil end
    if existing then ticket = existing
    else
        if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[11]) then return short('FULL') end
        if redis.call('HLEN', KEYS[4]) >= tonumber(ARGV[12]) then return short('CLOSED') end
        local seq = redis.call('INCR', KEYS[8])
        redis.call('HSET', KEYS[4], ticket, member)
        redis.call('HSET', KEYS[5], member, ticket)
        redis.call('HSET', KEYS[6], ticket, 'WAITING')
        redis.call('ZADD', KEYS[1], seq, ticket)
        redis.call('ZADD', KEYS[3], now + tonumber(ARGV[10]), ticket)
    end
end
if redis.call('HGET', KEYS[4], ticket) ~= member then return short('EXPIRED') end
local state = redis.call('HGET', KEYS[6], ticket)
-- 전역 정리에서 방문하지 못한 만료 항목도 개별 요청에서 갱신해 되살리지 않는다.
if state == 'WAITING' or state == 'ADMITTED' or state == 'CLAIMED' then
    local expiry = redis.call('ZSCORE', state == 'WAITING' and KEYS[3] or KEYS[2], ticket)
    if not expiry or tonumber(expiry) <= now then forget(ticket); return short('EXPIRED') end
end
if ARGV[1] == 'cancel' then
    if state == 'CLAIMED' or state == 'CONSUMED' then return short(state, ticket) end
    forget(ticket)
    state = 'CANCELLED'
elseif ARGV[1] == 'claim' then
    if state == 'CLAIMED' then return short('BUSY', ticket) end
    if state ~= 'ADMITTED' then return short(state or 'EXPIRED', ticket) end
    redis.call('HSET', KEYS[6], ticket, 'CLAIMED')
    local originalExpiry = redis.call('ZSCORE', KEYS[2], ticket)
    redis.call('HSET', KEYS[7], ticket, request .. '|' .. originalExpiry)
    redis.call('ZADD', KEYS[2], math.max(tonumber(originalExpiry), now + 60000), ticket)
    redis.call('ZREM', KEYS[3], ticket)
    state = 'CLAIMED'
elseif ARGV[1] == 'consume' or ARGV[1] == 'release' then
    local claim = redis.call('HGET', KEYS[7], ticket)
    if state ~= 'CLAIMED' or not claim or string.sub(claim, 1, string.len(request) + 1) ~= request .. '|' then return short(state or 'EXPIRED', ticket) end
    local originalExpiry = tonumber(string.sub(claim, string.len(request) + 2))
    redis.call('HDEL', KEYS[7], ticket)
    if ARGV[1] == 'consume' then
        redis.call('ZREM', KEYS[2], ticket)
        redis.call('HSET', KEYS[6], ticket, 'CONSUMED')
        state = 'CONSUMED'
    else
        if originalExpiry <= now then forget(ticket); state = 'EXPIRED'
        else
            redis.call('HSET', KEYS[6], ticket, 'ADMITTED')
            redis.call('ZADD', KEYS[2], originalExpiry, ticket)
            state = 'ADMITTED'
        end
    end
elseif state == 'WAITING' then
    redis.call('ZADD', KEYS[3], now + tonumber(ARGV[10]), ticket)
end
local vacancies = math.min(100, tonumber(ARGV[8]) - redis.call('ZCARD', KEYS[2]))
if vacancies > 0 then
    for _, id in ipairs(redis.call('ZRANGE', KEYS[1], 0, vacancies - 1)) do
        local heartbeat = redis.call('ZSCORE', KEYS[3], id)
        if not heartbeat or tonumber(heartbeat) <= now then forget(id)
        else
            redis.call('ZREM', KEYS[1], id)
            redis.call('ZREM', KEYS[3], id)
            redis.call('HSET', KEYS[6], id, 'ADMITTED')
            redis.call('ZADD', KEYS[2], now + tonumber(ARGV[9]), id)
        end
    end
end
if state ~= 'CANCELLED' then state = redis.call('HGET', KEYS[6], ticket) or 'EXPIRED' end
local rank = redis.call('ZRANK', KEYS[1], ticket)
local expires = redis.call('ZSCORE', KEYS[2], ticket)
for i = 1, 8 do redis.call('PEXPIREAT', KEYS[i], closed + 86400000) end
return {state, ticket, tostring(rank and rank + 1 or 0), expires or '0', tostring(now)}
