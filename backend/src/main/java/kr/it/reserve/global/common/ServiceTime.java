package kr.it.reserve.global.common;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 서비스 기준 시각(KST). <b>달력·벽시계 의미를 갖는 "지금"은 전부 여기를 거친다.</b>
 *
 * <p><b>★ 왜 필요한가 — 앱 컨테이너는 UTC 로 돈다</b>
 * {@code docker-compose-blue/green.yml} 에 {@code TZ} 를 설정하지 않아 JVM 기본 시간대가 UTC 다.
 * 그래서 아무 인자 없는 {@code LocalDate.now()} 는 <b>한국 시간 00:00~09:00 사이에 "어제"를 돌려준다.</b>
 * 아래가 실제로 그 때문에 어긋나던 곳들이다:
 * <ul>
 *   <li>예약 생성 시 "과거 시간 예약 금지" 검사 — 사용자가 고른 날짜·시각은 KST 인데 {@code now()} 는
 *       9시간 뒤처져서, <b>이미 지난 시간대의 예약이 통과</b>했다</li>
 *   <li>환불 금액 계산({@code ChronoUnit.DAYS.between(오늘, 예약일)}) — 새벽엔 하루가 더 남은 것으로
 *       계산돼 <b>정책보다 후한 환불 구간</b>이 적용됐다</li>
 *   <li>광고 노출 기간·만료 판정 — 사장님이 넣은 시작일/종료일은 KST 날짜다</li>
 * </ul>
 *
 * <p><b>★ 그럼 컨테이너에 {@code TZ=Asia/Seoul} 을 주면 되지 않나 — 안 된다.</b>
 * 그러면 {@code @CreatedDate}·{@code paidAt}·{@code deletedAt} 등 <b>이미 UTC 로 저장된 컬럼에
 * 그 시점부터 KST 값이 섞여 들어간다.</b> 같은 컬럼에 두 시간대가 공존하면 되돌릴 방법이 없다.
 * 게다가 logback 패턴이 KST 로 바뀌어, promtail 의 {@code location: UTC} 파싱까지 한 번에 깨진다
 * (2026-08-19 에 그 파이프라인을 고쳐서 배포했다 — {@code docs/technical/monitoring.md}).
 *
 * <p><b>그래서 규칙은 이것이다:</b>
 * <table border="1">
 *   <caption>시간대 선택 기준</caption>
 *   <tr><th>무엇과 비교하는가</th><th>무엇을 쓰는가</th></tr>
 *   <tr><td><b>사용자가 고른 날짜·시각</b>(예약일, 광고 기간) 또는 "오늘"</td>
 *       <td><b>{@code ServiceTime.today()} / {@code ServiceTime.now()}</b></td></tr>
 *   <tr><td><b>DB 에 저장된 타임스탬프</b>(createdAt, expiresAt, suspendedUntil …)</td>
 *       <td>인자 없는 {@code LocalDateTime.now()} — 저장할 때도 같은 시계를 썼으므로 일관된다</td></tr>
 * </table>
 *
 * <p>후자를 KST 로 바꾸면 <b>오히려 기존 데이터와 9시간 어긋난다.</b>
 * {@code ReservationService#undo} 와 {@code ReservationExpiryScheduler} 가 그래서 의도적으로
 * 인자 없는 {@code now()} 를 쓴다 — 각 호출부 주석에 이유를 적어두었으니 지우지 말 것.
 *
 * <p>예전엔 이 상수가 {@code ReservationElapsedScheduler} 와 {@code QrCheckinTokenProvider} 에
 * 각각 복사돼 있었고, 규칙은 그 두 파일의 주석에만 있었다. 주석은 강제력이 0이라 나머지 열 몇 곳이
 * 조용히 어긋나 있었다. 관문을 하나로 모은다(CLAUDE.md "설계 원칙").
 */
public final class ServiceTime {

    /** 서비스 기준 시간대. 이 값을 바꿀 일이 생기면 위 표의 "무엇과 비교하는가"부터 다시 볼 것. */
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
}
