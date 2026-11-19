import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Flex, Modal, Typography } from 'antd';
import { InfoCircleOutlined } from '../../components/common/icons';
import api from '../../api/axios';
import { writeSessionCookies } from '../../api/sessionRefresh';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import RouteLoadingSkeleton from '../../components/layout/RouteLoadingSkeleton';
import { consumeLoginRedirect } from '../../utils/redirect';
import { rememberLoginFeedback } from '../../utils/loginFeedback';
import { oauthOutcomeMessage } from '../../utils/oauthOutcome';

const REMEMBER_LOGIN = '/api/auth/remember-login';

/*
 * 인증 뒤 현재 세션에서 유지 선택을 확인한다. 소셜 신규 가입자는 약관 동의 뒤에 경로를 소비한다.
 */
const OAuthCallback = () => {
    const { message } = useMessage();
    const navigate = useNavigate();
    const { search, state } = useLocation();
    const passkeyReturn = state?.passkeyReturn;
    const checkAuth = useAuthStore(value => value.checkAuth);
    const hasCalled = useRef(false);
    const mounted = useRef(false);
    const posting = useRef(false);
    const [offer, setOffer] = useState(null);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);

    const returnAfterLogin = useCallback(user => {
        rememberLoginFeedback(user);
        const target = consumeLoginRedirect(passkeyReturn?.path);
        if (passkeyReturn) {
            const direction = passkeyReturn.prevented && target !== '/' ? 'from-right' : 'from-left';
            navigate(target, { replace: true, state: { reserveRouteMotion: direction } });
        } else window.location.replace(target);
    }, [navigate, passkeyReturn]);

    useEffect(() => {
        mounted.current = true;
        const cleanup = () => { mounted.current = false; };
        if (hasCalled.current) return cleanup;
        hasCalled.current = true;

        const params = new URLSearchParams(search);
        if (params.get('error') === 'oauth2') {
            message.error(oauthOutcomeMessage());
            navigate('/login', { replace: true });
            return cleanup;
        }

        const finalizeLogin = async () => {
            try {
                const user = await checkAuth(true);
                if (!mounted.current) return;
                if (user?.email) {
                    if (user.termsAgreed === false) {
                        if (passkeyReturn) returnAfterLogin(user);
                        else window.location.replace(params.get('remember') === '1' ? '/signup/social?remember=1' : '/signup/social');
                        return;
                    }
                    if (params.get('remember') === '1') {
                        const { epoch } = currentSession();
                        const choice = await api.get(REMEMBER_LOGIN, { skipAuthRefresh: true, timeout: 5000 }).catch(() => null);
                        if (!mounted.current || !isCurrentSession(epoch)) return;
                        if (choice?.reference) {
                            setOffer({ user, epoch, reference: choice.reference });
                            setOpen(true);
                            return;
                        }
                    }
                    returnAfterLogin(user);
                } else {
                    throw new Error('사용자 정보가 올바르지 않아요.');
                }
            } catch {
                if (!mounted.current) return;
                console.error(passkeyReturn ? 'Passkey sign-in could not be completed' : 'OAuth sign-in could not be completed');
                message.error('로그인 정보를 가져오지 못했어요.');
                navigate('/login', { replace: true });
            }
        };
        void finalizeLogin();
        return cleanup;
    }, [checkAuth, message, navigate, passkeyReturn, returnAfterLogin, search]);

    const remember = async () => {
        if (!open || !offer || posting.current || !isCurrentSession(offer.epoch)) return;
        posting.current = true;
        setSaving(true);
        setSaveError(false);
        const accept = () => writeSessionCookies(offer.epoch, () => api.post(REMEMBER_LOGIN, { reference: offer.reference },
            { skipAuthRefresh: true, timeout: 8000 }));
        try {
            try { await accept(); }
            catch (error) {
                if (error?.status !== 401 || !isCurrentSession(offer.epoch) || !await checkAuth(true)) throw error;
                await accept();
            }
            if (mounted.current && isCurrentSession(offer.epoch)) setOpen(false);
        } catch {
            if (mounted.current && isCurrentSession(offer.epoch)) setSaveError(true);
        } finally {
            posting.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    return <>
        <div className={offer ? 'reserve-login-choice-wait' : undefined}>
            <RouteLoadingSkeleton />
        </div>
        <Modal title={<Flex align="center" gap={8}><InfoCircleOutlined aria-hidden="true" />로그인을 유지할까요?</Flex>}
            open={open} centered okText="로그인 유지" cancelText="이번만 로그인" confirmLoading={saving}
            cancelButtonProps={{ disabled: saving }} closable={!saving} keyboard={!saving} mask={{ closable: false }}
            onOk={remember} onCancel={() => { if (!posting.current) setOpen(false); }}
            afterClose={() => { if (offer && isCurrentSession(offer.epoch)) returnAfterLogin(offer.user); }}>
            <Typography.Paragraph>개인 기기에서만 로그인 유지를 사용해주세요.</Typography.Paragraph>
            {saveError && <Typography.Text type="danger" role="alert">로그인 유지를 적용하지 못했어요. 다시 시도하거나 이번만 로그인할 수 있어요.</Typography.Text>}
        </Modal>
    </>;
};

export default OAuthCallback;
