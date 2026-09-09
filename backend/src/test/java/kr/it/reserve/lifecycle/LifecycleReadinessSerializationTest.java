package kr.it.reserve.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.lifecycle.dto.MemberWithdrawalReadiness;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 폐업·탈퇴 준비도 응답이 <b>파생 플래그까지</b> JSON 에 실리는지 고정한다.
 *
 * <p>왜 이 테스트가 있나 — record 의 파생 메서드(canClose/canWithdraw)는 컴포넌트가 아니라서
 * Jackson 이 기본으로 직렬화하지 않는다. 그래서 응답에는 카운트만 0으로 담기고 플래그는
 * 통째로 빠졌는데, 프런트는 그 플래그로 버튼을 켜고 있었다. 결과적으로 미결이 0건인
 * 가게도 "영업 종료" 버튼이 회색으로 잠긴 채 사장이 스스로 풀 방법이 없었다(운영 제보).
 *
 * <p>필드를 하나 추가하거나 record 를 클래스로 바꾸는 리팩터링에서 같은 사고가 조용히
 * 재발할 수 있으므로, "키가 존재하는가"를 직접 못 박는다.
 */
class LifecycleReadinessSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("가게 폐업 준비도 JSON 에 canClose 플래그가 반드시 포함된다")
    void storeClosureReadinessSerializesCanCloseFlag() throws Exception {
        Map<String, Object> clear = toMap(new StoreClosureReadiness(0, 0L, 0L, 0L, 0L));
        assertThat(clear).containsEntry("canClose", true);
        assertThat(clear).containsKeys(
                "unresolvedReservations", "activeAdvertisements",
                "unresolvedRefunds", "openPaymentIssues", "unfinishedWebhooks");

        Map<String, Object> blocked = toMap(new StoreClosureReadiness(1, 0L, 0L, 0L, 0L));
        assertThat(blocked).containsEntry("canClose", false);
    }

    @Test
    @DisplayName("회원 탈퇴 준비도 JSON 에 canWithdraw 플래그가 반드시 포함된다")
    void memberWithdrawalReadinessSerializesCanWithdrawFlag() throws Exception {
        Map<String, Object> clear = toMap(new MemberWithdrawalReadiness(0L, 0, 0L, 0L, 0L));
        assertThat(clear).containsEntry("canWithdraw", true);
        assertThat(clear).containsKeys(
                "openStores", "unresolvedReservations",
                "unresolvedRefunds", "openPaymentIssues", "unfinishedWebhooks");

        Map<String, Object> blocked = toMap(new MemberWithdrawalReadiness(1L, 0, 0L, 0L, 0L));
        assertThat(blocked).containsEntry("canWithdraw", false);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(Object value) throws Exception {
        return objectMapper.readValue(objectMapper.writeValueAsString(value), Map.class);
    }
}
