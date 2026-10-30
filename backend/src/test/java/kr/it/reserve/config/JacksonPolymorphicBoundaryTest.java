package kr.it.reserve.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.exc.InvalidTypeIdException;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JacksonPolymorphicBoundaryTest {
    private final JsonMapper mapper = JsonMapper.builder().build();

    @BeforeEach
    void resetSentinel() {
        Sentinel.CONSTRUCTIONS.set(0);
    }

    @Test
    void unrelatedClassCannotBypassSubtypeValidationInsideGenericTypeIds() {
        // CVE-2026-110879의 생성자 도달 여부만 검사하고 외부 IO는 사용하지 않는다.
        String sentinel = Sentinel.class.getName();
        for (String typeId : List.of(sentinel, Envelope.class.getName() + "<" + sentinel + ">",
                Envelope.class.getName() + "<java.util.ArrayList<" + sentinel + ">>")) {
            String payload = typeId.contains("ArrayList") ? "[{\"value\":\"synthetic\"}]" : "{\"value\":\"synthetic\"}";
            String json = "{\"msg\":{\"@class\":\"" + typeId + "\",\"payload\":" + payload + "}}";

            assertThatThrownBy(() -> mapper.readValue(json, MessageRequest.class))
                    .as("Unrelated type must be rejected before construction: %s", typeId)
                    .isInstanceOf(InvalidTypeIdException.class);
            assertThat(Sentinel.CONSTRUCTIONS.get()).isZero();
        }
    }

    @Test
    void explicitlyDeclaredDtoStillDeserializesAndExercisesTheSentinel() {
        Sentinel result = mapper.readValue("{\"value\":\"synthetic\"}", Sentinel.class);

        assertThat(result.value).isEqualTo("synthetic");
        assertThat(Sentinel.CONSTRUCTIONS.get()).isEqualTo(1);
    }

    @Test
    void validMessageSubtypeStillDeserializes() {
        String json = "{\"msg\":{\"@class\":\"" + TextMessage.class.getName() + "\",\"text\":\"allowed\"}}";

        MessageRequest result = mapper.readValue(json, MessageRequest.class);

        assertThat(result.msg).isInstanceOfSatisfying(TextMessage.class,
                message -> assertThat(message.text).isEqualTo("allowed"));
        assertThat(Sentinel.CONSTRUCTIONS.get()).isZero();
    }

    public static class MessageRequest {
        public Message msg;
    }

    @JsonTypeInfo(use = JsonTypeInfo.Id.CLASS)
    public interface Message { }

    public static class Envelope<T> implements Message {
        public T payload;
    }

    public static class TextMessage implements Message {
        public String text;
    }

    public static class Sentinel {
        private static final AtomicInteger CONSTRUCTIONS = new AtomicInteger();
        public String value;

        public Sentinel() {
            CONSTRUCTIONS.incrementAndGet();
        }
    }
}
