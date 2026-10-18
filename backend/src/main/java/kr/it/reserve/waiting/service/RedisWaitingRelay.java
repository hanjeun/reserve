package kr.it.reserve.waiting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

/** 커밋된 변경의 재조회 신호만 전달한다. 접수·번호·원문·QR·상태 저장은 MySQL에 둔다. */
@Slf4j
public class RedisWaitingRelay implements MessageListener {
    private final String channel;
    private static final int MAX_BYTES = 65_536;
    private static final int MAX_RECIPIENTS = 10_000;
    private final String origin = UUID.randomUUID().toString();
    private final StringRedisTemplate redis;
    private final RedisMessageListenerContainer container;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher events;
    private final RedisFailureBackoff fallback;

    public RedisWaitingRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
                             ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback) {
        this(redis, container, mapper, events, fallback, RedisNamespace.LOCAL);
    }

    public RedisWaitingRelay(StringRedisTemplate redis, RedisMessageListenerContainer container,
                             ObjectMapper mapper, ApplicationEventPublisher events, RedisFailureBackoff fallback, RedisNamespace namespace) {
        this.redis = redis; this.container = container; this.mapper = mapper;
        this.events = events; this.fallback = fallback;
        this.channel = namespace.prefix() + "waiting-changed:v1";
    }

    @PostConstruct
    void register() { container.addMessageListener(this, ChannelTopic.of(channel)); }

    @EventListener(ApplicationReadyEvent.class)
    public void ready() { reconnect(); }

    @Scheduled(fixedDelay = 5_000)
    public void reconnect() {
        if (container.isRunning() || !fallback.available()) return;
        try { container.start(); }
        catch (RuntimeException unavailable) { fallback.failed(unavailable); }
    }

    public void publish(WaitingEventPublisher.Changed changed) {
        if (!fallback.available()) return;
        Envelope message = new Envelope(origin, changed.storeId(), changed.memberIds());
        if (!valid(message)) return;
        try {
            String json = mapper.writeValueAsString(message);
            if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return;
            redis.convertAndSend(channel, json);
        } catch (JsonProcessingException invalid) {
            log.warn("Waiting Redis notification serialization failed; waiting refresh remains available");
        } catch (RuntimeException unavailable) { fallback.failed(unavailable); }
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        byte[] bytes = message.getBody();
        if (bytes.length > MAX_BYTES || !channel.equals(new String(message.getChannel(), StandardCharsets.UTF_8))) return;
        try {
            Envelope data = mapper.readValue(bytes, Envelope.class);
            if (valid(data) && !origin.equals(data.origin())) {
                events.publishEvent(new RemoteChanged(data.storeId(), Set.copyOf(data.memberIds())));
            }
        } catch (IOException invalid) {
            log.warn("Invalid waiting Redis notification ignored");
        }
    }

    private static boolean valid(Envelope data) {
        return data != null && data.origin() != null && data.origin().matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                && data.storeId() != null && data.storeId() > 0 && data.memberIds() != null
                && data.memberIds().size() <= MAX_RECIPIENTS
                && data.memberIds().stream().allMatch(id -> id != null && id > 0);
    }

    public record Envelope(String origin, Long storeId, Set<Long> memberIds) {}
    public record RemoteChanged(Long storeId, Set<Long> memberIds) {}
}
