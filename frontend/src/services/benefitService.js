import api from '../api/axios';

// 공개 소식 읽기와 회원 신고. 작성·수정은 가게 소식 관리 API에서 처리한다.
export default {
    // 공개 API 실패를 로그인/로그아웃 흐름으로 바꾸지 않는다.
    getList: (params, signal) => api.get('/api/promotions/public', { params, signal, skipAuthRefresh: true }),
    getDetail: (id, signal) => api.get(`/api/promotions/public/${id}`, { signal, skipAuthRefresh: true }),
    report: (id, data) => api.post(`/api/promotions/public/${id}/reports`, data),
};
