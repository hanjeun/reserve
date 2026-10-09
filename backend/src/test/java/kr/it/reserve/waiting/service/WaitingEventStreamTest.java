package kr.it.reserve.waiting.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WaitingEventStreamTest {
    @Test
    @SuppressWarnings("unchecked")
    void failedHeartbeatDropsOnlyTheClosedStreamWithoutCompletingItsFailedResponseAgain() throws Exception {
        WaitingEventStream stream = new WaitingEventStream();
        SseEmitter disconnected = mock(SseEmitter.class);
        SseEmitter healthy = mock(SseEmitter.class);
        doThrow(new IOException("closed connection")).when(disconnected).send(any(SseEmitter.SseEventBuilder.class));
        Map<SseEmitter, Long> subscribers = (Map<SseEmitter, Long>) ReflectionTestUtils.getField(stream, "subscribers");
        subscribers.put(disconnected, 1L);
        subscribers.put(healthy, 2L);

        stream.heartbeat();
        stream.heartbeat();

        verify(disconnected).send(any(SseEmitter.SseEventBuilder.class));
        verify(disconnected, never()).complete();
        verify(disconnected, never()).completeWithError(any());
        verify(healthy, times(2)).send(any(SseEmitter.SseEventBuilder.class));
    }
}
