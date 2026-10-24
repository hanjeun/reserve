package kr.it.reserve.global.common;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * 예약·광고처럼 사용자가 선택한 달력 날짜와 시각을 KST 기준으로 계산한다.
 * <p>운영 DB에 UTC로 저장한 createdAt·expiresAt 등의 비교에는 저장 기준 시계를 유지한다.
 * 표시용 변환은 toServiceZone에서 수행하며, 이 구분을 대신해 컨테이너 TZ를 바꾸지 않는다.
 * 전역 시간대 변경은 기존 타임스탬프와 로그의 시간 규약에 영향을 준다.
 */
public final class ServiceTime {

    /** 예약 달력과 광고 날짜 계산이 공유하는 KST 시간대. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private ServiceTime() {
    }

    /** 한국 기준 오늘 날짜. 사용자가 고른 날짜와 비교할 때 쓴다. */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    /** 한국 기준 현재 시각. 사용자가 고른 날짜·시각과 비교할 때 쓴다. */
    public static LocalDateTime now() {
        return LocalDateTime.now(ZONE);
    }

    /** DB에 UTC로 저장한 타임스탬프를 API 표시용 한국 시각으로 바꾼다. */
    public static LocalDateTime toServiceZone(LocalDateTime storedUtc) {
        if (storedUtc == null) return null;
        return storedUtc.atZone(ZoneOffset.UTC).withZoneSameInstant(ZONE).toLocalDateTime();
    }
}
