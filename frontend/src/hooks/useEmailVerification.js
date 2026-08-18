import { useState, useRef, useEffect } from 'react';
import api from '../api/axios';
import useMessage from './useMessage';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const TIMER_MS    = 5 * 60 * 1000;          // 5분 (절대 시간 기준)
const STORAGE_KEY = 'reserve_email_verify'; // { endTime: number, email: string }

// ─── 순수 헬퍼 ───────────────────────────────────────────────────────────────
/** localStorage에서 저장된 인증 상태를 읽어온다. 실패 시 null 반환. */
const getStoredState = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/** endTime(ms)까지 남은 초 (0 이하면 0) */
const calcRemaining = (endTime) =>
    Math.max(0, Math.floor((endTime - Date.now()) / 1000));

const formatTimer = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
};

// ─── Hook ────────────────────────────────────────────────────────────────────
export default function useEmailVerification({
    sendEndpoint,
    verifyEndpoint,
    form,
    emailFieldName = 'email',
    codeFieldName  = 'verificationCode',
    onVerified,
} = {}) {
    const { message } = useMessage();

    const [isCodeSent,    setIsCodeSent]   = useState(false);
    const [isVerified,    setIsVerified]   = useState(false);
    const [sendLoading,   setSendLoading]  = useState(false);
    const [verifyLoading, setVerifyLoading]= useState(false);
    const [timeLeft,      setTimeLeft]     = useState(0);

    const timerRef   = useRef(null);
    const endTimeRef = useRef(null); // visibilitychange 핸들러에서 참조

    // ── 타이머 시작 (절대 시간 기반) ──────────────────────────────────────────
    // setInterval이 아니라 Date.now()와 endTime을 매번 비교한다.
    // 브라우저가 탭을 백그라운드에서 throttling해도, 다시 활성화되는 순간
    // 남은 시간이 실제 경과량만큼 단숨에 줄어들어 서버 시간과 동기화된다.
    const startTimer = (endTime) => {
        endTimeRef.current = endTime;
        clearInterval(timerRef.current);
        setTimeLeft(calcRemaining(endTime));

        timerRef.current = setInterval(() => {
            const rem = calcRemaining(endTimeRef.current);
            setTimeLeft(rem);
            if (rem <= 0) {
                clearInterval(timerRef.current);
                localStorage.removeItem(STORAGE_KEY);
            }
        }, 1000);
    };

    const clearStorage = () => localStorage.removeItem(STORAGE_KEY);

    // ── 마운트: localStorage 복원 ─────────────────────────────────────────────
    // 모바일 OS가 탭을 메모리에서 날리거나, 이메일 확인 후 브라우저로 복귀할 때
    // endTime이 localStorage에 남아있으면 상태를 그대로 복원한다.
    useEffect(() => {
        const stored = getStoredState();
        if (stored?.endTime) {
            const remaining = calcRemaining(stored.endTime);
            if (remaining > 0) {
                if (stored.email) form?.setFieldValue(emailFieldName, stored.email);
                setIsCodeSent(true);
                startTimer(stored.endTime);
            } else {
                // 만료된 항목 즉시 제거
                clearStorage();
            }
        }
        return () => clearInterval(timerRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── visibilitychange: 탭 복귀 시 즉시 재계산 ─────────────────────────────
    // setInterval은 백그라운드 탭에서 최대 ~1분으로 throttling된다.
    // 이메일 앱에서 돌아오는 순간 visibilitychange 이벤트로 즉각 보정한다.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (!endTimeRef.current) return;

            const rem = calcRemaining(endTimeRef.current);
            setTimeLeft(rem);
            if (rem <= 0) {
                clearInterval(timerRef.current);
                clearStorage();
                // isCodeSent는 true 유지 → "시간 만료 — 재발송해주세요" 표시
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    // ── 코드 발송 ─────────────────────────────────────────────────────────────
    const sendCode = async () => {
        try {
            await form.validateFields([emailFieldName]);
            const email = form.getFieldValue(emailFieldName)?.trim();
            setSendLoading(true);
            await api.post(sendEndpoint, { email });
            message.success('인증 코드를 발송했습니다.');

            const endTime = Date.now() + TIMER_MS;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ endTime, email }));

            setIsCodeSent(true);
            setIsVerified(false);
            startTimer(endTime);
        } catch (err) {
            if (!err?.errorFields) {
                const msg = typeof err === 'string' ? err : err?.message;
                message.error(msg || '발송에 실패했습니다.');
            }
        } finally {
            setSendLoading(false);
        }
    };

    // ── 코드 검증 ─────────────────────────────────────────────────────────────
    const verifyCode = async () => {
        // 이 화면은 AntD Form 을 쓰므로 인라인 에러도 Form 의 기계(setFields)로 붙인다.
        // FormField 의 error prop 과 섞으면 같은 칸에 에러가 두 군데서 렌더된다 —
        // 판단 기준은 "이 입력칸이 <Form> 안에 있는가" 하나다.
        const setCodeError = (msg) => form.setFields([{ name: codeFieldName, errors: [msg] }]);

        if (timeLeft === 0) return setCodeError('인증 시간이 만료되었습니다. 재발송해주세요.');
        const email = form.getFieldValue(emailFieldName)?.trim();
        const code  = form.getFieldValue(codeFieldName)?.trim();
        if (!code) return setCodeError('인증번호를 입력해주세요.');

        setVerifyLoading(true);
        try {
            await api.post(verifyEndpoint, { email, code });
            message.success('인증되었습니다.');
            setIsVerified(true);
            clearInterval(timerRef.current);
            clearStorage(); // 인증 성공 시 localStorage 정리
            onVerified?.(email);
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            // 인증번호 오류는 특정 칸에 귀속되는 오류라 토스트가 아니라 칸 아래에 붙인다.
            setCodeError(msg || '인증번호가 올바르지 않습니다.');
        } finally {
            setVerifyLoading(false);
        }
    };

    // ── timerInfo (렌더링용) ──────────────────────────────────────────────────
    const timerInfo = isVerified
        ? null
        : timeLeft > 0
            ? { text: `남은 시간 ${formatTimer(timeLeft)}`, isWarning: timeLeft <= 60 }
            : isCodeSent
                ? { text: '시간 만료 — 재발송해주세요', isWarning: true }
                : null;

    return {
        isCodeSent, isVerified,
        sendLoading, verifyLoading,
        timeLeft,
        sendCode, verifyCode,
        timerInfo,
        formatTimer,
    };
}
