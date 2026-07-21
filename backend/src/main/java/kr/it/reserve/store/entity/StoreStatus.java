package kr.it.reserve.store.entity;

public enum StoreStatus {
    ACTIVE,     // 정상 영업
    SUSPENDED,  // 기간 영업정지 (suspendedUntil까지)
    BANNED      // 영구 폐업 처리
}
