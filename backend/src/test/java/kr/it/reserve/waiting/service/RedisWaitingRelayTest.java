package kr.it.reserve.waiting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.redis.LocalRedisConfiguration;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.DefaultMessage;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import static org.mockito.Mockito.*;

class RedisWaitingRelayTest {
    @Test
    void remoteSignalsAreScopedToRecipientsAndOwnPublicationIsNotDeliveredTwice() throws Exception {
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ObjectMapper mapper = new ObjectMapper();
        RedisWaitingRelay relay = new RedisWaitingRelay(mock(StringRedisTemplate.class), mock(RedisMessageListenerContainer.class),
                mapper, events, new RedisFailureBackoff());
        byte[] channel = (LocalRedisConfiguration.KEY_PREFIX + "waiting-changed:v1").getBytes(StandardCharsets.UTF_8);
        var remote = new RedisWaitingRelay.Envelope("00000000-0000-4000-a000-000000000001", 31L, Set.of(7L, 12L));
        relay.onMessage(new DefaultMessage(channel, mapper.writeValueAsBytes(remote)), null);
        verify(events).publishEvent(new RedisWaitingRelay.RemoteChanged(31L, Set.of(7L, 12L)));
        clearInvocations(events);
        String origin = (String) ReflectionTestUtils.getField(relay, "origin");
        relay.onMessage(new DefaultMessage(channel, mapper.writeValueAsBytes(new RedisWaitingRelay.Envelope(origin, 31L, Set.of(7L)))), null);
        relay.onMessage(new DefaultMessage(channel, mapper.writeValueAsBytes(new RedisWaitingRelay.Envelope(remote.origin(), 31L, Set.of(-1L)))), null);
        relay.onMessage(new DefaultMessage(channel, new byte[65_537]), null);
        verifyNoInteractions(events);
    }
}
