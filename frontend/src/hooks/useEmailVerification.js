import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../api/axios';
import useMessage from './useMessage';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'reserve_email_verify'; // { endTime: number, email: string }
const clearStorage = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 저장소 제한은 인증을 막지 않는다. */ }
};

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

    const [restored] = useState(() => {
        const stored = getStoredState();
        const remaining = stored?.endTime ? calcRemaining(stored.endTime) : 0;
        return { stored, remaining: Number.isFinite(remaining) ? remaining : 0 };
    });
    const [isCodeSent,    setIsCodeSent]   = useState(restored.remaining > 0);
    const [isVerified,    setIsVerified]   = useState(false);
    const [sendLoading,   setSendLoading]  = useState(false);
    const [verifyLoading, setVerifyLoading]= useState(false);
    const [timeLeft,      setTimeLeft]     = useState(restored.remaining);

    const timerRef   = useRef(null);
    const endTimeRef = useRef(null); // visibilitychange 핸들러에서 참조
    const sentEmailRef = useRef(restored.stored?.email ?? null);
    const proofRef = useRef(null); // 가입 증명은 메모리에만 보관한다.
    const requestVersionRef = useRef(0);
    const sendBusyRef = useRef(false);
    const verifyBusyRef = useRef(false);
    const mountedRef = useRef(false);

    const expireVerification = useCallback(() => {
        clearInterval(timerRef.current);
        proofRef.current = null;
        setIsVerified(false);
        clearStorage();
    }, []);

    // ── 타이머 시작 (절대 시간 기반) ──────────────────────────────────────────
    // setInterval이 아니라 Date.now()와 endTime을 매번 비교한다.
    // 브라우저가 탭을 백그라운드에서 throttling해도, 다시 활성화되는 순간
    // 남은 시간이 실제 경과량만큼 단숨에 줄어들어 서버 시간과 동기화된다.
    const startTimer = (endTime) => {
        endTimeRef.current = endTime;
        clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            const rem = calcRemaining(endTimeRef.current);
            setTimeLeft(rem);
            if (rem <= 0) expireVerification();
        }, 1000);
    };

    // ── 마운트: localStorage 복원 ─────────────────────────────────────────────
    // 모바일 OS가 탭을 메모리에서 날리거나, 이메일 확인 후 브라우저로 복귀할 때
    // endTime이 localStorage에 남아있으면 상태를 그대로 복원한다.
    useEffect(() => {
        mountedRef.current = true;
        const stored = restored.stored;
        if (stored?.endTime) {
            const remaining = calcRemaining(stored.endTime);
            if (remaining > 0) {
                if (stored.email) form?.setFieldValue(emailFieldName, stored.email);
                startTimer(stored.endTime);
            } else {
                // 만료된 항목 즉시 제거
                clearStorage();
            }
        }
        return () => {
            mountedRef.current = false;
            requestVersionRef.current += 1;
            proofRef.current = null;
            clearInterval(timerRef.current);
        };
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
            if (rem <= 0) expireVerification();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [expireVerification]);

    // ── 코드 발송 ─────────────────────────────────────────────────────────────
    const sendCode = async () => {
        if (!mountedRef.current || sendBusyRef.current) return;
        sendBusyRef.current = true;
        const version = ++requestVersionRef.current;
        let email;
        try {
            await form.validateFields([emailFieldName]);
            if (!mountedRef.current || version !== requestVersionRef.current) return;
            email = form.getFieldValue(emailFieldName)?.trim();
            proofRef.current = null;
            setIsVerified(false);
            setSendLoading(true);
            const response = await api.post(sendEndpoint, { email });
            if (version !== requestVersionRef.current || form.getFieldValue(emailFieldName)?.trim() !== email) return;
            const endTime = Date.parse(response?.expiresAt);
            if (!Number.isFinite(endTime) || endTime <= Date.now()) {
                throw new Error('인증 시간이 만료됐어요. 다시 발송해주세요.');
            }

            sentEmailRef.current = email;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ endTime, email })); } catch { /* 메모리에서 계속 진행한다. */ }

            setIsCodeSent(true);
            setTimeLeft(calcRemaining(endTime));
            startTimer(endTime);
            message.success('인증 코드를 발송했어요.');
        } catch (err) {
            if (!mountedRef.current || version !== requestVersionRef.current
                || (email && form.getFieldValue(emailFieldName)?.trim() !== email)) return;
            if (!err?.errorFields) {
                const msg = typeof err === 'string' ? err : err?.message;
                message.error(msg || '발송에 실패했어요.');
            }
        } finally {
            sendBusyRef.current = false;
            if (mountedRef.current) setSendLoading(false);
        }
    };

    // ── 코드 검증 ─────────────────────────────────────────────────────────────
    const verifyCode = async () => {
        if (!mountedRef.current || verifyBusyRef.current || sendBusyRef.current) return;
        // 이 화면은 AntD Form 을 쓰므로 인라인 에러도 Form 의 기계(setFields)로 붙인다.
        // FormField 의 error prop 과 섞으면 같은 칸에 에러가 두 군데서 렌더된다 —
        // 판단 기준은 "이 입력칸이 <Form> 안에 있는가" 하나다.
        const setCodeError = (msg) => form.setFields([{ name: codeFieldName, errors: [msg] }]);

        if (!endTimeRef.current || Date.now() >= endTimeRef.current) {
            expireVerification();
            return setCodeError('인증 시간이 만료됐어요. 재발송해주세요.');
        }
        const email = form.getFieldValue(emailFieldName)?.trim();
        const code  = form.getFieldValue(codeFieldName)?.trim();
        if (email !== sentEmailRef.current) return setCodeError('이메일이 바뀌었어요. 코드를 다시 발송해주세요.');
        if (!code) return setCodeError('인증번호를 입력해주세요.');

        verifyBusyRef.current = true;
        const version = requestVersionRef.current;
        setVerifyLoading(true);
        try {
            const response = await api.post(verifyEndpoint, { email, code });
            if (version !== requestVersionRef.current || form.getFieldValue(emailFieldName)?.trim() !== email) return;
            const endTime = Date.parse(response?.expiresAt);
            if (!Number.isFinite(endTime) || endTime <= Date.now() || !/^[A-Za-z0-9_-]{43}$/.test(response?.verificationTicket ?? '')) {
                expireVerification();
                return setCodeError('이메일 인증을 다시 진행해주세요.');
            }
            proofRef.current = { email, ticket: response.verificationTicket };
            setIsVerified(true);
            setTimeLeft(calcRemaining(endTime));
            startTimer(endTime); // 인증 성공으로 원래 유효기간이 늘어나지 않는다.
            clearStorage();
            message.success('인증됐어요.');
            onVerified?.(email);
        } catch (err) {
            if (version !== requestVersionRef.current || form.getFieldValue(emailFieldName)?.trim() !== email) return;
            const msg = typeof err === 'string' ? err : err?.message;
            // 인증번호 오류는 특정 칸에 귀속되는 오류라 토스트가 아니라 칸 아래에 붙인다.
            setCodeError(msg || '인증번호가 올바르지 않아요.');
        } finally {
            verifyBusyRef.current = false;
            if (mountedRef.current) setVerifyLoading(false);
        }
    };

    const getVerificationTicket = () => {
        if (!mountedRef.current) return null;
        const proof = proofRef.current;
        if (!proof || Date.now() >= endTimeRef.current || proof.email !== form.getFieldValue(emailFieldName)?.trim()) {
            expireVerification();
            return null;
        }
        return proof.ticket;
    };

    // ── timerInfo (렌더링용) ──────────────────────────────────────────────────
    let timerInfo = null;
    if (timeLeft > 0) timerInfo = { text: `${isVerified ? '가입까지 남은 시간' : '남은 시간'} ${formatTimer(timeLeft)}`, isWarning: timeLeft <= 60 };
    else if (isCodeSent) timerInfo = { text: '시간 만료 — 재발송해주세요', isWarning: true };

    return {
        isCodeSent, isVerified,
        sendLoading, verifyLoading,
        timeLeft,
        sendCode, verifyCode, getVerificationTicket,
        timerInfo,
        formatTimer,
    };
}
