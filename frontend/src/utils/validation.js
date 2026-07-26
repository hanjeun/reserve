/**
 * RESERVE - 폼 검증 유틸리티
 *
 * Ant Design Form.Item의 rules 속성에 직접 사용 가능한 규칙 모음.
 *
 * [UX 원칙]
 * 빈 값(undefined / null / '')은 pattern/format 검사를 건너뛴다.
 * → 필드를 지우면 "형식 오류" 메시지가 사라지고 "필수 입력" 메시지로 자연스럽게 전환된다.
 * → required: true 규칙이 빈 값 처리를 전담한다.
 *
 * @example
 * import { VALIDATION_RULES } from '@/utils/validation';
 * <Form.Item name="name" rules={VALIDATION_RULES.storeName}>
 */

// 빈 값이면 즉시 resolve — required 규칙이 빈 값 담당
const skipIfEmpty = (fn) => (_, value) =>
    !value || value === '' ? Promise.resolve() : fn(value);

// 이메일 형식 — 예전엔 이 정규식이 여기·InquiryModal·MailboxTab 3곳에 똑같이 복붙돼 있어
// 한 곳만 고치면 서로 어긋나는 구조였다 — 여기로 통합하고 다른 두 곳은 import해서 쓴다.
//
// 도메인 쪽 문자 클래스에서 '.'을 제외해 앞뒤가 겹치지 않게 만든 형태다.
// 예전 형태 /^[^\s@]+@[^\s@]+\.[^\s@]+$/는 '.'이 양쪽 [^\s@]+에 모두 포함돼서, 매칭에
// 실패할 때 나눌 수 있는 경계를 전부 되짚는 백트래킹이 길이에 대해 초선형으로 늘어난다(SonarCloud 지적).
// 부수 효과: 'a@b..c'처럼 점이 연속되거나 'a@b.c.'처럼 끝에 오는 값은 이제 거부된다(예전엔 통과).
export const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export const VALIDATION_RULES = {
    // ─── 가게 관련 ────────────────────────────────────────────────────────────
    storeName: [
        { required: true, message: '가게 이름을 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                v.length >= 2 && v.length <= 50
                    ? Promise.resolve()
                    : Promise.reject(new Error('2~50자 사이로 입력해주세요'))
            ),
        },
    ],
    category: [
        { required: true, message: '카테고리를 선택해주세요' },
    ],
    address: [
        { required: true, message: '주소를 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                v.length >= 5 && v.length <= 200
                    ? Promise.resolve()
                    : Promise.reject(new Error('주소를 더 정확히 입력해주세요 (5~200자)'))
            ),
        },
    ],
    phone: [
        { required: true, message: '연락처를 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                /^(0\d{1,2})-?(\d{3,4})-(\d{4})$/.test(v)
                    ? Promise.resolve()
                    : Promise.reject(new Error('올바른 전화번호 형식이 아닙니다 (예: 02-1234-5678)'))
            ),
        },
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

    // ─── 예약 관련 ────────────────────────────────────────────────────────────
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

    // ─── 회원 관련 ────────────────────────────────────────────────────────────
    loginEmail: [
        { required: true, message: '이메일을 입력해주세요' },
    ],
    loginPassword: [
        { required: true, message: '비밀번호를 입력해주세요' },
    ],
    email: [
        { required: true, message: '이메일을 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                EMAIL_REGEX.test(v)
                    ? Promise.resolve()
                    : Promise.reject(new Error('올바른 이메일 형식이 아닙니다'))
            ),
        },
    ],
    password: [
        { required: true, message: '비밀번호를 입력해주세요' },
        {
            validator: skipIfEmpty((v) => {
                if (v.length < 8)
                    return Promise.reject(new Error('비밀번호는 8자 이상이어야 합니다'));
                if (!/^(?=.*[a-zA-Z])(?=.*\d)/.test(v))
                    return Promise.reject(new Error('영문과 숫자를 포함해야 합니다'));
                return Promise.resolve();
            }),
        },
    ],
    // Ant Design rules 배열에서 두 번째 원소로 함수 형태 지원 (form 컨텍스트 주입)
    // 사용: <Form.Item rules={VALIDATION_RULES.passwordConfirm} dependencies={['password']}>
    passwordConfirm: [
        { required: true, message: '비밀번호 확인을 입력해주세요' },
        ({ getFieldValue }) => ({
            validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
            },
        }),
    ],
    nickname: [
        { required: true, message: '닉네임을 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                v.length >= 2 && v.length <= 20
                    ? Promise.resolve()
                    : Promise.reject(new Error('2~20자 사이로 입력해주세요'))
            ),
        },
    ],

    // ─── 리뷰 관련 ────────────────────────────────────────────────────────────
    reviewTitle: [
        { required: true, message: '제목을 입력해주세요' },
        {
            validator: skipIfEmpty((v) =>
                v.length <= 100
                    ? Promise.resolve()
                    : Promise.reject(new Error('100자 이내로 입력해주세요'))
            ),
        },
    ],
    reviewContent: [
        { required: true, message: '내용을 입력해주세요' },
        {
            validator: skipIfEmpty((v) => {
                if (v.length < 10) return Promise.reject(new Error('10자 이상 입력해주세요'));
                if (v.length > 1000) return Promise.reject(new Error('1000자 이내로 입력해주세요'));
                return Promise.resolve();
            }),
        },
    ],
};
