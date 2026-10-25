import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

// 공휴일 색상 조회는 예약 가능 여부를 결정하지 않는다.
const holidayService = {
    getMonth: month => api.get(API_ENDPOINTS.HOLIDAY.MONTH, { params: { month } }),
};

export default holidayService;
