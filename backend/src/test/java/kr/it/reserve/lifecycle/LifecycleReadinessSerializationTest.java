package kr.it.reserve.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.lifecycle.dto.MemberWithdrawalReadiness;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 폐업·탈퇴 가능 여부를 계산하는 파생 플래그도 JSON 키로 직렬화되는지 확인한다. */
class LifecycleReadinessSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("가게 폐업 준비도 JSON 에 canClose 플래그가 반드시 포함된다")
    void storeClosureReadinessSerializesCanCloseFlag() throws Exception {
        Map<String, Object> clear = toMap(new StoreClosureReadiness(0, 0L, 0L, 0L, 0L));
        assertThat(clear).containsEntry("canClose", true).containsKeys(
                "unresolvedReservations", "activeAdvertisements",
                "unresolvedRefunds", "openPaymentIssues", "unfinishedWebhooks");

        Map<String, Object> blocked = toMap(new StoreClosureReadiness(1, 0L, 0L, 0L, 0L));
        assertThat(blocked).containsEntry("canClose", false);
    }

    @Test
    @DisplayName("회원 탈퇴 준비도 JSON 에 canWithdraw 플래그가 반드시 포함된다")
    void memberWithdrawalReadinessSerializesCanWithdrawFlag() throws Exception {
        Map<String, Object> clear = toMap(new MemberWithdrawalReadiness(0L, 0, 0L, 0L, 0L));
        assertThat(clear).containsEntry("canWithdraw", true).containsKeys(
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
