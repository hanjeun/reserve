package com.reserve.member.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 사용자 권한 ENUM
 * - USER: 일반 사용자 (예약만 가능)
 * - BUSINESS: 사업자 (가게 등록/관리 + 예약 가능)
 * - ADMIN: 관리자 (모든 권한, 향후 확장용)
 */
@Getter
@RequiredArgsConstructor
public enum Role {
    USER("일반 사용자"),
    BUSINESS("사업자"),
    ADMIN("관리자");

    private final String description;
}
