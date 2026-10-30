package kr.it.reserve.store.service;

/** 공개 대기 집계만 제공하고 고객 원문은 웨이팅 모듈에 남겨요. */
public interface StoreWaitingCounts {
    long activeTeams(Long storeId);
}
