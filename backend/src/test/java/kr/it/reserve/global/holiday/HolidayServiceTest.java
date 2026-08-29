package kr.it.reserve.global.holiday;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 공휴일 조회 — <b>"실패해도 예약이 멀쩡한가"가 이 테스트의 전부다.</b>
 *
 * <p>이 기능은 달력을 빨갛게 칠하는 것 말고는 하는 일이 없다. 그래서 여기서 지켜야 할 계약은
 * "공휴일을 잘 찾는다"보다 <b>"못 찾아도 조용히 비켜준다"</b>가 먼저다 —
 * 외부 포털이 죽었다고 우리 예약 화면이 같이 죽으면, 안 사도 될 장애를 사 온 것이다.
 */
@ExtendWith(MockitoExtension.class)
class HolidayServiceTest {

    @Mock private RestTemplate restTemplate;

    private static final YearMonth JAN = YearMonth.of(2026, 1);

    /** 실제 응답 모양 그대로 — 빨간날(Y) 사이에 빨간날이 아닌 국경일(N)이 섞여 있다. */
    private static final String TWO_ITEMS = """
            {"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."},
             "body":{"items":{"item":[
               {"dateKind":"01","dateName":"1월1일","isHoliday":"Y","locdate":20260101,"seq":1},
               {"dateKind":"01","dateName":"제헌절","isHoliday":"N","locdate":20260117,"seq":1}
             ]},"numOfRows":100,"pageNo":1,"totalCount":2}}}
            """;

    private HolidayService service(String apiKey) {
        HolidayService s = new HolidayService(restTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(s, "apiKey", apiKey);
        return s;
    }

    @Test
    @DisplayName("키가 없으면 네트워크를 아예 건드리지 않는다 — 키 없이도 앱이 그냥 돈다")
    void noKey_noCall() {
        HolidayService s = service("");

        assertThat(s.holidaysOf(JAN)).isEmpty();
        verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("isHoliday=Y 만 빨간날이다 — 제헌절 같은 국경일은 걸러진다")
    void onlyIsHolidayY() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);

        assertThat(service("KEY").holidaysOf(JAN))
                .containsExactly(LocalDate.of(2026, 1, 1));
    }

    @Test
    @DisplayName("결과가 1건이면 배열이 아니라 객체로 온다 — 이 케이스만 조용히 틀리기 쉽다")
    void singleItemComesAsObject() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn("""
                {"response":{"body":{"items":{"item":
                  {"dateKind":"01","dateName":"삼일절","isHoliday":"Y","locdate":20260301,"seq":1}
                },"totalCount":1}}}
                """);

        assertThat(service("KEY").holidaysOf(YearMonth.of(2026, 3)))
                .containsExactly(LocalDate.of(2026, 3, 1));
    }

    @Test
    @DisplayName("공휴일이 없는 달은 items 가 빈 문자열로 온다")
    void emptyItems() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenReturn("""
                        {"response":{"header":{"resultCode":"00"},"body":{"items":"","totalCount":0}}}
                        """);

        assertThat(service("KEY").holidaysOf(JAN)).isEmpty();
    }

    @Test
    @DisplayName("★ 포털이 죽어도 예외가 새어 나가지 않는다 — 달력은 그대로 뜬다")
    void networkFailure_returnsEmpty() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenThrow(new ResourceAccessException("connect timed out"));

        assertThat(service("KEY").holidaysOf(JAN)).isEmpty();
    }

    @Test
    @DisplayName("★ 키가 아직 반영 안 돼 XML 에러가 와도 빈 집합이다 — _type=json 이어도 에러는 XML 로 온다")
    void xmlErrorResponse_returnsEmpty() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn("""
                <OpenAPI_ServiceResponse><cmmMsgHeader>
                <returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>
                </cmmMsgHeader></OpenAPI_ServiceResponse>
                """);

        assertThat(service("KEY").holidaysOf(JAN)).isEmpty();
    }

    @Test
    @DisplayName("실패한 달도 캐시한다 — 포털이 죽어 있는 동안 매번 타임아웃을 새로 기다리지 않게")
    void failureIsCachedToo() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class)))
                .thenThrow(new ResourceAccessException("connect timed out"));
        HolidayService s = service("KEY");

        s.holidaysOf(JAN);
        s.holidaysOf(JAN);

        verify(restTemplate, times(1)).getForObject(any(URI.class), eq(String.class));
    }

    @Test
    @DisplayName("캐시를 비우면 다시 부른다 — 임시공휴일이 연중에 추가되는 일이 실제로 있다")
    void evictAllowsRefetch() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);
        HolidayService s = service("KEY");

        s.holidaysOf(JAN);
        s.evictCache();
        s.holidaysOf(JAN);

        verify(restTemplate, times(2)).getForObject(any(URI.class), eq(String.class));
    }

    @Test
    @DisplayName("★ Encoding 키(%2B)를 한 번 더 인코딩하지 않는다 — %252B 가 되면 계속 인증 실패다")
    void encodingKeyIsNotDoubleEncoded() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);

        service("aB%2BcD%3D").holidaysOf(JAN);

        assertThat(capturedUri().getRawQuery())
                .contains("serviceKey=aB%2BcD%3D")
                .doesNotContain("%25");
    }

    @Test
    @DisplayName("★ Decoding 키(+)는 우리가 인코딩해 준다 — 안 하면 +가 공백으로 읽혀 인증 실패다")
    void decodingKeyGetsEncoded() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);

        service("aB+cD=").holidaysOf(JAN);

        assertThat(capturedUri().getRawQuery()).contains("serviceKey=aB%2BcD%3D");
    }

    @Test
    @DisplayName("월은 두 자리로 보낸다 — solMonth=1 은 포털이 안 받아준다")
    void monthIsZeroPadded() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);

        service("KEY").holidaysOf(JAN);

        assertThat(capturedUri().getRawQuery())
                .contains("solYear=2026")
                .contains("solMonth=01")
                .contains("_type=json");
    }

    @Test
    @DisplayName("캐시는 달마다 따로 잡힌다")
    void cacheIsPerMonth() {
        when(restTemplate.getForObject(any(URI.class), eq(String.class))).thenReturn(TWO_ITEMS);
        HolidayService s = service("KEY");

        s.holidaysOf(JAN);
        s.holidaysOf(YearMonth.of(2026, 2));

        verify(restTemplate, times(2)).getForObject(any(URI.class), eq(String.class));
    }

    @Test
    @DisplayName("빈 캐시를 비우는 건 아무 일도 아니다")
    void evictOnEmptyCacheIsNoop() {
        HolidayService s = service("");
        s.evictCache();

        assertThat(s.holidaysOf(JAN)).isEqualTo(Set.of());
        verify(restTemplate, never()).getForObject(any(URI.class), eq(String.class));
    }

    private URI capturedUri() {
        ArgumentCaptor<URI> uri = ArgumentCaptor.forClass(URI.class);
        verify(restTemplate).getForObject(uri.capture(), eq(String.class));
        return uri.getValue();
    }
}
