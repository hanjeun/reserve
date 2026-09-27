package kr.it.reserve.tourism.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.tourism.entity.TourismRegionPhoto;
import kr.it.reserve.tourism.repository.TourismRegionPhotoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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

    private TourismRegionPhotoService service(String key) {
        TourismRegionPhotoService service = new TourismRegionPhotoService(
                repository, restTemplate, new ObjectMapper(), imageProxyClient);
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
        verify(restTemplate, org.mockito.Mockito.times(2)).getForObject(uri.capture(), eq(String.class));
        assertThat(uri.getAllValues().getFirst().getRawQuery())
                .contains("serviceKey=aB%2BcD%3D")
                .doesNotContain("%25")
                .contains("areaCode=1");
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
}
