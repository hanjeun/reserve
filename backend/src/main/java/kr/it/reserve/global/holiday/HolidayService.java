package kr.it.reserve.global.holiday;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 공휴일(빨간날) 조회 — 한국천문연구원 특일 정보 API.
 *
 * <h2>★★ 이건 "색칠"이지 "판정"이 아니다.</h2>
 * 여기서 나온 날짜는 달력을 <b>빨갛게 칠하는 데만</b> 쓴다. 예약을 막는 판정은 여전히
 * {@code Store.isBookableOn} 혼자 한다. 그래서 이 서비스가 통째로 죽어도
 * <b>예약 동작은 한 글자도 안 바뀐다</b> — 달력에서 일요일만 빨갛게 나올 뿐이다.
 *
 * <p>이 성질이 아래 설계를 전부 설명한다: 실패하면 예외를 던지지 않고 빈 집합을 준다.
 * 외부 포털이 죽었다고 우리 예약 화면이 500 을 뱉으면, 안 그래도 되는 일로 장애를 사 온 것이다.
 *
 * <h2>키가 없으면 조용히 꺼진다</h2>
 * {@code holiday.api-key} 가 비어 있으면 네트워크를 아예 건드리지 않고 빈 집합을 준다.
 * 로컬에서 키 없이 띄우는 사람, CI, 테스트가 전부 그대로 돈다.
 *
 * <h2>Encoding 키 / Decoding 키</h2>
 * 공공데이터포털은 같은 키를 두 벌로 준다 — {@code %2B...%3D}(Encoding)와 {@code +...=}(Decoding).
 * 여기서 제일 많이 나는 사고가 <b>이미 인코딩된 키를 한 번 더 인코딩해서</b>({@code %2B} → {@code %252B})
 * 계속 인증 실패가 나는 것이다. 그래서 {@link #encodedKey()} 가 어느 쪽이 들어와도 맞게 만들고,
 * URI 는 항상 {@code build(true)}(이미 인코딩됨, 손대지 마라)로 만든다.
 *
 * <h2>왜 연 단위가 아니라 달 단위 캐시인가</h2>
 * 달력 API 자체가 달 단위라 키가 정확히 맞는다. {@code solMonth} 를 빼면 1년치가 온다는 얘기가
 * 돌지만 공식 문서에 있는 동작이 아니라 기대지 않는다. 한 달 = 요청 1회면 충분히 싸다.
 *
 * <p>캐시는 하루 한 번 비운다. 임시공휴일이 연중에 추가되는 일이 실제로 있어서 영구 캐시는 위험하다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HolidayService {

    private static final String ENDPOINT =
            "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

    /** 응답의 {@code locdate} 는 {@code 20260101} 꼴이다. */
    private static final DateTimeFormatter LOCDATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    /** 한 달 특일이 100개를 넘을 일은 없다. 기본값 10 이라 안 주면 잘린다. */
    private static final int NUM_OF_ROWS = 100;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${holiday.api-key:}")
    private String apiKey;

    /**
     * 달 -> 그 달의 공휴일.
     * <b>실패한 달도 빈 집합으로 캐시한다</b> — 안 그러면 포털이 죽어 있는 동안
     * 달력을 열 때마다 5~10초 타임아웃을 새로 기다린다.
     */
    private final Map<YearMonth, Set<LocalDate>> cache = new ConcurrentHashMap<>();

    public Set<LocalDate> holidaysOf(YearMonth month) {
        if (!StringUtils.hasText(apiKey)) return Set.of();
        return cache.computeIfAbsent(month, this::fetch);
    }

    /** 매일 새벽에 비운다 — 임시공휴일 지정이 반영되도록. 다른 스케줄러와 시간이 겹치지 않게 4:50. */
    @Scheduled(cron = "0 50 4 * * *")
    public void evictCache() {
        if (!cache.isEmpty()) {
            log.debug("공휴일 캐시 비움 ({}개월)", cache.size());
            cache.clear();
        }
    }

    private Set<LocalDate> fetch(YearMonth month) {
        try {
            URI uri = UriComponentsBuilder.fromUriString(ENDPOINT)
                    .queryParam("serviceKey", encodedKey())
                    .queryParam("solYear", month.getYear())
                    .queryParam("solMonth", String.format("%02d", month.getMonthValue()))
                    .queryParam("numOfRows", NUM_OF_ROWS)
                    .queryParam("_type", "json")
                    // ★ true = "값은 이미 인코딩돼 있다". 이게 없으면 %2B 가 %252B 로 망가진다.
                    .build(true)
                    .toUri();

            return parse(restTemplate.getForObject(uri, String.class));
        } catch (Exception e) {
            // 던지지 않는다 — 위 클래스 주석 참고. 달력은 그대로 뜨고 일요일만 빨갛게 나온다.
            log.warn("공휴일 조회 실패 ({}). 이번 달은 일요일만 빨갛게 표시된다: {}", month, e.toString());
            return Set.of();
        }
    }

    /**
     * Encoding 키({@code %2B...})면 그대로, Decoding 키({@code +...})면 우리가 인코딩한다.
     * {@code %} 하나로 구분되는 이유: Decoding 키는 base64 라 {@code %} 가 나올 수 없다.
     *
     * <p>이 한 줄이 없으면 어느 쪽 키를 붙여넣었는지에 따라 되기도 하고 안 되기도 한다.
     * 되는 쪽을 찾을 때까지 두 번 배포하게 되는 종류의 버그다.
     */
    private String encodedKey() {
        return apiKey.contains("%") ? apiKey : URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
    }

    /**
     * ⚠️ {@code _type=json} 을 줘도 <b>에러일 때는 XML 이 온다</b>(키 미등록, 트래픽 초과 등).
     * 그래서 JSON 인지부터 확인하고, 아니면 예외로 보내 위에서 빈 집합이 되게 한다.
     */
    private Set<LocalDate> parse(String body) throws Exception {
        if (body == null || !body.stripLeading().startsWith("{")) {
            throw new IllegalStateException("JSON 이 아닌 응답: " + abbreviate(body));
        }

        JsonNode items = objectMapper.readTree(body)
                .path("response").path("body").path("items").path("item");

        Set<LocalDate> found = new HashSet<>();
        // ★ 공공데이터포털 JSON 은 결과가 1건이면 배열이 아니라 객체를 준다. 0건이면 빈 문자열이다.
        //   배열만 가정하면 "공휴일이 하나뿐인 달"에서만 조용히 틀린다 — 제일 늦게 발견되는 종류다.
        if (items.isArray()) items.forEach(item -> collect(found, item));
        else if (items.isObject()) collect(found, items);

        return Set.copyOf(found);
    }

    /**
     * {@code isHoliday} 가 {@code "Y"} 인 것만 담는다.
     * getRestDeInfo 는 국경일도 같이 주는데 제헌절처럼 <b>빨간날이 아닌 국경일</b>이 섞여 있다.
     * 대체공휴일은 별도 항목으로 {@code Y} 를 달고 오므로 자동으로 포함된다.
     */
    private void collect(Set<LocalDate> out, JsonNode item) {
        if (!"Y".equalsIgnoreCase(item.path("isHoliday").asText())) return;
        String locdate = item.path("locdate").asText();
        if (locdate.length() != 8) return;
        out.add(LocalDate.parse(locdate, LOCDATE));
    }

    private static String abbreviate(String s) {
        if (s == null) return "null";
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= 200 ? flat : flat.substring(0, 200) + "...";
    }
}
