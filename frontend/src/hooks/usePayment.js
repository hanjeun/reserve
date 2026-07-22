import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import paymentService from '../services/paymentService';
import useMessage from './useMessage';
import { guardPaymentWindow } from '../utils/paymentWindowGuard';

// 흐름: prepare → IMP.request_pay → verify → /payment/result 리다이렉트
const usePayment = () => {
    const navigate  = useNavigate();
    const { message } = useMessage();
    const [paying, setPaying] = useState(false);

    const pay = useCallback(async (reservation, buyer) => {
        if (!window.IMP) {
            message.error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
            return { success: false };
        }

        setPaying(true);
        try {
            // 1. 서버에서 merchantUid 발급
            const prepared = await paymentService.prepare({
                reservationId: reservation.id,
                amount:        reservation.depositAmount,
                productName:   `${reservation.storeName} 노쇼 예약금`,
                buyerName:     buyer.name,
                buyerEmail:    buyer.email,
                buyerTel:      buyer.phone || '',
                pgProvider:    'kakaopay',
            });

            const { merchantUid, impCode, amount, productName,
                    buyerName, buyerEmail, buyerTel } = prepared;

            window.IMP.init(impCode);

            return await new Promise((resolve) => {
                const guard = guardPaymentWindow(() => { setPaying(false); resolve({ success: false, cancelled: true }); });
                window.IMP.request_pay(
                    {
                        // V1 SDK + V2 채널 혼용 — pg, channel_key 둘 다 필요
                        pg:           'kakaopay.TC0ONETIME',
                        channel_key:  import.meta.env.VITE_PORTONE_CHANNEL_KEY,
                        pay_method:   'kakaopay',
                        merchant_uid: merchantUid,
                        name:         productName,
                        amount,
                        buyer_name:   buyerName,
                        buyer_email:  buyerEmail,
                        buyer_tel:    buyerTel || '010-0000-0000',
                        m_redirect_url: `${window.location.origin}/api/payment/mobile-redirect`,  // 모바일 결제 후 백엔드 리다이렉트
                    },
                    async (rsp) => {
                        guard.markSettled();
                        if (rsp.success) {
                            // 2. 결제 검증
                            try {
                                await paymentService.verify({
                                    impUid:        rsp.imp_uid,
                                    merchantUid:   rsp.merchant_uid,
                                    reservationId: reservation.id,
                                });
                                navigate(
                                    `/payment/result?success=true` +
                                    `&merchant_uid=${rsp.merchant_uid}` +
                                    `&imp_uid=${rsp.imp_uid}` +
                                    `&reservation_id=${reservation.id}`
                                );
                                resolve({ success: true });
                            } catch (err) {
                                const msg = typeof err === 'string' ? err : '결제 검증에 실패했습니다.';
                                navigate(
                                    `/payment/result?success=false` +
                                    `&merchant_uid=${rsp.merchant_uid}` +
                                    `&error_msg=${encodeURIComponent(msg)}`
                                );
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
            const msg = typeof err === 'string' ? err : '결제 준비에 실패했습니다.';
            message.error(msg);
            setPaying(false);
            return { success: false };
        }
    }, [navigate, message]);

    return { pay, paying };
};

export default usePayment;
