import { useState, useRef, useEffect } from 'react';
import api from '../api/axios';
import useMessage from './useMessage';

const TIMER_SEC = 5 * 60;

export default function useEmailVerification({
    sendEndpoint,
    verifyEndpoint,
    form,
    emailFieldName = 'email',
    codeFieldName = 'verificationCode',
    onVerified,
} = {}) {
    const { message } = useMessage();

    const [isCodeSent, setIsCodeSent]       = useState(false);
    const [isVerified, setIsVerified]       = useState(false);
    const [sendLoading, setSendLoading]     = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [timeLeft, setTimeLeft]           = useState(0);
    const timerRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const startTimer = () => {
        clearInterval(timerRef.current);
        setTimeLeft(TIMER_SEC);
        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) { clearInterval(timerRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const formatTimer = (sec) => {
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${m}:${s}`;
    };

    const sendCode = async () => {
        try {
            await form.validateFields([emailFieldName]);
            const email = form.getFieldValue(emailFieldName)?.trim();
            setSendLoading(true);
            await api.post(sendEndpoint, { email });
            message.success('인증 코드를 발송했습니다.');
            setIsCodeSent(true);
            setIsVerified(false);
            startTimer();
        } catch (err) {
            if (!err?.errorFields) {
                const msg = typeof err === 'string' ? err : err?.message;
                message.error(msg || '발송에 실패했습니다.');
            }
        } finally {
            setSendLoading(false);
        }
    };

    const verifyCode = async () => {
        if (timeLeft === 0) return message.warning('인증 시간이 만료되었습니다.');
        const email = form.getFieldValue(emailFieldName)?.trim();
        const code  = form.getFieldValue(codeFieldName)?.trim();
        if (!code) return message.warning('인증번호를 입력해주세요.');
        setVerifyLoading(true);
        try {
            await api.post(verifyEndpoint, { email, code });
            message.success('인증되었습니다.');
            setIsVerified(true);
            clearInterval(timerRef.current);
            onVerified?.(email);
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '인증번호가 올바르지 않습니다.');
        } finally {
            setVerifyLoading(false);
        }
    };

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
