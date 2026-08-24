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

// 국내 전화번호 — 하이픈을 전부 넣거나 전부 빼거나, 둘 중 하나만 허용한다.
//
// 예전 형태 /^(0\d{1,2})-?(\d{3,4})-(\d{4})$/ 는 **앞 하이픈만 선택이고 뒤 하이픈은 필수**여서
// 세 곳이 서로 다른 말을 하고 있었다(실측):
//   placeholder "02-000-0000" / 에러문구 "예: 02-1234-5678" / 정규식
//   01012345678   → 거부   (가장 흔하게 치는 형태인데 막혔다)
//   0101234-5678  → 통과   (아무도 이렇게 쓰지 않는데 뚫렸다)
// 어느 쪽도 의도가 아니었다.
//
// 자릿수: 지역번호 0X~0XX + 국번 3~4 + 번호 4 → 하이픈 없이는 총 9~11자리.
// (02-123-4567 같은 서울 7자리 국번도 두 형태 모두에서 통과한다)
export const PHONE_REGEX = /^(?:0\d{1,2}-\d{3,4}-\d{4}|0\d{8,10})$/;

/**
 * dayjs 시간값 → "HH:mm" 문자열.
 *
 * 시각 비교를 dayjs 의 isBefore/isSame 대신 문자열로 하는 이유 — TimePicker 값은 날짜 부분이
 * 서로 다를 수 있어서(오늘 만든 값과 폼 초기화 때 만든 값) 날짜까지 포함해 비교하면
 * 같은 시각인데 다르다고 나온다. "HH:mm" 은 사전순 비교가 곧 시각순 비교라 안전하다.
 */
const toHm = (v) => (v && typeof v.format === 'function' ? v.format('HH:mm') : String(v ?? ''));

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
                PHONE_REGEX.test(String(v).trim())
                    ? Promise.resolve()
                    : Promise.reject(new Error('전화번호를 02-1234-5678 또는 0212345678 형식으로 입력해주세요'))
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
    // ★ InputNumber 의 min/max 만 두면 범위를 벗어난 값이 **조용히 잘려서 저장**된다.
    //   500 을 넣고 제출하면 에러 없이 365 로 바뀌어 들어가고, 사용자는 한참 뒤에 발견한다.
    //   clamp 는 UI 편의일 뿐 검증이 아니므로 rules 로 따로 막는다.
    maxAdvanceBookingDays: [
        { type: 'number', min: 1, max: 365, message: '1~365일 사이로 입력해주세요' },
    ],
    // 영업시간 — AntD RangePicker 는 두 값의 순서를 알아서 맞춰주므로 "마감이 오픈보다 앞"은
    // 사실상 안 나온다. 그런데 **같은 시각**은 통과한다. 길이가 0인 영업시간은 슬롯이 하나도
    // 안 나와서, 저장은 성공하는데 손님 쪽 예약 가능 시간이 0개가 된다(백엔드도 같은 이유로 거절).
    businessHours: [
        { required: true, message: '영업 시간을 선택해주세요' },
        {
            validator: (_rule, value) => {
                if (!value || !value[0] || !value[1]) return Promise.resolve();
                if (toHm(value[0]) === toHm(value[1])) {
                    return Promise.reject(new Error('오픈과 마감이 같습니다. 영업 시간을 확인해주세요'));
                }
                return Promise.resolve();
            },
        },
    ],

    // 브레이크 타임 — 영업시간 **안**에 있어야 한다.
    //
    // ★ 다른 필드(times)를 봐야 해서 함수 형태의 rule 을 쓴다. AntD 는 rules 배열 안의 함수에
    //   form 인스턴스를 넘겨주므로 getFieldValue 로 영업시간을 읽을 수 있다.
    //   상수 배열로는 표현할 수 없는 유일한 검증이라 여기만 모양이 다르다.
    //
    // ★ 한쪽만 고른 경우는 여기서 막지 않는다 — 서버가 양쪽을 지운다.
    //   "브레이크를 지우는 중"인 정상적인 조작 과정이라 에러를 띄우면 오히려 방해가 된다.
    breakTimes: [
        ({ getFieldValue }) => ({
            validator: (_rule, value) => {
                if (!value || !value[0] || !value[1]) return Promise.resolve();

                const bs = toHm(value[0]);
                const be = toHm(value[1]);
                if (bs === be) {
                    return Promise.reject(new Error('브레이크 시작과 종료가 같습니다'));
                }

                const times = getFieldValue('times');
                if (!times || !times[0] || !times[1]) return Promise.resolve();

                const open = toHm(times[0]);
                const close = toHm(times[1]);
                if (bs < open || be > close) {
                    return Promise.reject(
                        new Error(`브레이크 타임은 영업시간(${open}~${close}) 안에 있어야 합니다`));
                }
                return Promise.resolve();
            },
        }),
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
