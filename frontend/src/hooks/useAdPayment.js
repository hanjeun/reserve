import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PortOne from '@portone/browser-sdk/v2';
import adService from '../services/adService';
import useMessage from './useMessage';
import { adKeys } from './queryKeys';

/**
 * 광고 결제 훅 — usePayment(예약금 결제)와 동일한 패턴, 완전히 독립된 흐름.
 * 흐름: createAd(FormData) → prepare 응답 받음 → PortOne.requestPayment → verifyPayment → 완료
 *
 * 2026-07-09: useMutation 기반으로 전환 — payingId를 별도 useState로 추적하던 걸
 * payExistingMutation.variables(마지막으로 mutate에 넘긴 adId)로 대체, 성공 시
 * adKeys.my() 쿼리를 무효화해서 AdManageTab이 별도 refetch() 호출 없이 최신 목록을 받음.
 * (내부적으로 mutationFn은 여전히 절대 throw하지 않고 {success,...} 형태로 resolve함 —
 * 결제 취소/실패는 정상적인 흐름이라 각 케이스별 메시지를 그대로 유지하기 위함)
 *
 * 2026-07 추가 — 모바일 결제 지원. 백엔드 /api/advertisements/mobile-redirect가 결제 검증까지
 * 끝낸 뒤 /payment/result?type=ad로 리다이렉트하므로, 모바일은 데스크톱과 달리 반환값이 오지 않는다
 * (페이지가 리다이렉트로 넘어가버림).
 *
 * ─── 2026-08-10 PortOne V1 → V2 전환 ────────────────────────────────────────
 * 자세한 배경은 usePayment.js 상단 주석 참고. 요약하면 V1 SDK + V2 채널키 혼용 때문에 결제가
 * V1 원장에 쌓여 **환불(취소)이 404 로 실패**하고 있었다. 광고 결제도 같은 경로라 함께 전환한다.
 * - `m_redirect_url` → `redirectUrl`, `merchant_uid` → `paymentId`, `name` → `orderName`,
 *   `amount` → `totalAmount`, `buyer_*` → `customer.*`
 * - 실패·취소는 콜백의 `rsp.success` 가 아니라 **반환값의 `code` 존재 여부**로 판별한다
 * - 리다이렉트가 일어나면 반환값이 `undefined` 다 → `payment == null` 을 먼저 거른다
 * - PC 결제창이 팝업에서 IFRAME 으로 바뀌어 `paymentWindowGuard`(focus 기반 강제취소)를 걷어냈다
 */
const useAdPayment = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    // prepared: AdPaymentPrepareResponse (createAd/preparePayment 둘 다 동일한 모양으로 응답)
    // → 결제창 오픈 + 검증까지 공통 처리
    const runPayment = useCallback(async (prepared) => {
        const { merchantUid, storeId, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;

        if (!storeId) {
            message.error('결제 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
            return { success: false };
        }

        const payment = await PortOne.requestPayment({
            storeId,
            channelKey:  import.meta.env.VITE_PORTONE_CHANNEL_KEY,
            paymentId:   merchantUid,
            orderName:   productName,
            totalAmount: amount,
            currency:    'KRW',
            payMethod:   'EASY_PAY',
            customer: {
                fullName:    buyerName,
                email:       buyerEmail,
                phoneNumber: buyerTel || undefined,
            },
            // 예약과 달리 광고는 전용 엔드포인트를 따로 둔다 — merchantUid가 Payment 테이블이 아니라
            // advertisement 테이블 자체에 있어 서로 호환되지 않는다.
            redirectUrl: `${window.location.origin}/api/advertisements/mobile-redirect`,
        });

        // 모바일: 이미 redirectUrl 로 넘어갔다.
        if (payment == null) {
            return { success: false, redirected: true };
        }

        if (payment.code !== undefined) {
            const isCancelled = payment.code === 'Cancelled'
                || (payment.message || '').includes('취소')
                || (payment.message || '').toLowerCase().includes('cancel');
            if (!isCancelled) {
                message.error(payment.message || '결제에 실패했습니다.');
            }
            return { success: false, cancelled: isCancelled };
        }

        try {
            const ad = await adService.verifyPayment(payment.paymentId);
            message.success('광고가 등록되었습니다.');
            return { success: true, ad };
        } catch (err) {
            message.error(err instanceof Error ? err.message : '결제 검증에 실패했습니다.');
            return { success: false };
        }
    }, [message]);

    const invalidateMyAds = useCallback((result) => {
        if (result?.success) queryClient.invalidateQueries({ queryKey: adKeys.my() });
    }, [queryClient]);

    const createMutation = useMutation({
        mutationFn: async (formData) => {
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
