package kr.it.reserve.reservation.util;

import kr.it.reserve.global.common.ServiceTime;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 표시용 예약번호(reservationCode) 생성기.
 *
 * 형식: R-YYYYMMDD-XXXX  (예: R-20260429-A7K3)
 * - 앞: 예약 날짜(reservationDate) 기준 — 사람이 언제 예약인지 눈으로 바로 알 수 있게.
 * - 뒤: 혼동하기 쉬운 문자(0/O, 1/I 등)를 뺀 문자셋에서 SecureRandom으로 4자리.
 *
 * DB의 auto-increment id를 그대로 노출하면 전체 예약 건수가 유추되고(#1041 → "1041건째"),
 * URL/QR에서 남의 번호를 추측해 찔러볼 여지가 생기므로, 표시·대조용으로 이 코드를 별도로 둔다.
 * (실제 소유권 검증은 여전히 서버의 memberId 대조가 담당 — 이 코드는 사람이 읽는 용도.)
 *
 * 4자리 랜덤은 충돌 가능성이 있으므로(같은 날 32^4 ≈ 100만 분의 1), 저장 시 unique 제약에
 * 걸리면 재생성하는 방식으로 사용한다(ReservationService 참고).
 */
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
