import api from '../api/axios';

// 소식·안내용 공개 읽기만 연결한다. 기존 작성자 전용 홍보 API는 공개하지 않는다.
export default {
    // 공개 API 실패를 로그인/로그아웃 흐름으로 바꾸지 않는다.
    getList: (params, signal) => api.get('/api/promotions/public', { params, signal, skipAuthRefresh: true }),
    getDetail: (id, signal) => api.get(`/api/promotions/public/${id}`, { signal, skipAuthRefresh: true }),
};
