/*
 * 형식 검사는 빈 값을 건너뛰고 필수 규칙이 빈 값 오류를 맡는다.
 */

// 빈 값이면 즉시 resolve — required 규칙이 빈 값 담당
const skipIfEmpty = (fn) => (_, value) =>
    !value || value === '' ? Promise.resolve() : fn(value);

// 이메일 형식 검증을 공유한다.

// 도메인 구분점을 분리해 불필요한 정규식 역추적을 줄인다.

export const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// 국내 전화번호는 하이픈을 모두 넣거나 모두 뺀 형식을 허용한다.

// 전화번호의 하이픈 유무를 허용하고 같은 숫자 형식으로 검증한다.

export const PHONE_REGEX = /^(?:0\d{1,2}-\d{3,4}-\d{4}|0\d{8,10})$/;

/*
 * 날짜가 다른 시간값도 같은 시각으로 비교하도록 HH:mm 문자열로 정규화한다.
 */
const toHm = (v) => (v && typeof v.format === 'function' ? v.format('HH:mm') : String(v ?? ''));

export const VALIDATION_RULES = {
    // 가게 관련
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
        { max: 500, message: '최대 500자까지 입력할 수 있어요' },
    ],
    noShowDeposit: [
        { type: 'number', min: 0, max: 100000, message: '0~100,000원 사이로 입력해주세요' },
    ],
    maxCapacityPerSlot: [
        { type: 'number', min: 1, max: 999, message: '1~999명 사이로 입력해주세요' },
    ],
    // 입력 범위 보정과 별개로 저장 전 검증을 적용한다.
    maxAdvanceBookingDays: [
        { type: 'number', min: 1, max: 365, message: '1~365일 사이로 입력해주세요' },
    ],
    // 직접 입력도 받는다. 서버와 같이 같은 시각·역순·자정을 넘는 범위를 거절한다.
    businessHours: [
        { required: true, message: '영업 시간을 선택해주세요' },
        {
            validator: (_rule, value) => {
                if (value && (!value[0] || !value[1])) return Promise.reject(new Error('오픈 시간과 마감 시간을 모두 선택해주세요'));
                if (!value) return Promise.resolve();
                if (toHm(value[0]) >= toHm(value[1])) {
                    return Promise.reject(new Error('마감 시간은 오픈 시간보다 뒤여야 해요. 영업 시간을 확인해주세요'));
                }
                return Promise.resolve();
            },
        },
    ],

    // 브레이크 타임 — 영업시간 **안**에 있어야 한다.

    // 다른 필드(times)를 봐야 해서 함수 형태의 rule 을 쓴다. AntD 는 rules 배열 안의 함수에
    //   form 인스턴스를 넘겨주므로 getFieldValue 로 영업시간을 읽을 수 있다.
    //   상수 배열로는 표현할 수 없는 유일한 검증이라 여기만 모양이 다르다.

    // 한쪽만 고른 경우는 여기서 막지 않는다 — 서버가 양쪽을 지운다.
    //   "브레이크를 지우는 중"인 정상적인 조작 과정이라 에러를 띄우면 오히려 방해가 된다.
    breakTimes: [
        ({ getFieldValue }) => ({
            validator: (_rule, value) => {
                if (!value?.[0] || !value[1]) return Promise.resolve();

                const bs = toHm(value[0]);
                const be = toHm(value[1]);
                if (bs >= be) {
                    return Promise.reject(new Error('브레이크 종료는 시작보다 뒤여야 해요'));
                }

                const times = getFieldValue('times');
                if (!times?.[0] || !times[1]) return Promise.resolve();

                const open = toHm(times[0]);
                const close = toHm(times[1]);
                if (bs < open || be > close) {
                    return Promise.reject(
                        new Error(`브레이크 타임은 영업시간(${open}~${close}) 안에 있어야 해요`));
                }
                return Promise.resolve();
            },
        }),
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
        { max: 200, message: '최대 200자까지 입력할 수 있어요' },
    ],

    // 회원 관련
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
                    : Promise.reject(new Error('올바른 이메일 형식이 아니에요'))
            ),
        },
    ],
    password: [
        { required: true, message: '비밀번호를 입력해주세요' },
        {
            validator: skipIfEmpty((v) => {
                if (v.length < 8 || v.length > 64)
                    return Promise.reject(new Error('비밀번호는 8~64자로 입력해주세요'));
                if (!/^(?=.*[a-zA-Z])(?=.*\d)/.test(v))
                    return Promise.reject(new Error('영문과 숫자를 포함해야 해요'));
                if (new TextEncoder().encode(v).length > 72)
                    return Promise.reject(new Error('비밀번호가 너무 길어요. 영문 기준 72자 이내로 입력해주세요'));
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
                return Promise.reject(new Error('비밀번호가 일치하지 않아요'));
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

    // 리뷰 관련
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
