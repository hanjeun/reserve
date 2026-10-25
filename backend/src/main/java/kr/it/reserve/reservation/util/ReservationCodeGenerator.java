package kr.it.reserve.reservation.util;

import kr.it.reserve.global.common.ServiceTime;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/** 날짜와 임의 문자로 표시용 예약 코드를 만든다. 접근 권한은 서버가 별도로 확인하며, 코드 충돌은 DB 유일성 제약과 재생성으로 처리한다. */
public final class ReservationCodeGenerator {

    private ReservationCodeGenerator() {
    }

    // 0/O, 1/I/L 등 눈으로 혼동하기 쉬운 문자 제외
    private static final char[] ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int RANDOM_LENGTH = 4;
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 예약 날짜 기준 표시용 코드 1개 생성.
     * @param reservationDate 예약 방문 날짜 (null이면 오늘 날짜로 폴백)
     */
    public static String generate(LocalDate reservationDate) {
        // 코드에 찍히는 날짜는 사람이 읽는 한국 날짜다 — 새벽에 발급해도 "어제"로 찍히면 안 된다.
        LocalDate date = reservationDate != null ? reservationDate : ServiceTime.today();
        StringBuilder sb = new StringBuilder("R-");
        sb.append(date.format(DATE_FMT));
        sb.append('-');
        for (int i = 0; i < RANDOM_LENGTH; i++) {
            sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }
}
