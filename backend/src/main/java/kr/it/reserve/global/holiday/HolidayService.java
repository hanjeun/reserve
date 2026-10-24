package kr.it.reserve.global.holiday;

import com.fasterxml.jackson.core.JsonProcessingException;
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
 * 한국천문연구원 API의 공휴일을 달력 표시용으로 제공한다.
 * 예약 가능 여부는 가게의 예약 규칙이 판단하며 공휴일 표시와 분리한다.
 * API 키가 없거나 조회에 실패하면 빈 집합을 반환해 달력 조회를 계속 허용한다.
 * 월별 결과를 캐시하고 임시공휴일 변경을 반영하도록 매일 비운다.
 * Encoding·Decoding 키를 모두 처리하되 URI를 만들 때 이중 인코딩하지 않는다.
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
            log.debug("Holiday cache cleared: months={}", cache.size());
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
                    // true = "값은 이미 인코딩돼 있다". 이게 없으면 %2B 가 %252B 로 망가진다.
                    .build(true)
                    .toUri();

            return parse(restTemplate.getForObject(uri, String.class));
        } catch (Exception e) {
            // 던지지 않는다 — 위 클래스 주석 참고. 달력은 그대로 뜨고 일요일만 빨갛게 나온다.
            log.warn("Holiday lookup failed; only Sundays will be highlighted: month={}, errorType={}",
                    month, e.getClass().getSimpleName());
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
     * 주의: {@code _type=json} 을 줘도 <b>에러일 때는 XML 이 온다</b>(키 미등록, 트래픽 초과 등).
     * 그래서 JSON 인지부터 확인하고, 아니면 예외로 보내 위에서 빈 집합이 되게 한다.
     */
    private Set<LocalDate> parse(String body) throws JsonProcessingException {
        if (body == null || !body.stripLeading().startsWith("{")) {
            throw new IllegalStateException("JSON 이 아닌 응답: " + abbreviate(body));
        }

        JsonNode items = objectMapper.readTree(body)
                .path("response").path("body").path("items").path("item");

        Set<LocalDate> found = new HashSet<>();
        // 공공데이터포털 JSON 은 결과가 1건이면 배열이 아니라 객체를 준다. 0건이면 빈 문자열이다.
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
