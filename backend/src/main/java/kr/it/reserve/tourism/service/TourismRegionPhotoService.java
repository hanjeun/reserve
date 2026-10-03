package kr.it.reserve.tourism.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.tourism.dto.TourismRegionPhotoResponse;
import kr.it.reserve.tourism.entity.TourismRegionPhoto;
import kr.it.reserve.tourism.repository.TourismRegionPhotoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Objects;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 지역 대표 관광 사진의 권리 관문.
 *
 * 관광정보 API의 목록은 후보를 찾는 용도이고, 실제 등록은 detailImage2의 공공누리 제1유형을
 * 확인한 뒤에만 한다. 외부 API와 이미지 호스트가 일시적으로 실패해도 기존 카탈로그와 핀 폴백은
 * 그대로 남아야 하므로 이 서비스는 빈 결과로 물러난다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TourismRegionPhotoService {

    private static final String LIST_ENDPOINT = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2";
    private static final String IMAGE_ENDPOINT = "https://apis.data.go.kr/B551011/KorService2/detailImage2";
    private static final String SOURCE_URL = "https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y";
    private static final String PROVIDER_NAME = "한국관광공사 관광정보 서비스";
    private static final String LICENSE_TYPE = "공공누리 제1유형";
    private static final int CANDIDATE_LIMIT = 4;
    private static final Duration REFRESH_AFTER = Duration.ofDays(30);
    private static final Duration FAILURE_BACKOFF = Duration.ofHours(6);
    private static final Duration IMAGE_CACHE_TTL = Duration.ofDays(1);
    private static final Duration IMAGE_FAILURE_BACKOFF = Duration.ofMinutes(1);
    private static final int IMAGE_CACHE_MAX_BYTES = 16 * 1024 * 1024;

    /** Tourism API의 고정 시도 코드. 삭제 예정인 areaCode2를 호출하지 않는다. */
    private static final Map<String, String> AREA_CODES = Map.ofEntries(
            Map.entry("서울", "1"), Map.entry("인천", "2"), Map.entry("대전", "3"),
            Map.entry("대구", "4"), Map.entry("광주", "5"), Map.entry("부산", "6"),
            Map.entry("울산", "7"), Map.entry("세종", "8"), Map.entry("경기", "31"),
            Map.entry("강원", "32"), Map.entry("충북", "33"), Map.entry("충남", "34"),
            Map.entry("경북", "35"), Map.entry("경남", "36"), Map.entry("전북", "37"),
            Map.entry("전남", "38"), Map.entry("제주", "39")
    );
    private static final Set<String> SUCCESS_CODES = Set.of("0000", "00");
    private static final Set<String> TYPE_ONE_LICENSE_CODES = Set.of(
            "TYPE1", "1", "제1유형", "공공누리제1유형", "KOGL1"
    );

    private final TourismRegionPhotoRepository repository;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final TourismImageProxyClient imageProxyClient;
    private final TourismPhotoMetrics metrics;
    private final Map<String, Instant> failedRefreshes = new ConcurrentHashMap<>();
    // 고정된 17개 시도만 관문을 통과하므로 잠금·실패 기록도 사용자 입력에 따라 늘어나지 않는다.
    private final Map<String, Object> regionLocks = new ConcurrentHashMap<>();
    private final Map<String, CachedImage> imageCache = new LinkedHashMap<>(17, 0.75f, true);
    private final Map<String, ImageFailure> failedImageLoads = new ConcurrentHashMap<>();
    private int cachedImageBytes;
    private final Clock imageCacheClock = Clock.systemUTC();

    @Value("${tourism.api.service-key:}")
    private String serviceKey;

    /** 최대 6개 지역을 한 화면에서 조회한다. 호출자가 임의 문자열을 주어도 고정 시도 목록 밖은 무시한다. */
    public List<TourismRegionPhotoResponse> findRegionPhotos(Collection<String> regions) {
        if (regions == null || regions.isEmpty()) return List.of();

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String region : regions) {
            if (AREA_CODES.containsKey(region)) normalized.add(region);
            if (normalized.size() == 6) break;
        }

        List<TourismRegionPhotoResponse> photos = new ArrayList<>();
        for (String region : normalized) {
            findRegionPhoto(region).ifPresent(photos::add);
        }
        return List.copyOf(photos);
    }

    @Transactional(readOnly = true)
    public List<TourismRegionPhotoResponse> catalog() {
        return repository.findAllByOrderByRegionCodeAsc().stream()
                .map(TourismRegionPhotoResponse::from)
                .toList();
    }

    /**
     * 프록시는 DB에 이미 등록된 검증 URL만 읽는다. 클라이언트가 URL을 넘길 경로는 없다.
     * repository 읽기가 끝난 뒤 외부 HTTPS를 시작해 느린 원격 응답 동안 DB connection을 잡지 않는다.
     */
    public Optional<ImagePayload> loadImage(String region) {
        if (!AREA_CODES.containsKey(region)) return Optional.empty();
        synchronized (regionLock(region)) {
            return loadCachedImage(region);
        }
    }

    private Optional<ImagePayload> loadCachedImage(String region) {
        Optional<TourismRegionPhoto> photo = repository.findByRegionCode(region);
        if (photo.isEmpty() || !TourismImageProxyClient.isAllowedImageUrl(photo.get().getImageUrl())) {
            return Optional.empty();
        }

        String imageUrl = TourismImageProxyClient.toHttpsImageUrl(photo.get().getImageUrl());
        Optional<ImagePayload> cached = cachedImage(region, imageUrl);
        if (cached.isPresent()) {
            metrics.cacheHit();
            return cached;
        }
        ImageFailure failure = failedImageLoads.get(region);
        if (failure != null && failure.imageUrl().equals(imageUrl) && failure.retryAt().isAfter(imageCacheClock.instant())) {
            metrics.imageBackoff();
            return Optional.empty();
        }

        metrics.cacheMiss();
        try {
            Optional<TourismImageProxyClient.FetchedImage> fetched = fetchImageWithMetrics(imageUrl);
            if (fetched.isPresent()) {
                var image = fetched.get();
                ImagePayload payload = new ImagePayload(image.bytes(), image.contentType());
                cacheImage(region, imageUrl, payload);
                failedImageLoads.remove(region);
                return Optional.of(payload);
            }
        } catch (Exception exception) {
            log.warn("Tourism region image proxy failed: region={}, errorType={}", region,
                    exception.getClass().getSimpleName());
        }
        failedImageLoads.put(region, new ImageFailure(imageUrl, imageCacheClock.instant().plus(IMAGE_FAILURE_BACKOFF)));
        return Optional.empty();
    }

    private Optional<TourismImageProxyClient.FetchedImage> fetchImageWithMetrics(String imageUrl) {
        long started = System.nanoTime();
        boolean successful = false;
        try {
            Optional<TourismImageProxyClient.FetchedImage> image = imageProxyClient.fetch(imageUrl);
            successful = image.isPresent();
            return image;
        } finally {
            metrics.imageProxyRequest(System.nanoTime() - started, successful);
        }
    }

    private Optional<TourismRegionPhotoResponse> findRegionPhoto(String region) {
        // 최초 등록·30일 만료 시 같은 시도의 동시 조회를 합친다. 다른 시도는 서로 막지 않는다.
        synchronized (regionLock(region)) {
            return refreshRegionPhoto(region);
        }
    }

    private Object regionLock(String region) {
        return regionLocks.computeIfAbsent(region, ignored -> new Object());
    }

    private Optional<ImagePayload> cachedImage(String region, String imageUrl) {
        synchronized (imageCache) {
            CachedImage cached = imageCache.get(region);
            if (cached == null) return Optional.empty();
            if (!cached.imageUrl().equals(imageUrl) || !cached.expiresAt().isAfter(imageCacheClock.instant())) {
                cachedImageBytes -= cached.payload().bytes().length;
                imageCache.remove(region);
                return Optional.empty();
            }
            return Optional.of(new ImagePayload(cached.payload().bytes().clone(), cached.payload().contentType()));
        }
    }

    private void cacheImage(String region, String imageUrl, ImagePayload payload) {
        synchronized (imageCache) {
            CachedImage previous = imageCache.remove(region);
            if (previous != null) cachedImageBytes -= previous.payload().bytes().length;
            while (!imageCache.isEmpty() && cachedImageBytes + payload.bytes().length > IMAGE_CACHE_MAX_BYTES) {
                String oldestRegion = imageCache.keySet().iterator().next();
                cachedImageBytes -= imageCache.remove(oldestRegion).payload().bytes().length;
            }
            if (payload.bytes().length > IMAGE_CACHE_MAX_BYTES) return;
            ImagePayload stored = new ImagePayload(payload.bytes().clone(), payload.contentType());
            imageCache.put(region, new CachedImage(imageUrl, stored, imageCacheClock.instant().plus(IMAGE_CACHE_TTL)));
            cachedImageBytes += stored.bytes().length;
        }
    }

    private Optional<TourismRegionPhotoResponse> refreshRegionPhoto(String region) {
        // Spring Data repository 호출은 각각 짧은 트랜잭션으로 끝낸다. 아래 Tourism API 호출을
        // 포괄하는 서비스 트랜잭션을 두면 공개 요청이 DB connection을 수 초간 점유할 수 있다.
        Optional<TourismRegionPhoto> existing = repository.findByRegionCode(region);
        if (existing.filter(this::isFresh).isPresent()) {
            return existing.map(TourismRegionPhotoResponse::from);
        }
        if (!StringUtils.hasText(serviceKey) || shouldBackOff(region)) {
            return existing.map(TourismRegionPhotoResponse::from);
        }

        try {
            Optional<Candidate> candidate = fetchCandidate(region);
            if (candidate.isEmpty()) {
                rememberFailure(region);
                return existing.map(TourismRegionPhotoResponse::from);
            }

            LocalDateTime checkedAt = LocalDateTime.now(Clock.systemDefaultZone());
            TourismRegionPhoto stored = existing.orElseGet(TourismRegionPhoto::new);
            Candidate accepted = candidate.get();
            stored.refresh(region, new TourismRegionPhoto.PhotoDetails(
                    accepted.contentId(), PROVIDER_NAME, accepted.workTitle(), accepted.imageUrl(),
                    SOURCE_URL, LICENSE_TYPE, checkedAt));
            repository.save(stored);
            failedRefreshes.remove(region);
            return Optional.of(TourismRegionPhotoResponse.from(stored));
        } catch (Exception exception) {
            rememberFailure(region);
            log.warn("Tourism region photo lookup failed: region={}, errorType={}", region,
                    exception.getClass().getSimpleName());
            return existing.map(TourismRegionPhotoResponse::from);
        }
    }

    private boolean isFresh(TourismRegionPhoto photo) {
        return photo.getCheckedAt() != null
                && photo.getCheckedAt().isAfter(LocalDateTime.now(Clock.systemDefaultZone()).minus(REFRESH_AFTER));
    }

    private boolean shouldBackOff(String region) {
        Instant until = failedRefreshes.get(region);
        return until != null && until.isAfter(Instant.now());
    }

    private void rememberFailure(String region) {
        failedRefreshes.put(region, Instant.now().plus(FAILURE_BACKOFF));
    }

    private Optional<Candidate> fetchCandidate(String region) throws JsonProcessingException {
        List<JsonNode> listItems = requestItems(LIST_ENDPOINT, builder -> builder
                .queryParam("areaCode", AREA_CODES.get(region))
                .queryParam("pageNo", 1)
                .queryParam("numOfRows", 20));

        for (JsonNode item : listItems.stream()
                .filter(candidate -> StringUtils.hasText(text(candidate, "contentid")))
                .limit(CANDIDATE_LIMIT)
                .toList()) {
            String contentId = text(item, "contentid");
            String fallbackTitle = text(item, "title");
            List<JsonNode> imageItems = requestItems(IMAGE_ENDPOINT, builder -> builder
                    .queryParam("contentId", contentId));
            for (JsonNode image : imageItems) {
                String imageUrl = firstText(image, "originimgurl", "smallimageurl");
                if (!isTypeOne(image) || !TourismImageProxyClient.isAllowedImageUrl(imageUrl)) continue;
                String title = firstNonBlank(text(image, "imgname"), fallbackTitle, "대표 관광 사진");
                return Optional.of(new Candidate(contentId, trim(title, 500), TourismImageProxyClient.toHttpsImageUrl(imageUrl)));
            }
        }
        return Optional.empty();
    }

    private List<JsonNode> requestItems(String endpoint, java.util.function.UnaryOperator<UriComponentsBuilder> extra)
            throws JsonProcessingException {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(endpoint)
                .queryParam("serviceKey", encodedServiceKey())
                .queryParam("MobileOS", "ETC")
                .queryParam("MobileApp", "RESERVE")
                .queryParam("_type", "json");
        URI uri = extra.apply(builder).build(true).toUri();
        TourismPhotoMetrics.ApiEndpoint metricsEndpoint = LIST_ENDPOINT.equals(endpoint)
                ? TourismPhotoMetrics.ApiEndpoint.AREA_LIST : TourismPhotoMetrics.ApiEndpoint.DETAIL_IMAGE;
        long started = System.nanoTime();
        boolean successful = false;
        try {
            List<JsonNode> items = parseItems(restTemplate.getForObject(uri, String.class));
            successful = true;
            return items;
        } finally {
            metrics.apiRequest(metricsEndpoint, System.nanoTime() - started, successful);
        }
    }

    private String encodedServiceKey() {
        return serviceKey.contains("%")
                ? serviceKey
                : URLEncoder.encode(serviceKey, StandardCharsets.UTF_8);
    }

    private List<JsonNode> parseItems(String body) throws JsonProcessingException {
        if (body == null || !body.stripLeading().startsWith("{")) {
            throw new IllegalStateException("Tourism API did not return JSON");
        }
        JsonNode response = objectMapper.readTree(body).path("response");
        String resultCode = response.path("header").path("resultCode").asText();
        if (!SUCCESS_CODES.contains(resultCode)) {
            throw new IllegalStateException("Tourism API rejected the request");
        }
        JsonNode item = response.path("body").path("items").path("item");
        if (item.isArray()) {
            List<JsonNode> items = new ArrayList<>();
            item.forEach(items::add);
            return items;
        }
        return item.isObject() ? List.of(item) : List.of();
    }

    private boolean isTypeOne(JsonNode image) {
        String code = text(image, "cpyrhtDivCd")
                .replaceAll("\\s+", "")
                .toUpperCase(Locale.ROOT);
        return TYPE_ONE_LICENSE_CODES.contains(code);
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = text(node, field);
            if (StringUtils.hasText(value)) return value;
        }
        return "";
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) return value.trim();
        }
        return "";
    }

    private static String trim(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private record Candidate(String contentId, String workTitle, String imageUrl) { }
    private record CachedImage(String imageUrl, ImagePayload payload, Instant expiresAt) { }
    private record ImageFailure(String imageUrl, Instant retryAt) { }

    public record ImagePayload(byte[] bytes, MediaType contentType) {
        @Override
        public boolean equals(Object other) {
            return this == other || other instanceof ImagePayload(var imageBytes, var imageContentType)
                    && Arrays.equals(bytes, imageBytes)
                    && Objects.equals(contentType, imageContentType);
        }

        @Override
        public int hashCode() {
            return 31 * Arrays.hashCode(bytes) + Objects.hash(contentType);
        }

        @Override
        public String toString() {
            return "ImagePayload[byteCount=" + (bytes == null ? 0 : bytes.length) + ", contentType=" + contentType + "]";
        }
    }
}
