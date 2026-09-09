/** 서버가 반환한 명시적 허가만 따른다. 항목 합계로 권한을 재구성하지 않는다. */
export const canCloseStore = readiness => readiness?.canClose === true;
export const canWithdrawMember = readiness => readiness?.canWithdraw === true;
