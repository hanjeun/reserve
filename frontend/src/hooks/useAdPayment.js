import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PortOne from '@portone/browser-sdk/v2';
import adService from '../services/adService';
import useMessage from './useMessage';
import { invalidateAdData } from './invalidateAfterWrite';

/**
 * 광고 생성·기존 광고 결제를 PortOne V2의 준비 응답으로 처리한다.
 * PC는 서버 verifyPayment, 모바일은 서버 redirect 경로에서 결제 결과를 검증한다.
 * SDK 반환값이 없으면 리다이렉트로 처리하고 code가 있으면 실패·취소로 구분한다.
 * 실패·취소도 결과 객체로 반환하므로 mutation의 onSuccess가 결제 성공을 뜻하지는 않는다.
 * 목록은 mutation 완료 후 무효화하며 진행 중인 기존 광고 ID는 mutation variables에서 읽는다.
 */
const useAdPayment = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    // prepared: AdPaymentPrepareResponse (createAd/preparePayment 둘 다 동일한 모양으로 응답)
    // → 결제창 오픈 + 검증까지 공통 처리
    const runPayment = useCallback(async (prepared) => {
        const { merchantUid, storeId, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;

        if (!storeId) {
            message.error('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
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
                message.error(payment.message || '결제에 실패했어요.');
            }
            return { success: false, cancelled: isCancelled };
        }

        try {
            const ad = await adService.verifyPayment(merchantUid);
            message.success('광고가 등록됐어요.');
            return { success: true, ad };
        } catch (err) {
            message.error(err instanceof Error ? err.message : '결제 결과 확인이 필요해요. 이미 결제됐다면 다시 결제하지 마세요.');
            return { success: false };
        }
    }, [message]);

    const invalidateMyAds = useCallback(() => {
        // SDK 취소·오류여도 신청과 미결 원장이 생성됐을 수 있다.
        // 결제가 끝나면 공개 배너·배지와 통계의 광고 요약도 바뀐다(invalidateAfterWrite.js).
        void invalidateAdData(queryClient);
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
                message.error(err instanceof Error ? err.message : '광고 신청에 실패했어요.');
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
                message.error(err instanceof Error ? err.message : '결제 준비에 실패했어요.');
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
