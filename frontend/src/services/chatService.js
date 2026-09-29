import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';
import { normalizeListPage } from '../utils/listResponse';

const messageBody = (content, clientMessageId) => ({ content, clientMessageId });

const chatService = {
    listConversations: (page = 0, hidden = false) => api.get(
        API_ENDPOINTS.CHAT.CONVERSATIONS, { params: { page, ...(hidden ? { hidden } : {}) } }).then(data => normalizeListPage(data, page)),
    listStoreInbox: (page = 0, hidden = false) => api.get(
        API_ENDPOINTS.CHAT.STORE_INBOX, { params: { page, ...(hidden ? { hidden } : {}) } }).then(data => normalizeListPage(data, page)),
    getSupport: () => api.post(`${API_ENDPOINTS.CHAT.SUPPORT}/open`),
    sendSupport: (content, clientMessageId, config) => api.post(
        API_ENDPOINTS.CHAT.SUPPORT_SEND, messageBody(content, clientMessageId), config),
    getStore: (storeId) => api.post(`${API_ENDPOINTS.CHAT.STORE(storeId)}/open`),
    sendStore: (storeId, content, clientMessageId, config) => api.post(
        API_ENDPOINTS.CHAT.STORE_SEND(storeId), messageBody(content, clientMessageId), config),
    getStoreInboxRoom: (roomId) => api.post(`${API_ENDPOINTS.CHAT.STORE_INBOX_ROOM(roomId)}/open`),
    sendStoreInbox: (roomId, content, clientMessageId, config) => api.post(
        API_ENDPOINTS.CHAT.STORE_INBOX_SEND(roomId), messageBody(content, clientMessageId), config),
    listAdminSupportInbox: (page = 0) => api.get(
        API_ENDPOINTS.CHAT.ADMIN_ROOMS, { params: { page } }).then(data => normalizeListPage(data, page)),
    getAdminSupportRoom: (roomId) => api.post(`${API_ENDPOINTS.CHAT.ADMIN_ROOM(roomId)}/open`),
    pollAdminSupportRoom: (roomId, afterId) => api.get(
        API_ENDPOINTS.CHAT.ADMIN_POLL(roomId), { params: { afterId } }),
    sendAdminSupportRoom: (roomId, content, clientMessageId, config) => api.post(
        API_ENDPOINTS.CHAT.ADMIN_REPLY(roomId), messageBody(content, clientMessageId), config),
    retract: (roomId, messageId) => api.post(`/api/chat/rooms/${roomId}/messages/${messageId}/retract`),
    pollRetractions: (roomId, afterRevision = 0) => api.get(`/api/chat/rooms/${roomId}/retractions`, { params: { afterRevision } }),
    markAdminSupportRead: (roomId) => api.post(API_ENDPOINTS.CHAT.ADMIN_READ(roomId)),
    pollRoom: (roomId, afterId) => api.get(
        API_ENDPOINTS.CHAT.ROOM_MESSAGES(roomId), { params: { afterId } }),
    getHistory: (roomId, beforeId, size = 50) => api.get(
        API_ENDPOINTS.CHAT.ROOM_HISTORY(roomId), { params: { beforeId, size } }),
    markRead: (roomId, viewerRole) => api.post(
        API_ENDPOINTS.CHAT.ROOM_READ(roomId), undefined, { params: { viewerRole } }),
    setBlocked: (roomId, viewerRole, blocked) => api.put(
        API_ENDPOINTS.CHAT.ROOM_BLOCK(roomId), undefined, { params: { viewerRole, blocked } }),
    setHidden: (roomId, viewerRole, hidden) => api.put(`/api/chat/rooms/${roomId}/visibility`, undefined,
        { params: { viewerRole, hidden } }),
    reportConversation: (roomId, viewerRole, report) => api.post(
        API_ENDPOINTS.CHAT.ROOM_REPORTS(roomId), report, { params: { viewerRole } }),
    listReports: (page, status) => api.get(
        API_ENDPOINTS.CHAT.ADMIN_REPORTS, { params: { page, status } }).then(data => normalizeListPage(data, page)),
    getReportContext: (reportId) => api.get(API_ENDPOINTS.CHAT.ADMIN_REPORT_CONTEXT(reportId)),
    reviewReport: (reportId, review) => api.patch(
        API_ENDPOINTS.CHAT.ADMIN_REPORT(reportId), review),
    getUnread: () => api.get(API_ENDPOINTS.CHAT.UNREAD),
    getImageConfig: () => api.get('/api/chat/images/config'),
    sendImage: (roomId, file, content, clientMessageId, config) => {
        const form = new FormData();
        form.append('image', file);
        form.append('content', content || '');
        form.append('clientMessageId', clientMessageId);
        return api.post(`/api/chat/rooms/${roomId}/images`, form, config);
    },
    getImage: (url, signal) => api.get(url, { responseType: 'blob', signal }),
    getSupportIntro: () => api.get(API_ENDPOINTS.CHAT.INTRO_SUPPORT),
    getStoreIntro: (storeId) => api.get(API_ENDPOINTS.CHAT.INTRO_STORE(storeId)),
    saveStoreIntro: (storeId, intro) => api.put(API_ENDPOINTS.CHAT.INTRO_STORE(storeId), intro),
    saveSupportIntro: (intro) => api.put(API_ENDPOINTS.CHAT.ADMIN_INTRO, intro),
    /** 고객지원 채팅 사진 올리기 → { url }. 저장은 saveSupportIntro 의 avatarUrl 로. */
    uploadSupportAvatar: (file) => {
        const form = new FormData();
        form.append('image', file);
        return api.post(API_ENDPOINTS.CHAT.ADMIN_INTRO_AVATAR, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
};

export default chatService;
