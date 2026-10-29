import { currentSession } from '../api/sessionScope';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 24;
const TTL_MS = 120_000;
const MAX_TRACKED_IMAGES = 128;
const entries = new Map();
const versions = new Map();
let bytes = 0;
let generation = 0;
let nextVersion = 0;
let epoch = -1;
let timer;

export function clearChatImageCache() {
    clearTimeout(timer);
    entries.clear();
    versions.clear();
    bytes = 0;
    generation += 1;
}

function expire() {
    const now = Date.now();
    for (const [key, entry] of entries) {
        if (entry.expiresAt <= now) { entries.delete(key); bytes -= entry.blob.size; }
    }
    clearTimeout(timer);
    if (entries.size) timer = setTimeout(expire, Math.max(1, Math.min(...Array.from(entries.values(), entry => entry.expiresAt)) - now));
}

export function chatImageCacheScope(url) {
    const session = currentSession();
    if (epoch !== session.epoch) {
        clearChatImageCache();
        epoch = session.epoch;
        session.signal.addEventListener('abort', clearChatImageCache, { once: true });
    }
    const messageId = typeof url === 'string' ? /^\/api\/(?:v1\/)?chat\/images\/([1-9]\d*)$/.exec(url)?.[1] : undefined;
    let version = 0;
    if (messageId) {
        version = versions.get(messageId) ?? ++nextVersion;
        versions.delete(messageId);
        if (versions.size >= MAX_TRACKED_IMAGES) versions.delete(versions.keys().next().value);
        versions.set(messageId, version);
    }
    return { ...session, generation, messageId, version };
}

export const isChatImageScopeCurrent = scope => !scope.signal.aborted && scope.generation === generation
    && scope.version === (versions.get(scope.messageId) ?? 0);

export function invalidateChatImages(messageIds) {
    const ids = new Set(messageIds.filter(id => id != null).map(String));
    if (!ids.size) return;
    for (const id of ids) versions.delete(id);
    for (const [key, entry] of entries) {
        if (ids.has(entry.messageId)) { bytes -= entry.blob.size; entries.delete(key); }
    }
    expire();
}

export function cachedChatImage(key) {
    expire();
    const entry = entries.get(key);
    if (entry) { entries.delete(key); entries.set(key, entry); }
    return entry?.blob;
}

export function forgetCachedChatImage(key) {
    const previous = entries.get(key);
    if (previous) { bytes -= previous.blob.size; entries.delete(key); }
    expire();
}

export function rememberChatImage(key, blob, scope) {
    if (!isChatImageScopeCurrent(scope) || blob.size > MAX_BYTES) return;
    expire();
    const previous = entries.get(key);
    if (previous) { bytes -= previous.blob.size; entries.delete(key); }
    while (entries.size && (bytes + blob.size > MAX_BYTES || entries.size >= MAX_ENTRIES)) {
        const oldest = entries.keys().next().value;
        bytes -= entries.get(oldest).blob.size;
        entries.delete(oldest);
    }
    entries.set(key, { blob, expiresAt: Date.now() + TTL_MS, messageId: scope.messageId });
    bytes += blob.size;
    expire();
}
