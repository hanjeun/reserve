package kr.it.reserve.store;

import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.store.controller.AddressController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class AddressSearchContractTest {

    private final RestTemplate restTemplate = mock(RestTemplate.class);
    private final RateLimiter rateLimiter = mock(RateLimiter.class);
    private final AddressController controller = new AddressController(restTemplate, rateLimiter);

    @ParameterizedTest
    @CsvSource({"-2147483648, 1", "5, 5", "2147483647, 10"})
    void proxyBoundsExternalQueryAndPreservesResponse(int requestedSize, int expectedSize) {
        Map<String, Object> body = Map.of("documents", List.of(Map.of("address_name", "서울 검증 주소")));
        when(restTemplate.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(ResponseEntity.ok(body));

        var response = controller.searchAddress("  서울 강남  ", requestedSize, request());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().isSuccess()).isTrue();
        assertThat(response.getBody().getData()).isEqualTo(body);
        ArgumentCaptor<URI> uri = ArgumentCaptor.forClass(URI.class);
        verify(restTemplate).exchange(uri.capture(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class));
        assertThat(uri.getValue().getScheme()).isEqualTo("https");
        assertThat(uri.getValue().getHost()).isEqualTo("dapi.kakao.com");
        assertThat(uri.getValue().getPath()).isEqualTo("/v2/local/search/address.json");
        assertThat(uri.getValue().getRawQuery())
                .contains("query=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8", "size=" + expectedSize);
        verify(rateLimiter).tryConsume("192.0.2.10", RateLimiter.Policy.ADDRESS_SEARCH);
        verifyNoMoreInteractions(restTemplate, rateLimiter);
    }

    @Test
    void missingExternalBodyReturnsAnEmptyDocumentList() {
        when(restTemplate.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(ResponseEntity.ok().build());

        var response = controller.searchAddress("서울 강남", 10, request());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getData()).isEqualTo(Map.of("documents", List.of()));
    }

    private MockHttpServletRequest request() {
        ReflectionTestUtils.setField(controller, "kakaoRestApiKey", "unused-test-placeholder");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("192.0.2.10");
        when(rateLimiter.tryConsume("192.0.2.10", RateLimiter.Policy.ADDRESS_SEARCH)).thenReturn(true);
        return request;
    }
}
