/**
 * PortOne(아임포트) 결제창 강제 닫힘 감지 유틸.
 *
 * 2026-07 버그 수정: 카카오페이 결제창(팝업/새 탭)에서 사용자가 안내된 "취소" 버튼이 아니라
 * 브라우저 창 자체의 X(닫기)를 눌러버리면, IMP.request_pay에 넘긴 콜백이 아예 호출되지 않는
 * 경우가 있다. usePayment/useAdPayment 둘 다 이 콜백이 와야만 Promise를 resolve하고 로딩
 * 상태(paying/payingId)를 풀어주는 구조라, 콜백이 영영 안 오면 "결제하기" 버튼이 새로고침
 * 전까지 계속 로딩 스피너로 멈춰있는 것처럼 보였다.
 *
 * 완벽하게 감지할 방법은 없어서(브라우저가 팝업 close 이벤트를 부모 창에 안전하게 알려주지
 * 않음), 실무에서 흔히 쓰는 근사 신호를 사용한다: 메인 창이 다시 포커스를 받았는데 일정
 * 시간(FOCUS_GRACE_MS) 안에도 IMP 콜백이 안 왔다면 결제창이 닫힌 것으로 보고 강제로
 * "취소됨"으로 처리한다. 실제 콜백이 그 사이 도착하면 그게 우선하고(settle은 한 번만 발생),
 * 이 타이머는 아무 효과도 내지 않는다.
 *
 * 사용법:
 *   const guard = guardPaymentWindow(() => resolve({ success: false, cancelled: true }));
 *   window.IMP.request_pay({...}, (rsp) => {
 *       guard.markSettled();   // 콜백이 실제로 왔으니 강제 해제 타이머 무효화
 *       ...
 *   });
 */
const FOCUS_GRACE_MS = 1200;

export const guardPaymentWindow = (onForceCancel) => {
    let settled = false;

    const handleFocus = () => {
        // 결제창이 닫히는 시점과 focus 이벤트 사이, 그리고 실제 IMP 콜백이 도착하는 시점 사이엔
        // 약간의 시간차가 있을 수 있어 즉시 판단하지 않고 유예를 둔다.
        window.setTimeout(() => {
            if (!settled) onForceCancel();
        }, FOCUS_GRACE_MS);
    };

    window.addEventListener('focus', handleFocus);

    return {
        markSettled: () => {
            settled = true;
            window.removeEventListener('focus', handleFocus);
        },
    };
};
