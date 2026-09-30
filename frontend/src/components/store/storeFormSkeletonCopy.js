import { BOOKING_TYPE_HINTS } from '../../constants';

// 가게 폼 로딩 뼈대(StoreFormSkeleton)가 실제 글자로 보여 주는 고정 문구(라벨 밑 안내·토글 설명).
// ⚠ StoreBasicInfo·StoreImages·StoreFormActions 의 문구와 같아야 한다 — StoreFormSkeleton.test 가 원문 포함 여부를 검사한다.
export const STORE_FORM_SKELETON_HINTS = Object.freeze({
    bookingType: BOOKING_TYPE_HINTS.SLOT,
    serviceDomain: '손님이 찾을 때 쓰는 큰 분류예요',
    category: '업종에 맞게 자유롭게 입력하세요',
    slot: '시간 선택 간격',
    breakTimes: '브레이크 없으면 비워두세요',
    capacity: '한 시간대 인원 합계, 비워두면 무제한',
    deposit: '0원이면 예약금 없음',
    nearby: '내 가게가 이 거리 이내면 "우리동네" 배지가 붙어요',
    closedDays: '선택한 요일은 예약을 받지 않아요. 안 고르면 연중무휴예요',
    period: '팝업스토어처럼 기간이 정해진 경우에만. 비워두면 계속 운영해요 (종료일 당일까지 예약 가능)',
    closedDates: '명절·개인 사정 등 특정 날짜만 쉴 때. 지난 날짜는 저장 시 자동으로 정리돼요',
    advance: '오늘부터 며칠 뒤까지 받을지. 비워두면 제한 없음 (최대 365일)',
    mainImage: '대표 이미지는 가게 카드와 고객의 가게 문의 채팅 사진에 표시됩니다. 변경하면 채팅 사진도 함께 바뀝니다.',
    detailImages: '사진을 끌어 옆 사진과 순서를 바꿀 수 있어요. 휴대폰에서는 사진을 길게 누른 뒤 끌어주세요.',
    detailImageLimits: 'JPG · PNG · WEBP · GIF / 대표 이미지와 합쳐 최대 ',
    imageAutoplay: '가게 상세의 사진을 자동으로 넘깁니다. 끄면 직접 넘길 수 있어요.',
    draft: '입력 내용과 새 이미지는 이 브라우저에만 자동 저장돼요.',
});
export const STORE_FORM_SKELETON_TOGGLES = Object.freeze([
    ['autoApprovalEnabled', '예약 자동 승인', 'ON 시 예약 요청이 즉시 확정됩니다'],
    ['allowLatePayment', '나중 결제 허용', '예약금이 있어도 나중에 결제 가능'],
    ['allowDuplicateReservation', '중복 예약 허용', 'OFF 시 한 손님은 같은 날 1건만 (한 건에 여러 명은 가능)'],
    ['emailNotificationEnabled', '예약 알림 메일', '새 예약 접수 시 이메일로 알림 받기'],
]);
