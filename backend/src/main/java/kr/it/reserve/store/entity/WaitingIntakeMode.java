package kr.it.reserve.store.entity;

import kr.it.reserve.global.error.StoreException;
import org.springframework.http.HttpStatus;

/** 고객 접수 방식. 직원의 현장 접수는 이 설정과 독립적으로 유지한다. */
public enum WaitingIntakeMode {
    OFF, ONSITE, REMOTE, BOTH;

    public boolean allowsOnsite() { return this == ONSITE || this == BOTH; }
    public boolean allowsRemote() { return this == REMOTE || this == BOTH; }

    public static WaitingIntakeMode parse(String value) {
        if (value == null) return OFF;
        try {
            return valueOf(value);
        } catch (IllegalArgumentException invalid) {
            throw new StoreException("웨이팅 접수 방식을 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
    }
}
