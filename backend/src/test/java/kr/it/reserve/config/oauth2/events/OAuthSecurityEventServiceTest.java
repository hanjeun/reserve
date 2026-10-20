package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

class OAuthSecurityEventServiceTest {
    private final OAuthSecurityEventTransaction transaction = mock(OAuthSecurityEventTransaction.class);
    private final OAuthSecurityEventService service = new OAuthSecurityEventService(transaction,
            mock(OAuthSecurityEventRepository.class));
    private final VerifiedOAuthSecurityEvent event = new VerifiedOAuthSecurityEvent(AuthProvider.GOOGLE,
            "verification-event", Instant.parse("2026-10-18T12:00:00Z"), List.of(), "a".repeat(64));
    private final Logger logger = (Logger) LoggerFactory.getLogger(OAuthSecurityEventService.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach
    void captureServiceLog() {
        previousLevel = logger.getLevel();
        logger.setLevel(Level.INFO);
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void restoreServiceLog() {
        logger.detachAppender(logs);
        logs.stop();
        logger.setLevel(previousLevel);
    }

    @Test
    void successfulVerificationLogsOnlyHashesAfterTheInboxTransaction() {
        service.receive(event);

        assertThat(logs.list).singleElement().satisfies(entry -> assertThat(entry.getFormattedMessage())
                .contains("OAuth security stream verification received:", "stateHash=" + "a".repeat(64))
                .doesNotContain("verification-event"));
    }

    @Test
    void failedInboxCommitDoesNotProduceAReceivedVerificationLog() {
        doThrow(new IllegalStateException("inbox commit failed")).when(transaction).process(any(), anyString());

        assertThatThrownBy(() -> service.receive(event)).isInstanceOf(IllegalStateException.class);
        assertThat(logs.list).isEmpty();
    }
}
