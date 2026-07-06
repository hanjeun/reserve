package com.reserve.advertisement.entity;

/**
 * 광고 상품 종류
 * BADGE  - 저가형: StoreList 카드에 "광고" 배지만 표시 (이미지 불필요)
 * BANNER - 고가형: 사업자가 직접 디자인한 배너 이미지, 우측 하단 플로팅 위젯으로 노출
 */
public enum AdType {
    BADGE,
    BANNER
}
