package kr.it.reserve.store.event;

/** 폐업의 같은 트랜잭션에서 소식 연결을 숨긴다. 예약·결제 원장은 변경하지 않는다. */
public record StoreClosed(Long storeId) {}
