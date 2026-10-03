package kr.it.reserve.tourism.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.it.reserve.tourism.entity.TourismRegionPhoto;
import kr.it.reserve.tourism.repository.TourismRegionPhotoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;
import org.springframework.http.MediaType;

@ExtendWith(MockitoExtension.class)
class TourismRegionPhotoServiceTest {

    private static final String LIST_RESPONSE = """
            {"response":{"header":{"resultCode":"0000"},"body":{"items":{"item":[
              {"contentid":"12345","title":"서울 대표 관광지"}
            ]}}}}
            """;

    private static final String TYPE_ONE_IMAGE_RESPONSE = """
            {"response":{"header":{"resultCode":"0000"},"body":{"items":{"item":
              {"imgname":"서울 대표 관광 사진","originimgurl":"https://tong.visitkorea.or.kr/cms/resource/00/123456_image2_1.jpg","cpyrhtDivCd":"Type1"}
            }}}}
            """;

    private static final String TYPE_THREE_IMAGE_RESPONSE = """
            {"response":{"header":{"resultCode":"0000"},"body":{"items":{"item":
              {"imgname":"변형 금지 사진","originimgurl":"https://tong.visitkorea.or.kr/cms/resource/00/123456_image2_1.jpg","cpyrhtDivCd":"Type3"}
            }}}}
            """;

    @Mock private TourismRegionPhotoRepository repository;
    @Mock private RestTemplate restTemplate;
    @Mock private TourismImageProxyClient imageProxyClient;
    private final SimpleMeterRegistry metrics = new SimpleMeterRegistry();

    private TourismRegionPhotoService service(String key) {
        TourismRegionPhotoService service = new TourismRegionPhotoService(
                repository, restTemplate, new ObjectMapper(), imageProxyClient, new TourismPhotoMetrics(metrics));
        ReflectionTestUtils.setField(service, "serviceKey", key);
        return service;
    }

    @Test
    void noKeyDoesNotCallTheExternalTourismApi() {
        when(repository.findByRegionCode("서울")).thenReturn(Optional.empty());

        assertThat(service("").findRegionPhotos(List.of("서울"))).isEmpty();

        verifyNoInteractions(restTemplate, imageProxyClient);
        verify(repository, never()).save(any());
    }

    @Test
    void persistsOnlyTheTypeOneImageAndReturnsAProxyPath() {
        when(repository.findByRegionCode("서울")).thenReturn(Optional.empty());
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenReturn(LIST_RESPONSE, TYPE_ONE_IMAGE_RESPONSE);

        var photos = service("aB+cD=").findRegionPhotos(List.of("서울"));

        assertThat(photos).singleElement().satisfies(photo -> {
            assertThat(photo.region()).isEqualTo("서울");
            assertThat(photo.imageUrl()).isEqualTo("/api/tourism/region-photos/서울/image");
            assertThat(photo.license()).isEqualTo("공공누리 제1유형");
            assertThat(photo.contentId()).isEqualTo("12345");
        });
        ArgumentCaptor<TourismRegionPhoto> stored = ArgumentCaptor.forClass(TourismRegionPhoto.class);
        verify(repository).save(stored.capture());
        assertThat(stored.getValue().getImageUrl()).startsWith("https://tong.visitkorea.or.kr/");
        assertThat(stored.getValue().getWorkTitle()).isEqualTo("서울 대표 관광 사진");

        ArgumentCaptor<URI> uri = ArgumentCaptor.forClass(URI.class);
        verify(restTemplate, times(2)).getForObject(uri.capture(), eq(String.class));
        assertThat(uri.getAllValues().getFirst().getRawQuery())
                .contains("serviceKey=aB%2BcD%3D")
                .doesNotContain("%25")
                .contains("areaCode=1");
        assertThat(metrics.get("reserve.tourism.api").tag("endpoint", "areaBasedList2").timer().count()).isEqualTo(1);
        assertThat(metrics.get("reserve.tourism.api").tag("endpoint", "detailImage2").timer().count()).isEqualTo(1);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("candidateRequestCases")
    void candidateLookupSkipsBlankIdsAndPreservesRequestOrder(
            String caseName, String typeOneContentId,
            List<String> expectedRequestedIds, String expectedStoredId) {
        String listResponse = """
                {"response":{"header":{"resultCode":"0000"},"body":{"items":{"item":[
                  {"title":"ID 없음"},
                  {"contentid":"  "},
                  {"contentid":"10001","title":"첫 후보"},
                  {"contentid":""},
                  {"contentid":"10002","title":"둘째 후보"},
                  {"contentid":null},
                  {"contentid":"10002","title":"중복 ID 후보"},
                  {"contentid":"10004","title":"넷째 후보"},
                  {"contentid":"10005","title":"다섯째 후보"}
                ]}}}}
                """;
        when(repository.findByRegionCode("서울")).thenReturn(Optional.empty());
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenAnswer(invocation -> {
            URI uri = invocation.getArgument(0);
            if (uri.getPath().endsWith("areaBasedList2")) return listResponse;
            assertThat(uri.getPath()).endsWith("detailImage2");
            String requestedId = UriComponentsBuilder.fromUri(uri).build()
                    .getQueryParams().getFirst("contentId");
            return typeOneContentId.equals(requestedId)
                    ? TYPE_ONE_IMAGE_RESPONSE : TYPE_THREE_IMAGE_RESPONSE;
        });
        var target = service("key");

        var photos = target.findRegionPhotos(List.of("서울"));

        if (expectedStoredId == null) {
            assertThat(photos).isEmpty();
            verify(repository, never()).save(any());
            assertThat(target.findRegionPhotos(List.of("서울"))).isEmpty();
        } else {
            assertThat(photos).singleElement()
                    .satisfies(photo -> assertThat(photo.contentId()).isEqualTo(expectedStoredId));
            verify(repository).save(any());
        }

        ArgumentCaptor<URI> requests = ArgumentCaptor.forClass(URI.class);
        verify(restTemplate, times(1 + expectedRequestedIds.size()))
                .getForObject(requests.capture(), eq(String.class));
        List<URI> requestedUris = requests.getAllValues();
        assertThat(requestedUris.getFirst().getPath()).endsWith("areaBasedList2");
        List<URI> detailRequests = requestedUris.subList(1, requestedUris.size());
        assertThat(detailRequests).allSatisfy(uri -> assertThat(uri.getPath()).endsWith("detailImage2"));
        assertThat(detailRequests)
                .extracting(uri -> UriComponentsBuilder.fromUri(uri).build()
                        .getQueryParams().getFirst("contentId"))
                .containsExactlyElementsOf(expectedRequestedIds);
        verifyNoInteractions(imageProxyClient);
    }

    private static Stream<Arguments> candidateRequestCases() {
        return Stream.of(
                Arguments.of("first candidate succeeds", "10001", List.of("10001"), "10001"),
                Arguments.of("fourth valid candidate succeeds", "10004",
                        List.of("10001", "10002", "10002", "10004"), "10004"),
                Arguments.of("fifth valid candidate is never requested", "10005",
                        List.of("10001", "10002", "10002", "10004"), null)
        );
    }

    @Test
    void refusesTypeThreeImagesEvenWhenTheImageUrlLooksValid() {
        when(repository.findByRegionCode("서울")).thenReturn(Optional.empty());
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenReturn(LIST_RESPONSE, TYPE_THREE_IMAGE_RESPONSE);

        assertThat(service("key").findRegionPhotos(List.of("서울"))).isEmpty();

        verify(repository, never()).save(any());
    }

    @Test
    void keepsARecentlyVerifiedCatalogEntryWithoutCallingTheExternalApiAgain() {
        TourismRegionPhoto photo = new TourismRegionPhoto(
                "서울", "123", "한국관광공사 관광정보 서비스", "검증된 사진",
                "https://tong.visitkorea.or.kr/cms/resource/00/123456_image2_1.jpg",
                "https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y",
                "공공누리 제1유형", LocalDateTime.now());
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo));

        assertThat(service("key").findRegionPhotos(List.of("서울")))
                .extracting(response -> response.workTitle())
                .containsExactly("검증된 사진");

        verifyNoInteractions(restTemplate, imageProxyClient);
    }

    @Test
    void imageProxyRefusesAnUnexpectedHostBeforeMakingANetworkRequest() {
        TourismRegionPhoto photo = new TourismRegionPhoto(
                "서울", "123", "한국관광공사 관광정보 서비스", "검증된 사진",
                "https://example.invalid/image.jpg",
                "https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y",
                "공공누리 제1유형", LocalDateTime.now());
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo));

        assertThat(service("key").loadImage("서울")).isEmpty();

        verifyNoInteractions(restTemplate, imageProxyClient);
    }

    @Test
    void imageProxyReturnsAnEmptyResultWhenTheDedicatedClientRejectsTheResponse() {
        TourismRegionPhoto photo = new TourismRegionPhoto(
                "서울", "123", "한국관광공사 관광정보 서비스", "검증된 사진",
                "https://tong.visitkorea.or.kr/cms/resource/00/123456_image2_1.jpg",
                "https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y",
                "공공누리 제1유형", LocalDateTime.now());
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo));
        when(imageProxyClient.fetch(photo.getImageUrl())).thenReturn(Optional.empty());

        assertThat(service("key").loadImage("서울")).isEmpty();
        verify(imageProxyClient).fetch(photo.getImageUrl());
    }

    private TourismRegionPhoto photo(String region, String imageUrl) {
        return new TourismRegionPhoto(region, "123", "한국관광공사 관광정보 서비스", "검증된 사진",
                imageUrl, "https://www.data.go.kr/data/15101578/openapi.do?recommendDataYn=Y",
                "공공누리 제1유형", LocalDateTime.now());
    }

    private void imageClock(TourismRegionPhotoService target, Instant now) {
        ReflectionTestUtils.setField(target, "imageCacheClock", Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void cachesImageBytesForDifferentVisitorsWithoutSharingMutableResponseArrays() {
        String url = "https://tong.visitkorea.or.kr/first.jpg";
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo("서울", url)));
        when(imageProxyClient.fetch(url)).thenReturn(Optional.of(
                new TourismImageProxyClient.FetchedImage(new byte[]{1, 2, 3}, MediaType.IMAGE_JPEG)));
        var target = service("key");

        target.loadImage("서울").orElseThrow().bytes()[0] = 99;
        byte[] second = target.loadImage("서울").orElseThrow().bytes();
        assertThat(second).containsExactly((byte) 1, (byte) 2, (byte) 3);
        second[0] = 88;
        assertThat(target.loadImage("서울").orElseThrow().bytes()).containsExactly((byte) 1, (byte) 2, (byte) 3);
        verify(imageProxyClient, times(1)).fetch(url);
        verifyNoInteractions(restTemplate);
        assertThat(metrics.get("reserve.tourism.image.cache").tag("outcome", "hit").counter().count()).isEqualTo(2);
        assertThat(metrics.get("reserve.tourism.image.cache").tag("outcome", "miss").counter().count()).isEqualTo(1);
        assertThat(metrics.get("reserve.tourism.image.proxy").timer().count()).isEqualTo(1);
        assertThat(metrics.get("reserve.tourism.image.proxy.errors").counter().count()).isZero();
    }

    @Test
    void imageCacheExpiresAtOneDayAndInvalidatesWhenTheApprovedUrlChanges() {
        String first = "https://tong.visitkorea.or.kr/first.jpg";
        String next = "https://tong.visitkorea.or.kr/next.jpg";
        var current = new AtomicReference<>(photo("서울", first));
        when(repository.findByRegionCode("서울")).thenAnswer(invocation -> Optional.of(current.get()));
        when(imageProxyClient.fetch(any())).thenReturn(Optional.of(
                new TourismImageProxyClient.FetchedImage(new byte[]{1}, MediaType.IMAGE_JPEG)));
        var target = service("key");
        Instant start = Instant.parse("2026-09-30T00:00:00Z");
        imageClock(target, start);
        target.loadImage("서울");
        imageClock(target, start.plusSeconds(86_399));
        target.loadImage("서울");
        verify(imageProxyClient, times(1)).fetch(first);
        imageClock(target, start.plusSeconds(86_400));
        target.loadImage("서울");
        verify(imageProxyClient, times(2)).fetch(first);
        current.set(photo("서울", next));
        target.loadImage("서울");
        verify(imageProxyClient).fetch(next);
        current.set(photo("서울", "https://example.invalid/rejected.jpg"));
        assertThat(target.loadImage("서울")).isEmpty();
        verify(imageProxyClient, never()).fetch("https://example.invalid/rejected.jpg");
    }

    @Test
    void unsuccessfulImageRequestsBackOffForOneMinuteButCanRecover() {
        String url = "https://tong.visitkorea.or.kr/first.jpg";
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo("서울", url)));
        when(imageProxyClient.fetch(url)).thenReturn(Optional.empty(), Optional.of(
                new TourismImageProxyClient.FetchedImage(new byte[]{1}, MediaType.IMAGE_JPEG)));
        var target = service("key");
        Instant start = Instant.parse("2026-09-30T00:00:00Z");
        imageClock(target, start);
        assertThat(target.loadImage("서울")).isEmpty();
        imageClock(target, start.plusSeconds(59));
        assertThat(target.loadImage("서울")).isEmpty();
        verify(imageProxyClient, times(1)).fetch(url);
        imageClock(target, start.plusSeconds(60));
        assertThat(target.loadImage("서울")).isPresent();
        assertThat(target.loadImage("서울")).isPresent();
        verify(imageProxyClient, times(2)).fetch(url);
        assertThat(metrics.get("reserve.tourism.image.cache").tag("outcome", "backoff").counter().count()).isEqualTo(1);
        assertThat(metrics.get("reserve.tourism.image.cache").tag("outcome", "miss").counter().count()).isEqualTo(2);
        assertThat(metrics.get("reserve.tourism.image.proxy").timer().count()).isEqualTo(2);
        assertThat(metrics.get("reserve.tourism.image.proxy.errors").counter().count()).isEqualTo(1);
    }

    @Test
    void imageCacheStaysWithinSixteenMiBAndEvictsTheLeastRecentlyUsedRegion() {
        for (String region : List.of("서울", "경기", "부산")) {
            when(repository.findByRegionCode(region)).thenReturn(Optional.of(
                    photo(region, "https://tong.visitkorea.or.kr/" + region + ".jpg")));
        }
        when(imageProxyClient.fetch(any())).thenReturn(Optional.of(
                new TourismImageProxyClient.FetchedImage(new byte[8 * 1024 * 1024], MediaType.IMAGE_JPEG)));
        var target = service("key");
        target.loadImage("서울");
        target.loadImage("경기");
        target.loadImage("서울");
        target.loadImage("부산");
        assertThat(ReflectionTestUtils.getField(target, "cachedImageBytes")).isEqualTo(16 * 1024 * 1024);
        target.loadImage("서울");
        verify(imageProxyClient, times(1)).fetch("https://tong.visitkorea.or.kr/서울.jpg");
        target.loadImage("경기");
        verify(imageProxyClient, times(2)).fetch("https://tong.visitkorea.or.kr/경기.jpg");
        assertThat(ReflectionTestUtils.getField(target, "cachedImageBytes")).isEqualTo(16 * 1024 * 1024);
    }

    @Test
    void concurrentColdCatalogRequestsShareOneExternalRefresh() throws Exception {
        var stored = new AtomicReference<TourismRegionPhoto>();
        when(repository.findByRegionCode("서울")).thenAnswer(invocation -> Optional.ofNullable(stored.get()));
        when(repository.save(any())).thenAnswer(invocation -> {
            TourismRegionPhoto accepted = invocation.getArgument(0);
            stored.set(accepted);
            return accepted;
        });
        var upstreamStarted = new CountDownLatch(1);
        var releaseUpstream = new CountDownLatch(1);
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenAnswer(invocation -> {
            URI uri = invocation.getArgument(0);
            if (uri.getPath().endsWith("areaBasedList2")) {
                upstreamStarted.countDown();
                assertThat(releaseUpstream.await(5, TimeUnit.SECONDS)).isTrue();
                return LIST_RESPONSE;
            }
            return TYPE_ONE_IMAGE_RESPONSE;
        });
        var target = service("key");
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> target.findRegionPhotos(List.of("서울")));
            assertThat(upstreamStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var secondStarted = new CountDownLatch(1);
            var second = threads.submit(() -> {
                secondStarted.countDown();
                return target.findRegionPhotos(List.of("서울"));
            });
            try {
                assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
                verify(restTemplate, after(200).times(1)).getForObject(any(URI.class), eq(String.class));
            } finally {
                releaseUpstream.countDown();
            }
            assertThat(first.get(5, TimeUnit.SECONDS)).hasSize(1);
            assertThat(second.get(5, TimeUnit.SECONDS)).hasSize(1);
        }
        verify(restTemplate, times(2)).getForObject(any(URI.class), eq(String.class));
        verify(repository, times(1)).save(any());
    }

    @Test
    void concurrentImageMissesShareOneDownload() throws Exception {
        String url = "https://tong.visitkorea.or.kr/first.jpg";
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(photo("서울", url)));
        var upstreamStarted = new CountDownLatch(1);
        var releaseUpstream = new CountDownLatch(1);
        when(imageProxyClient.fetch(url)).thenAnswer(invocation -> {
            upstreamStarted.countDown();
            assertThat(releaseUpstream.await(5, TimeUnit.SECONDS)).isTrue();
            return Optional.of(new TourismImageProxyClient.FetchedImage(new byte[]{1}, MediaType.IMAGE_JPEG));
        });
        var target = service("key");
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> target.loadImage("서울"));
            assertThat(upstreamStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var secondStarted = new CountDownLatch(1);
            var second = threads.submit(() -> {
                secondStarted.countDown();
                return target.loadImage("서울");
            });
            try {
                assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
                verify(imageProxyClient, after(200).times(1)).fetch(url);
            } finally {
                releaseUpstream.countDown();
            }
            assertThat(first.get(5, TimeUnit.SECONDS)).isPresent();
            assertThat(second.get(5, TimeUnit.SECONDS)).isPresent();
        }
        verify(imageProxyClient, times(1)).fetch(url);
        verifyNoInteractions(restTemplate);
        verify(repository, never()).save(any());
    }

    @Test
    void failedCatalogRefreshKeepsTheOldPhotoAndDoesNotRetryOnEveryVisit() {
        var old = photo("서울", "https://tong.visitkorea.or.kr/first.jpg");
        old.refresh("서울", "123", "한국관광공사 관광정보 서비스", "검증된 사진", old.getImageUrl(),
                old.getSourceUrl(), "공공누리 제1유형", LocalDateTime.now().minusDays(31));
        when(repository.findByRegionCode("서울")).thenReturn(Optional.of(old));
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenThrow(new org.springframework.web.client.ResourceAccessException("simulated upstream failure"));
        var target = service("key");
        assertThat(target.findRegionPhotos(List.of("서울"))).hasSize(1);
        assertThat(target.findRegionPhotos(List.of("서울"))).hasSize(1);
        verify(restTemplate, times(1)).getForObject(any(URI.class), eq(String.class));
        verify(repository, never()).save(any());
        assertThat(metrics.get("reserve.tourism.api").tag("endpoint", "areaBasedList2").timer().count()).isEqualTo(1);
        assertThat(metrics.get("reserve.tourism.api.errors").tag("endpoint", "areaBasedList2").counter().count()).isEqualTo(1);
    }

    @Test
    void arbitraryRegionInputDoesNotGrowCachesOrReachTheRepository() {
        var target = service("key");
        int meterCount = metrics.getMeters().size();
        for (int i = 0; i < 100; i++) {
            assertThat(target.loadImage("untrusted-" + i)).isEmpty();
            assertThat(target.findRegionPhotos(List.of("untrusted-" + i))).isEmpty();
        }
        assertThat((java.util.Map<?, ?>) ReflectionTestUtils.getField(target, "regionLocks")).isEmpty();
        verifyNoInteractions(repository, restTemplate, imageProxyClient);
        assertThat(metrics.getMeters()).hasSize(meterCount).allSatisfy(meter ->
                assertThat(meter.getId().getTags()).allSatisfy(tag ->
                        assertThat(tag.getKey()).isIn("outcome", "endpoint")));
        assertThat(metrics.get("reserve.tourism.image.proxy").timer().count()).isZero();
        assertThat(metrics.get("reserve.tourism.api").tag("endpoint", "areaBasedList2").timer().count()).isZero();
    }
}
