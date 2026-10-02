import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PortOne from '@portone/browser-sdk/v2';
import paymentService from '../services/paymentService';
import useMessage from './useMessage';

/**
 * 예약금 결제 훅 — PortOne **V2**.
 *
 * 흐름: prepare → PortOne.requestPayment → (PC) verify → /payment/result
 *                                        → (모바일) redirectUrl 로 이탈, 백엔드가 검증 후 리다이렉트
 *
 * ─── 2026-08-10 V1 → V2 전환 ────────────────────────────────────────────────
 * 예전에는 V1 SDK(`cdn.iamport.kr`의 `IMP.request_pay`)에 V2 채널키를 얹어 쓰고 있었다.
 * 그 결과 결제가 **V1 원장에 쌓여서**, V2 REST API 로 조회는 되는데(`GET /payments/{id}` 200)
 * **취소만 404 PAYMENT_NOT_FOUND** 가 났다 — 즉 환불이 아예 불가능한 상태였다.
 * 백엔드 PortoneService 는 처음부터 V2 REST 라, 결제만 V2 로 들어오면 취소가 통한다.
 *
 * 알아둘 것:
 * - `redirectUrl` 만 주고 `forceRedirect` 는 주지 않는다 → **PC 는 반환값, 모바일은 리다이렉트**로
 *   포트원이 자동 분기한다. 그래서 아래 코드는 두 흐름을 모두 지원해야 한다.
 * - 리다이렉트가 일어난 경우 이 Promise 는 **`undefined` 로 resolve** 되거나 아예 resolve 되지 않는다
 *   (페이지가 이미 넘어감). `payment == null` 을 반드시 먼저 걸러야 한다.
 * - 실패·취소는 예외가 아니라 **`payment.code` 의 존재**로 판별한다. 성공 시엔 code 가 없다.
 * - 카카오페이는 PG사 자체가 간편결제사라 `easyPay.easyPayProvider` 를 비워둔다(채워도 무시됨).
 *   `currency` 는 `KRW` 외의 값을 넣으면 에러다.
 * - PC 결제창이 V1 의 **팝업**에서 V2 의 **IFRAME** 으로 바뀌었다. 그래서 창 focus 로 강제 취소를
 *   감지하던 `paymentWindowGuard` 를 걷어냈다 — iframe 은 메인 창의 포커스를 뺏지 않으므로
 *   그대로 두면 사용자가 탭을 전환했다 돌아오는 것만으로 결제가 취소 처리된다.
 *   V2 는 Promise 가 항상 settle 되므로 그 보호장치 자체가 필요 없다.
 */
const usePayment = () => {
    const navigate  = useNavigate();
    const { message } = useMessage();
    const [paying, setPaying] = useState(false);

    const pay = useCallback(async (reservation, buyer) => {
        setPaying(true);
        try {
            // 1. 서버에서 merchantUid(= V2 paymentId) 발급.
            //    ★ amount 는 서버가 가게 정책으로 다시 계산한다(PR #123). 여기서 보내는 값은 참고용이다.
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
                message.error('결제 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
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
                    message.error(payment.message || '결제에 실패했습니다.');
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
                const msg = err instanceof Error ? err.message : '결제 검증에 실패했습니다.';
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
            const msg = err instanceof Error ? err.message : '결제 준비에 실패했습니다.';
            message.error(msg);
            setPaying(false);
            return { success: false };
        }
    }, [navigate, message]);

    return { pay, paying };
};

export default usePayment;
