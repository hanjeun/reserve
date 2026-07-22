import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import adService from '../services/adService';
import useMessage from './useMessage';
import { adKeys } from './queryKeys';
import { guardPaymentWindow } from '../utils/paymentWindowGuard';

/**
 * 광고 결제 훅 — usePayment(예약금 결제)와 동일한 패턴, 완전히 독립된 흐름.
 * 흐름: createAd(FormData) → prepare 응답 받음 → IMP.request_pay → verifyPayment → 완료 콜백
 *
 * 2026-07-09: useMutation 기반으로 전환 — payingId를 별도 useState로 추적하던 걸
 * payExistingMutation.variables(마지막으로 mutate에 넘긴 adId)로 대체, 성공 시
 * adKeys.my() 쿼리를 무효화해서 AdManageTab이 별도 refetch() 호출 없이 최신 목록을 받음.
 * (내부적으로 mutationFn은 여전히 절대 throw하지 않고 {success,...} 형태로 resolve함 —
 * 결제 취소/실패는 정상적인 흐름이라 각 케이스별 메시지를 그대로 유지하기 위함)
 *
 * 2026-07 추가 — m_redirect_url 추가해 모바일 결제 지원(이전엔 데스크톱 콜백만 있어서
 * 모바일에서 결제 시 포트원 SDK 자체가 "m_redirect_url이 필수입니다" 에러를 뜨우며 결제가
 * 아예 안 되고 있었다). 백엔드 /api/advertisements/mobile-redirect가 결제 검증까지 끝낸 뒤
 * /payment/result?type=ad로 리다이렉트하므로, 이 플로우는 데스크톱과 달리 콜백이
 * 안 온다(모바일은 페이지가 리다이렉트로 넘어가버려서 IMP.request_pay의 콜백이 못 불림).
 */
const useAdPayment = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    // prepared: AdPaymentPrepareResponse (createAd/preparePayment 둘 다 동일한 모양으로 응답) → IMP 결제창 오픈 + 검증까지 공통 처리
    const runPayment = useCallback((prepared) => {
        const { merchantUid, impCode, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;

        window.IMP.init(impCode);

        return new Promise((resolve) => {
            const guard = guardPaymentWindow(() => resolve({ success: false, cancelled: true }));
            window.IMP.request_pay(
                {
                    pg:           'kakaopay.TC0ONETIME',
                    channel_key:  import.meta.env.VITE_PORTONE_CHANNEL_KEY,
                    pay_method:   'kakaopay',
                    merchant_uid: merchantUid,
                    name:         productName,
                    amount,
                    buyer_name:   buyerName,
                    buyer_email:  buyerEmail,
                    buyer_tel:    buyerTel || '010-0000-0000',
                    // 모바일 결제 후 백엔드 리다이렉트 — 예약 결제(usePayment)와 같은 이유로 필수(포트원
                    // JS SDK 1.1.8+는 모바일에서 리다이렉션 방식이 강제되어 이것 없이는 결제 시작 자체가 에러남).
                    // 예약과 달리 광고는 전용 엔드포인트를 따로 둔다 — merchantUid가 Payment 테이블이 아니라
                    // advertisement 테이블 자체에 있어 서로 호환되지 않음.
                    m_redirect_url: `${window.location.origin}/api/advertisements/mobile-redirect`,
                },
                async (rsp) => {
                    guard.markSettled();
                    if (rsp.success) {
                        try {
                            const ad = await adService.verifyPayment(rsp.merchant_uid);
                            message.success('광고가 등록되었습니다.');
                            resolve({ success: true, ad });
                        } catch (err) {
                            message.error(typeof err === 'string' ? err : '결제 검증에 실패했습니다.');
                            resolve({ success: false });
                        }
                    } else {
                        const isCancelled = !rsp.error_msg
                            || rsp.error_msg.includes('취소')
                            || rsp.error_msg.includes('cancel');
                        if (!isCancelled) {
                            message.error(rsp.error_msg || '결제에 실패했습니다.');
                        }
                        resolve({ success: false, cancelled: isCancelled });
                    }
                }
            );
        });
    }, [message]);

    const invalidateMyAds = useCallback((result) => {
        if (result?.success) queryClient.invalidateQueries({ queryKey: adKeys.my() });
    }, [queryClient]);

    const createMutation = useMutation({
        mutationFn: async (formData) => {
            if (!window.IMP) {
                message.error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
                return { success: false };
            }
            try {
                const prepared = await adService.createAd(formData);
                return await runPayment(prepared);
            } catch (err) {
                // 2026-07 버그 수정: axios 인터셉터는 항상 진짜 Error 객체를 throw하는데(err instanceof Error),
                // 여기서는 typeof err === 'string'으로 검사해서 항상 false가 되고 있었다 — 그 결과 백엔드가
                // 보낸 구체적인 오류 문구(예: 이미 결제 대기 중인 신청이 있음, 노출 기간 오류 등)가 한 번도 사용자에게
                // 보이지 않고 늘 같은 뭉뚝한 fallback 문구만 떠 있었다. BusinessVerificationTab 등과 동일한 컨벤션으로 통일.
                message.error(err instanceof Error ? err.message : '광고 신청에 실패했습니다.');
                return { success: false };
            }
        },
        onSuccess: invalidateMyAds,
    });

    // 결제 대기(PENDING_PAYMENT)/실패(PAYMENT_FAILED) 상태인 기존 광고에 대해 결제창을 다시 여는 mutation — "결제" 버튼용
    const payExistingMutation = useMutation({
        mutationFn: async (adId) => {
            if (!window.IMP) {
                message.error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
                return { success: false };
            }
            try {
                const prepared = await adService.preparePayment(adId);
                return await runPayment(prepared);
            } catch (err) {
                // 위 createMutation과 동일한 이유로 err.message를 읽도록 수정(2026-07)
                message.error(err instanceof Error ? err.message : '결제 준비에 실패했습니다.');
                return { success: false };
            }
        },
        onSuccess: invalidateMyAds,
    });

    return {
        pay: createMutation.mutateAsync,
        payExisting: payExistingMutation.mutateAsync,
        paying: createMutation.isPending,
        // payingId: 어떤 행의 "결제" 버튼이 로딩 중인지 — mutation에 넘긴 adId(variables)를 그대로 재사용
        payingId: payExistingMutation.isPending ? payExistingMutation.variables : null,
    };
};

export default useAdPayment;
