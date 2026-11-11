const count = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

export const chatUnreadCounts = value => ({
    messages: count(value?.messages ?? value),
    notifications: count(value?.notifications),
});

export function afterMessageRead(value, read) {
    const unread = chatUnreadCounts(value);
    const messages = Math.max(0, unread.messages - read);
    return value && typeof value === 'object' ? { ...unread, messages } : messages;
}

export function afterNotificationRead(value, result) {
    if (value == null) return value;
    if (typeof value !== 'object') return Math.max(0, count(value) - count(result?.changed ?? result));
    const unread = chatUnreadCounts(value);
    const notifications = typeof result?.unread === 'number' ? count(result.unread)
        : Math.max(0, unread.notifications - count(result));
    return { ...unread, notifications };
}
