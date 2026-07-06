import { useState, useCallback } from 'react';
import adService from '../services/adService';
import useMessage from './useMessage';

/**
 * 광고 결제 훅 — usePayment(예약금 결제)와 동일한 패턴, 완전히 독립된 흐름.
 * 흐름: createAd(FormData) → prepare 응답 받음 → IMP.request_pay → verifyPayment → 완료 콜백
 *
 * 참고: 예약 결제(usePayment)는 모바일 결제 후 서버 리다이렉트(m_redirect_url)를 지원하는데,
 * 광고는 1단계라 데스크톱 콜백 흐름만 우선 구현함. 모바일 웹뷰 결제 비중이 커지면
 * usePayment와 동일하게 리다이렉트 처리를 추가해야 함.
 */
const useAdPayment = () => {
    const { message } = useMessage();
    const [paying, setPaying] = useState(false);

    const pay = useCallback(async (formData) => {
        if (!window.IMP) {
            message.error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
            return { success: false };
        }

        setPaying(true);
        try {
            const prepared = await adService.createAd(formData);
            const { merchantUid, impCode, amount, productName, buyerName, buyerEmail, buyerTel } = prepared;

            window.IMP.init(impCode);

            return await new Promise((resolve) => {
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
                    },
                    async (rsp) => {
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
                        setPaying(false);
                    }
                );
            });
        } catch (err) {
            const msg = typeof err === 'string' ? err : '광고 신청에 실패했습니다.';
            message.error(msg);
            setPaying(false);
            return { success: false };
        }
    }, [message]);

    return { pay, paying };
};

export default useAdPayment;
