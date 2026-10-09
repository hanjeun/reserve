import { PUBLIC_STORE_SORT_OPTIONS } from '../../constants/api';

export const WAITING_STORE_STATUSES = [
    { value: 'ALL', label: '전체 상태' },
    { value: 'OPEN', label: '접수 중' },
    { value: 'PAUSED', label: '접수 중지' },
];
export const WAITING_STORE_SORTS = PUBLIC_STORE_SORT_OPTIONS.filter(option => option.value !== 'distance');
