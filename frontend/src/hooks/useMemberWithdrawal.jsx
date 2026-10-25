import { useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExclamationCircleOutlined } from '../components/common/icons';
import useMessage from './useMessage';
import useAuthStore from '../store/useAuthStore';
import { memberService } from '../services';
import { canWithdrawMember } from '../utils/lifecycleReadiness';
import { handleApiError } from '../utils/errorHandler';
import { colors } from '../styles/tokens';

/* 탈퇴 실행 시 계정·역할 세션과 미결 작업을 확인한다. */
export default function useMemberWithdrawal() {
    const navigate = useNavigate();
    const { user, logout, sessionRevision } = useAuthStore();
    const { message, confirm } = useMessage();
    const [withdrawState, setWithdrawState] = useState({ scope: /** @type {string | null} */ (null), checking: false });
    const withdrawRequestRef = useRef(/** @type {{ scope: string } | null} */ (null));
    const withdrawalMountedRef = useRef(false);
    const withdrawScope = `${user?.id}:${user?.role}:${sessionRevision}`;
    const withdrawChecking = withdrawState.scope === withdrawScope && withdrawState.checking;

    useLayoutEffect(() => {
        withdrawalMountedRef.current = true;
        return () => {
            withdrawalMountedRef.current = false;
            withdrawRequestRef.current = null;
        };
    }, [withdrawScope]);

    const handleDeleteAccount = () => {
        const auth = useAuthStore.getState();
        if (!withdrawalMountedRef.current || !auth.isLoggedIn || user?.id == null || !user?.role
            || auth.sessionRevision !== sessionRevision || auth.user?.id !== user.id || auth.user?.role !== user.role
            || withdrawRequestRef.current?.scope === withdrawScope) return;
        const request = { scope: withdrawScope, sessionRevision, memberId: user.id, role: user.role, phase: 'confirm' };
        withdrawRequestRef.current = request;
        const isCurrent = () => {
            const current = useAuthStore.getState();
            return withdrawalMountedRef.current && withdrawRequestRef.current === request && current.isLoggedIn
                && current.sessionRevision === request.sessionRevision
                && current.user?.id === request.memberId && current.user?.role === request.role;
        };
        confirm({
            title: '회원 탈퇴',
            icon: <ExclamationCircleOutlined style={{ color: colors.error.main }} />,
            // 문장 단위 줄바꿈은 useMessage의 confirm 래퍼가 처리한다 — 여기선 평범한 문자열이면 된다.
            content: '로그인·연락·위치 정보는 제거되고 계정은 즉시 사용할 수 없게 돼요. 거래·환불·분쟁 대응에 필요한 기록은 비식별 상태로 보존돼요. 정말 탈퇴할까요?',
            okText: '탈퇴하기',
            cancelText: '취소',
            okButtonProps: { danger: true },
            centered: true,
            onCancel: () => {
                if (isCurrent() && request.phase !== 'deleting') {
                    setWithdrawState({ scope: withdrawScope, checking: false });
                    withdrawRequestRef.current = null;
                }
            },
            onOk: async () => {
                // 확인 전에는 조회도 시작하지 않는다. 이전 세션의 확인창은 현재 계정을 탈퇴시킬 수 없다.
                if (!isCurrent() || request.phase !== 'confirm') return;
                request.phase = 'checking';
                setWithdrawState({ scope: withdrawScope, checking: true });
                try {
                    const readiness = await memberService.getWithdrawalReadiness();
                    if (!isCurrent()) return;
                    if (typeof readiness?.canWithdraw !== 'boolean') {
                        message.error('탈퇴 준비 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
                        return;
                    }
                    if (!canWithdrawMember(readiness)) {
                        message.warning(
                            `먼저 처리할 항목이 있어요. 운영 중 가게 ${readiness?.openStores ?? 0}곳, ` +
                            `예약 ${readiness?.unresolvedReservations ?? 0}건, 환불 ${readiness?.unresolvedRefunds ?? 0}건, ` +
                            `결제 확인 ${readiness?.openPaymentIssues ?? 0}건, 웹훅 ${readiness?.unfinishedWebhooks ?? 0}건`
                        );
                        return;
                    }
                    request.phase = 'deleting';
                    await memberService.deleteMember();
                    if (!isCurrent()) return;
                    withdrawRequestRef.current = null;
                    logout();
                    // 탈퇴 → 홈: 로그아웃과 같은 방향(왼쪽에서)
                    navigate('/', { replace: true, state: { reserveRouteMotion: 'from-left' } });
                    message.success('탈퇴가 완료됐어요');
                } catch (err) {
                    if (isCurrent()) handleApiError(err, message, request.phase === 'deleting'
                        ? '탈퇴에 실패했어요' : '탈퇴 준비 상태를 확인하지 못했어요');
                } finally {
                    if (isCurrent()) {
                        setWithdrawState({ scope: withdrawScope, checking: false });
                        withdrawRequestRef.current = null;
                    }
                }
            },
        });
    };

    return { handleDeleteAccount, withdrawChecking };
}
