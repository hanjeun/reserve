package kr.it.reserve.reservation.admission;

import kr.it.reserve.global.redis.RedisNamespace;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdmissionPollingPolicyTest {
    private static final String TICKET = "11111111-1111-4111-8111-111111111111";
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private AdmissionProperties properties;
    private AdmissionProperties.Campaign campaign;
    private AdmissionService admission;

    @BeforeEach
    void campaign() {
        campaign = new AdmissionProperties.Campaign();
        campaign.setId("polling-test");
        campaign.setEpoch("11111111-1111-4111-8111-111111111111");
        campaign.setStoreId(1L);
        campaign.setDate(LocalDate.of(2030, 1, 1));
        campaign.setTime(LocalTime.NOON);
        campaign.setOpensAt(Instant.parse("2030-01-01T00:00:00Z"));
        campaign.setClosesAt(Instant.parse("2030-01-01T01:00:00Z"));
        properties = new AdmissionProperties();
        properties.setEnabled(true);
        properties.setCampaigns(List.of(campaign));
        properties.validate();
        var beans = new StaticListableBeanFactory();
        beans.addBean("redis", redis);
        beans.addBean("scope", RedisNamespace.LOCAL);
        admission = new AdmissionService(properties, beans.getBeanProvider(StringRedisTemplate.class),
                beans.getBeanProvider(RedisNamespace.class));
    }

    @ParameterizedTest
    @CsvSource({"0,4", "1,4", "10,4", "11,10", "100,10", "101,20", "100000,20"})
    void waitingRankControlsTheRecommendedInterval(long position, int expectedInterval) {
        var status = status("WAITING", position);
        assertThat(status.position()).isEqualTo(position);
        assertThat(status.pollAfterSeconds()).isEqualTo(expectedInterval);
        assertThat(status.heartbeatTimeoutSeconds()).isEqualTo(90);
    }

    @ParameterizedTest
    @CsvSource({"30,10", "31,10", "59,19", "60,20", "300,20"})
    void intervalLeavesAtLeastThreeHeartbeatOpportunities(int idleSeconds, int expectedInterval) {
        campaign.setIdleSeconds(idleSeconds);
        properties.validate();
        var status = status("WAITING", 101);
        assertThat(status.pollAfterSeconds()).isEqualTo(expectedInterval).isLessThanOrEqualTo(idleSeconds / 3);
        assertThat(status.heartbeatTimeoutSeconds()).isEqualTo(idleSeconds);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMITTED", "CLAIMED", "CLOSED"})
    void nonWaitingStatesKeepTheFastInterval(String state) {
        campaign.setIdleSeconds(30);
        properties.validate();
        var status = status(state, 1000);
        assertThat(status.state()).isEqualTo(state);
        assertThat(status.pollAfterSeconds()).isEqualTo(4);
        assertThat(status.heartbeatTimeoutSeconds()).isEqualTo(30);
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 301})
    void invalidHeartbeatTimeoutIsRejected(int idleSeconds) {
        campaign.setIdleSeconds(idleSeconds);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private AdmissionService.Status status(String state, long position) {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenReturn(List.of(state, TICKET, Long.toString(position), "0", "1893456000000"));
        return admission.status(campaign.getId(), 1L, TICKET);
    }
}
