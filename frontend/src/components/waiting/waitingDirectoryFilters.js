import { PUBLIC_STORE_SORT_OPTIONS } from '../../constants/api';

export const WAITING_STORE_STATUSES = [
    { value: 'ALL', label: '전체 상태' },
    { value: 'OPEN', label: '접수 중' },
    { value: 'PAUSED', label: '접수 중지' },
];
export const WAITING_STORE_SORTS = PUBLIC_STORE_SORT_OPTIONS.filter(option => option.value !== 'distance');

export const WAITING_ENTRY_LABELS = { WAITING: '대기 중', CALLED: '호출됨', SEATED: '입장 완료', CANCELLED: '취소됨' };
export const MY_WAITING_STATUSES = [{ value: 'ALL', label: '전체 상태' },
    ...Object.entries(WAITING_ENTRY_LABELS).map(([value, label]) => ({ value, label }))];
export const MY_WAITING_SORTS = [{ value: 'recent', label: '최신 접수순' }, { value: 'oldest', label: '오래된 접수순' }];
