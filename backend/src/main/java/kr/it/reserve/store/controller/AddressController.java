package kr.it.reserve.store.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * 카카오 로컬 API 프록시
 * - 프론트 CORS 우회 + API 키 서버 보관
 * - GET /api/address/search?query=서울 강남
 */
@Slf4j
@RestController
@RequestMapping("/api/address")
@RequiredArgsConstructor
public class AddressController {

    private final RestTemplate restTemplate;
    private final RateLimiter rateLimiter;

    @Value("${kakao.rest-api-key:}")
    private String kakaoRestApiKey;

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchAddress(
            @RequestParam String query,
            @RequestParam(defaultValue = "10") int size,
            HttpServletRequest httpRequest) {
        // 2026-07 전수조사: 이 엔드포인트는 서버 보관 Kakao REST 키로 카카오 API를 대신 호출해준다.
        // 로그인은 필요하지만 계정 하나만 있으면 우리 카카오 쿼터를 무제한 소진시킬 수 있어서
        // 다른 비용성 엔드포인트(이메일 발송 등)와 동일하게 IP 기준 rate limit을 건다.
        String ip = IpExtractor.extract(httpRequest);
        if (!rateLimiter.tryConsume(ip, RateLimiter.Policy.ADDRESS_SEARCH)) {
            throw new StoreException("주소 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        Map<String, Object> empty = Map.of("documents", List.of());

        if (query == null || query.trim().length() < 2) {
            return ResponseEntity.ok(ApiResponse.success(empty, "검색어가 너무 짧습니다."));
        }
        // size 최대 10개 제한
        int safeSize = Math.min(Math.max(size, 1), 10);
        if (kakaoRestApiKey == null || kakaoRestApiKey.isBlank()) {
            log.warn("KAKAO_REST_API_KEY is not configured");
            return ResponseEntity.ok(ApiResponse.success(empty, "API 키가 설정되지 않았습니다."));
        }

        try {
            // fromHttpUrl은 Spring 6.2에서 deprecated — 빌드 로그의 "deprecated API" 경고 출처였다.
            // fromUriString은 http/https 검증만 빠질 뿐 동작이 같고, 여기서는 호스트가 상수라 무관하다.
            URI uri = UriComponentsBuilder
                    .fromUriString("https://dapi.kakao.com/v2/local/search/address.json")
                    .queryParam("query", query.trim())
                    .queryParam("size", safeSize)
                    .encode()
                    .build()
                    .toUri();

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "KakaoAK " + kakaoRestApiKey);

            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = restTemplate.exchange(
                    uri, HttpMethod.GET, new HttpEntity<>(headers), Map.class);

            @SuppressWarnings("unchecked")
            Map<String, Object> body = (Map<String, Object>) response.getBody();
            return ResponseEntity.ok(ApiResponse.success(body != null ? body : empty, ""));

        } catch (Exception e) {
            log.error("Kakao address search failed: query={}, error={}", query, e.getMessage());
            return ResponseEntity.ok(ApiResponse.success(empty, "주소 검색에 실패했습니다."));
        }
    }
}
