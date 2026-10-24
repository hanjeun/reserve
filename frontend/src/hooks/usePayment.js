import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PortOne from '@portone/browser-sdk/v2';
import paymentService from '../services/paymentService';
import useMessage from './useMessage';

/**
 * PortOne V2 예약금 결제를 준비하고 서버 검증 결과로 이동한다.
 * PC는 SDK 반환값을 검증하고, 모바일은 redirectUrl의 서버 검증 흐름으로 이어진다.
 * 리다이렉트 시 반환값이 없을 수 있으므로 null을 먼저 처리하고 code가 있으면 실패·취소로 구분한다.
 * SDK 응답만으로 결제 성공을 확정하지 않으며 창 포커스 복귀를 취소 근거로 사용하지 않는다.
 * 결제 식별자·금액·구매자 정보는 서버 prepare 응답을 사용한다.
 */
const usePayment = () => {
    const navigate  = useNavigate();
    const { message } = useMessage();
    const [paying, setPaying] = useState(false);

    const pay = useCallback(async (reservation, buyer) => {
        setPaying(true);
        try {
            // 1. 서버에서 merchantUid(= V2 paymentId) 발급.
            //    amount 는 서버가 가게 정책으로 다시 계산한다(PR #123). 여기서 보내는 값은 참고용이다.
            const prepared = await paymentService.prepare({
                reservationId: reservation.id,
                amount:        reservation.depositAmount,
                productName:   `${reservation.storeName} 노쇼 예약금`,
                buyerName:     buyer.name,
                buyerEmail:    buyer.email,
                buyerTel:      buyer.phone || '',
                pgProvider:    'kakaopay',
            });

            const { merchantUid, storeId, amount, productName,
                    buyerName, buyerEmail, buyerTel } = prepared;

            if (!storeId) {
                message.error('결제 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
                setPaying(false);
                return { success: false };
            }

            // 2. 결제창 — PC 는 IFRAME, 모바일은 redirectUrl 로 이탈
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
                redirectUrl: `${window.location.origin}/api/payment/mobile-redirect`,
            });

            // 모바일: 이미 redirectUrl 로 넘어갔다. 여기부터는 실행되지 않거나 payment 가 없다.
            if (payment == null) {
                return { success: false, redirected: true };
            }

            // 3. 실패·취소 — V2 는 성공 시 code 를 보내지 않는다
            if (payment.code !== undefined) {
                const isCancelled = payment.code === 'Cancelled'
                    || (payment.message || '').includes('취소')
                    || (payment.message || '').toLowerCase().includes('cancel');
                if (!isCancelled) {
                    message.error(payment.message || '결제에 실패했어요.');
                }
                setPaying(false);
                return { success: false, cancelled: isCancelled };
            }

            // 4. 서버 검증
            try {
                await paymentService.verify({
                    merchantUid:   payment.paymentId,
                    reservationId: reservation.id,
                });
                // 검증이 끝났으므로 결과 페이지는 재검증하지 않는다(imp_uid 를 넘기지 않는다).
                navigate(
                    `/payment/result?success=true` +
                    `&merchant_uid=${encodeURIComponent(payment.paymentId)}` +
                    `&reservation_id=${reservation.id}`
                );
                return { success: true };
            } catch (err) {
                const msg = err instanceof Error ? err.message : '결제 검증에 실패했어요.';
                navigate(
                    `/payment/result?success=false` +
                    `&merchant_uid=${encodeURIComponent(payment.paymentId)}` +
                    `&error_msg=${encodeURIComponent(msg)}`
                );
                return { success: false };
            } finally {
                setPaying(false);
            }
        } catch (err) {
            // requestPayment 는 결제창이 뜨기 전 단계의 오류(파라미터 형식·네트워크)만 throw 한다.
            const msg = err instanceof Error ? err.message : '결제 준비에 실패했어요.';
            message.error(msg);
            setPaying(false);
            return { success: false };
        }
    }, [navigate, message]);

    return { pay, paying };
};

export default usePayment;
