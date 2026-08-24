package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PG 취소 응답 해석.
 *
 * <h2>왜 이 테스트가 필요한가</h2>
 * 이 프로젝트에서 가장 위험한 어긋남은 <b>"장부는 환불, 실제로는 미환불"</b> 이다.
 * 그 어긋남은 딱 한 군데서 생긴다 — PortOne 이 200 과 함께 {@code REQUESTED}(접수됨)를 줬는데
 * 그걸 환불 완료로 읽을 때. 그래서 <b>SUCCEEDED 가 아닌 모든 경우</b>가 완료로 해석되지 않는지를 못박는다.
 */
class PortoneCancelResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private PortoneV2CancelResponse parse(String json) throws Exception {
        return objectMapper.readValue(json, PortoneV2CancelResponse.class);
    }

    @Test
    @DisplayName("SUCCEEDED 만 환불 완료로 읽는다")
    void succeeded() throws Exception {
        PortoneV2CancelResponse response = parse("""
                {"cancellation":{"status":"SUCCEEDED","id":"cancel-1","totalAmount":30000}}
                """);

        assertThat(response.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.SUCCEEDED);
        assertThat(response.cancellationId()).isEqualTo("cancel-1");
        assertThat(response.cancelledAmount()).isEqualTo(30000);
    }

    @Test
    @DisplayName("REQUESTED 는 '접수됨'이지 '환불됨'이 아니다")
    void requestedIsNotDone() throws Exception {
        PortoneV2CancelResponse response = parse("""
                {"cancellation":{"status":"REQUESTED","id":"cancel-2"}}
                """);

        assertThat(response.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.REQUESTED);
        assertThat(response.resolveStatus()).isNotEqualTo(PortoneV2CancelResponse.Status.SUCCEEDED);
    }

    @Test
    @DisplayName("FAILED 는 실패로 읽고 사유를 보관한다")
    void failed() throws Exception {
        PortoneV2CancelResponse response = parse("""
                {"cancellation":{"status":"FAILED","reason":"이미 취소된 결제입니다"}}
                """);

        assertThat(response.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.FAILED);
        assertThat(response.failureReason()).isEqualTo("이미 취소된 결제입니다");
    }

    @Test
    @DisplayName("본문이 비면 UNKNOWN — 성공으로 낙관하지 않는다")
    void emptyBodyIsUnknown() throws Exception {
        assertThat(parse("{}").resolveStatus())
                .isEqualTo(PortoneV2CancelResponse.Status.UNKNOWN);
        assertThat(parse("{\"cancellation\":{}}").resolveStatus())
                .isEqualTo(PortoneV2CancelResponse.Status.UNKNOWN);
    }

    @Test
    @DisplayName("모르는 상태값도 UNKNOWN — 새 값이 생겨도 환불 완료로 새지 않는다")
    void unknownStatusValue() throws Exception {
        PortoneV2CancelResponse response = parse("""
                {"cancellation":{"status":"SOMETHING_NEW"}}
                """);

        assertThat(response.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.UNKNOWN);
    }

    @Test
    @DisplayName("모르는 필드가 늘어나도 파싱이 깨지지 않는다")
    void unknownFieldsAreIgnored() throws Exception {
        PortoneV2CancelResponse response = parse("""
                {"cancellation":{"status":"SUCCEEDED","brandNewField":123},"anotherNewTopLevel":"x"}
                """);

        assertThat(response.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.SUCCEEDED);
    }
}
