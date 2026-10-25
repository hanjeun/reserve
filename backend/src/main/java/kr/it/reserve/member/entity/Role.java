package kr.it.reserve.member.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 일반 사용자·사업자·관리자 역할이며 업무별 권한은 각 관문에서 따로 확인한다. */
@Getter
@RequiredArgsConstructor
public enum Role {
    USER("일반 사용자"),
    BUSINESS("사업자"),
    ADMIN("관리자");

    private final String description;
}
