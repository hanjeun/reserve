/**
 * RESERVE - 폼 검증 유틸리티
 *
 * Ant Design Form.Item의 rules 속성에 직접 사용 가능한 규칙 모음
 *
 * @example
 * import { VALIDATION_RULES } from '@/utils/validation';
 * <Form.Item name="name" rules={VALIDATION_RULES.storeName}>
 */

export const VALIDATION_RULES = {
    // 가게 관련
    storeName: [
        { required: true, message: '가게 이름을 입력해주세요' },
        { min: 2, max: 50, message: '2~50자 사이로 입력해주세요' },
    ],
    category: [
        { required: true, message: '카테고리를 선택해주세요' },
    ],
    address: [
        { required: true, message: '주소를 입력해주세요' },
        { min: 5, max: 200, message: '5~200자 사이로 입력해주세요' },
    ],
    phone: [
        { required: true, message: '연락처를 입력해주세요' },
        { pattern: /^(0\d{1,2})-?(\d{3,4})-?(\d{4})$/, message: '올바른 전화번호 형식이 아닙니다 (예: 02-1234-5678)' },
    ],
    description: [
        { max: 500, message: '최대 500자까지 입력 가능합니다' },
    ],
    noShowDeposit: [
        { type: 'number', min: 0, max: 100000, message: '0~100,000원 사이로 입력해주세요' },
    ],
    maxCapacityPerSlot: [
        { type: 'number', min: 1, max: 999, message: '1~999명 사이로 입력해주세요' },
    ],
    businessHours: [
        { required: true, message: '영업 시간을 선택해주세요' },
    ],

    // 예약 관련
    reservationDate: [
        { required: true, message: '예약 날짜를 선택해주세요' },
    ],
    reservationTime: [
        { required: true, message: '예약 시간을 선택해주세요' },
    ],
    guestCount: [
        { required: true, message: '인원 수를 입력해주세요' },
        { type: 'number', min: 1, max: 20, message: '1~20명 사이로 입력해주세요' },
    ],
    specialRequest: [
        { max: 200, message: '최대 200자까지 입력 가능합니다' },
    ],

    // 회원 관련
    // 로그인용 (형식 검사 없이 빠른 피드백)
    loginEmail: [
        { required: true, message: '이메일을 입력해주세요' },
    ],
    loginPassword: [
        { required: true, message: '비밀번호를 입력해주세요' },
    ],
    email: [
        { required: true, message: '이메일을 입력해주세요' },
        { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
    ],
    password: [
        { required: true, message: '비밀번호를 입력해주세요' },
        { min: 8, message: '비밀번호는 8자 이상이어야 합니다' },
        { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '영문과 숫자를 포함해야 합니다' },
    ],
    passwordConfirm: ({ getFieldValue }) => ([
        { required: true, message: '비밀번호 확인을 입력해주세요' },
        {
            validator: (_, value) => {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
            },
        },
    ]),
    nickname: [
        { required: true, message: '닉네임을 입력해주세요' },
        { min: 2, max: 20, message: '2~20자 사이로 입력해주세요' },
    ],

    // 리뷰 관련
    reviewTitle: [
        { required: true, message: '제목을 입력해주세요' },
        { max: 100, message: '100자 이내로 입력해주세요' },
    ],
    reviewContent: [
        { required: true, message: '내용을 입력해주세요' },
        { min: 10, max: 1000, message: '10~1000자 사이로 입력해주세요' },
    ],
};
