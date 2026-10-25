import api from '../api/axios';

// 공개 소식 읽기와 회원 신고. 작성·수정은 가게 소식 관리 API에서 처리한다.
export default {
    // 공개 조회 오류가 인증 상태를 바꾸지 않게 한다.
    getList: (params, signal) => api.get('/api/promotions/public', { params, signal, skipAuthRefresh: true }),
    getDetail: (id, signal) => api.get(`/api/promotions/public/${id}`, { signal, skipAuthRefresh: true }),
    report: (id, data) => api.post(`/api/promotions/public/${id}/reports`, data),
};
