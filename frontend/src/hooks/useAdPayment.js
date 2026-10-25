import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PortOne from '@portone/browser-sdk/v2';
import adService from '../services/adService';
import useMessage from './useMessage';
import { invalidateAdData } from './invalidateAfterWrite';

/*
 * 광고 결제 결과는 PC 검증 또는 모바일 리다이렉트의 서버 검증으로 확정한다. 실패·취소도 결과 객체이므로 mutation 완료만으로 결제 성공을 판단하지 않는다.
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
                // 인터셉터가 던진 Error의 message를 사용자 오류 안내에 사용한다.

                message.error(err instanceof Error ? err.message : '광고 신청에 실패했어요.');
                return { success: false };
            }
        },
        onSuccess: invalidateMyAds,
    });

    // 결제 대기·실패 상태의 기존 광고는 결제창을 다시 열 수 있다.
    const payExistingMutation = useMutation({
        mutationFn: async (adId) => {
            try {
                const prepared = await adService.preparePayment(adId);
                return await runPayment(prepared);
            } catch (err) {

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
