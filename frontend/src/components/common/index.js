/**
 * RESERVE Design System - Common Components Index
 * 
 * 사용법:
 * import { Button, FormInput, PageContainer } from '../components/common';
 */

export { default as Loading, SpinIndicator } from './Loading';
export { default as ModalLoading } from './ModalLoading';
export { default as Button } from './Button';
export { default as Badge } from './Badge';
export { default as FormInput } from './FormInput';
export { default as FormTextArea } from './FormTextArea';
export { default as FormSelect } from './FormSelect';
// 폼 입력이 아니라 목록·툴바 위의 조작 도구용 셀렉트(흰 면 + 테두리).
// 어느 쪽을 쓸지는 FilterSelect.jsx 상단 주석 참고.
export { default as FilterSelect } from './FilterSelect';
export { default as FormDatePicker } from './FormDatePicker';
export { default as FormTimePicker } from './FormTimePicker';
export { default as PageContainer } from './PageContainer';
export { default as Card } from './Card';
export { default as Avatar } from './Avatar';
export { StoreCardSkeleton, ReservationCardSkeleton, MyReservationCardSkeleton, AdminTableSkeleton, ReviewCardSkeleton, StoreDetailSkeleton, Bone } from './Skeletons';
export { default as KakaoMap } from './KakaoMap';
export { default as FavoriteButton } from './FavoriteButton';
export { default as FilterToolbar } from './FilterToolbar';
// NOTE(2026-07 전수조사): CustomPagination 제거됨 — 자기 파일 안에서만 참조되고 앱 어디서도
// 사용되지 않는 죽은 코드였음(모든 테이블은 DataTable의 AntD 기본 pagination을 쓴다).
export { default as InquiryModal } from './InquiryModal';
export { default as FormModal, FormField } from './FormModal';
export { default as SegmentedControl } from './SegmentedControl';
// 여러 줄이 필요한 선택은 SegmentedGrid (문의 유형 등). 어느 쪽을 쓸지는 각 파일 상단 주석 참고.
export { default as SegmentedGrid } from './SegmentedGrid';
export { default as DataTable } from './DataTable';
export { default as StatCard } from './StatCard';
export { default as ChartCard } from './ChartCard';
export { default as PieLegend } from './PieLegend';
export { default as UnreadPill } from './UnreadPill';
export { default as RefreshButton } from './RefreshButton';
