import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

// 공휴일 목록(YYYY-MM-DD 문자열 배열). 달력을 빨갛게 칠하는 용도라 실패해도 예약 판정과 무관하다.
const holidayService = {
    getMonth: month => api.get(API_ENDPOINTS.HOLIDAY.MONTH, { params: { month } }),
};

export default holidayService;
