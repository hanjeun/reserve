package com.reserve.store.controller;

import com.reserve.global.common.ApiResponse;
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

    @Value("${kakao.rest-api-key:}")
    private String kakaoRestApiKey;

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchAddress(
            @RequestParam String query,
            @RequestParam(defaultValue = "10") int size) {
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
            URI uri = UriComponentsBuilder
                    .fromHttpUrl("https://dapi.kakao.com/v2/local/search/address.json")
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
