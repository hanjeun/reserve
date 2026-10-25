/* 공개 표시 데이터만 다루며 HttpOnly 입장 쿠키는 서버에 둔다. */
export function serviceEntryStatus(value) {
    if (value?.campaignId !== 'service-entry' || !['OFF', 'CORE', 'EMERGENCY'].includes(value.mode)
        || !['BYPASS', 'NOT_JOINED', 'WAITING', 'ADMITTED', 'EXPIRED', 'CANCELLED', 'FULL'].includes(value.state)
        || !['position', 'expiresAt', 'absoluteExpiresAt', 'serverTime'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
        || value.serverTime === 0 || value.state === 'WAITING' && value.position < 1
        || value.continuityId != null && (typeof value.continuityId !== 'string' || !/^[0-9a-f]{64}$/.test(value.continuityId))
        || ['WAITING', 'ADMITTED'].includes(value.state) && !/^[0-9a-f]{64}$/.test(value.continuityId)
        || value.state === 'ADMITTED' && (value.expiresAt <= value.serverTime || value.absoluteExpiresAt < value.expiresAt)
        || !Number.isFinite(value.heartbeatTimeoutSeconds) || value.heartbeatTimeoutSeconds < 30 || value.heartbeatTimeoutSeconds > 86400
        || !Number.isFinite(value.pollAfterSeconds) || value.pollAfterSeconds < 4 || value.pollAfterSeconds > 60) {
        throw new Error('서비스 입장 상태를 확인하지 못했어요. 다시 확인해주세요.');
    }
    const { campaignId, mode, state, position, expiresAt, absoluteExpiresAt, serverTime,
        pollAfterSeconds, heartbeatTimeoutSeconds, continuityId } = value;
    return { campaignId, mode, state, position, expiresAt, absoluteExpiresAt, serverTime,
        pollAfterSeconds, heartbeatTimeoutSeconds, continuityId };
}
