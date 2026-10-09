package kr.it.reserve.chat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.chat.service.ChatRetentionScheduler;
import kr.it.reserve.chat.service.ChatRetentionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChatRetentionSchedulerTest {
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ChatRetentionService retention = mock(ChatRetentionService.class);
    private final ChatReportRepository reports = mock(ChatReportRepository.class);
    private final ChatReportAccessAuditRepository audits = mock(ChatReportAccessAuditRepository.class);
    private final ChatRetentionPolicy policy = mock(ChatRetentionPolicy.class);
    private final ChatRetentionScheduler scheduler = new ChatRetentionScheduler(messages, retention, reports, audits, policy);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ChatRetentionScheduler.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach void captureCompletion() {
        previousLevel = logger.getLevel();
        logger.setLevel(Level.INFO);
        appender.setContext(logger.getLoggerContext());
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach void releaseCompletion() {
        logger.detachAppender(appender);
        appender.stop();
        logger.setLevel(previousLevel);
    }

    @Test void zeroCandidatesStillProveCompletionAtTheUtcRunTime() {
        enablePolicy();
        candidates(List.of(), List.of(), List.of());
        LocalDateTime before = LocalDateTime.now(Clock.systemUTC());
        scheduler.sweep();
        LocalDateTime after = LocalDateTime.now(Clock.systemUTC());
        var runAt = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(policy).isActive(runAt.capture());
        LocalDateTime now = runAt.getValue();
        assertThat(now).isBetween(before, after);
        assertThat(completions()).containsExactly("Chat retention sweep completed: runAtUtc=" + now.atOffset(ZoneOffset.UTC)
                + ", reportCandidates=0, reportFailures=0, messageCandidates=0, messageFailures=0, auditCandidates=0, auditFailures=0");
        var batch = PageRequest.of(0, 50);
        verify(reports).findRetentionCandidates(eq(ChatRetentionPolicy.TERMINAL_STATUSES),
                eq(ChatReport.RetentionCategory.GENERAL_REPORT), eq(now.minusYears(1)),
                eq(ChatReport.RetentionCategory.CONSUMER_DISPUTE), eq(now.minusYears(3)),
                eq(ChatReport.RetentionCategory.CONTRACT_PAYMENT), eq(now.minusYears(5).minusDays(1)), eq(now), eq(batch));
        verify(messages).findExpired(eq(now.minusDays(90)), eq(ChatRetentionPolicy.ACTIVE_STATUSES),
                eq(ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES), eq(now), eq(batch));
        verify(audits).findRetentionCandidates(eq(now.minusYears(1)), eq(ChatRetentionPolicy.ACTIVE_STATUSES),
                eq(ChatReport.RetentionCategory.UNCLASSIFIED), eq(batch));
        verifyNoInteractions(retention);
    }

    @Test void itemFailuresRemainIsolatedAndTheSummaryReportsCandidatesNotPurges() {
        enablePolicy();
        candidates(List.of(report(210001L), report(210002L)),
                List.of(message(310001L), message(310002L)), List.of(audit(410001L), audit(410002L)));
        var failure = new IllegalStateException("private message and credential");
        doThrow(failure).when(retention).purgeReport(eq(120001L), eq(210001L), any());
        doThrow(failure).when(retention).purge(eq(120001L), eq(310001L), any());
        doThrow(failure).when(retention).purgeAccessAudit(eq(410001L), any());
        scheduler.sweep();
        var runAt = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(policy).isActive(runAt.capture());
        LocalDateTime now = runAt.getValue();
        assertThat(completions()).containsExactly("Chat retention sweep completed: runAtUtc=" + now.atOffset(ZoneOffset.UTC)
                + ", reportCandidates=2, reportFailures=1, messageCandidates=2, messageFailures=1, auditCandidates=2, auditFailures=1");
        var order = inOrder(reports, messages, audits, retention);
        order.verify(reports).findRetentionCandidates(anyCollection(), any(), any(), any(), any(), any(), any(), any(), any());
        order.verify(retention).purgeReport(120001L, 210001L, now);
        order.verify(retention).purgeReport(120001L, 210002L, now);
        order.verify(messages).findExpired(any(), anyCollection(), anyCollection(), any(), any());
        order.verify(retention).purge(120001L, 310001L, now);
        order.verify(retention).purge(120001L, 310002L, now);
        order.verify(audits).findRetentionCandidates(any(), anyCollection(), any(), any());
        order.verify(retention).purgeAccessAudit(410001L, now);
        order.verify(retention).purgeAccessAudit(410002L, now);
        order.verifyNoMoreInteractions();
    }

    @Test void realPublicationGracePreventsQueriesAndCompletionLogs() {
        var beforeGrace = new ChatRetentionPolicy(true, OffsetDateTime.now(ZoneOffset.UTC).minusDays(1).toString(), "1");
        new ChatRetentionScheduler(messages, retention, reports, audits, beforeGrace).sweep();
        verifyNoInteractions(messages, retention, reports, audits);
        assertThat(completions()).isEmpty();
    }

    @Test void aQueryFailureCannotBeReportedAsACompletedSweep() {
        when(policy.isActive(any())).thenReturn(true);
        var failure = new IllegalStateException("private database detail");
        when(reports.findRetentionCandidates(anyCollection(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(failure);
        assertThatThrownBy(scheduler::sweep).isSameAs(failure);
        verifyNoInteractions(messages, audits, retention);
        assertThat(completions()).isEmpty();
    }

    private void enablePolicy() {
        when(policy.isActive(any())).thenReturn(true);
        when(policy.messageCutoff(any())).thenAnswer(call -> ((LocalDateTime) call.getArgument(0)).minusDays(90));
        when(policy.auditCutoff(any())).thenAnswer(call -> ((LocalDateTime) call.getArgument(0)).minusYears(1));
    }

    private void candidates(List<ChatReportRepository.RetentionCandidate> reportCandidates,
                            List<ChatMessageRepository.RetentionCandidate> messageCandidates,
                            List<ChatReportAccessAuditRepository.RetentionCandidate> auditCandidates) {
        when(reports.findRetentionCandidates(anyCollection(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(reportCandidates);
        when(messages.findExpired(any(), anyCollection(), anyCollection(), any(), any())).thenReturn(messageCandidates);
        when(audits.findRetentionCandidates(any(), anyCollection(), any(), any())).thenReturn(auditCandidates);
    }

    private ChatReportRepository.RetentionCandidate report(Long id) {
        var candidate = mock(ChatReportRepository.RetentionCandidate.class);
        when(candidate.getId()).thenReturn(id);
        when(candidate.getRoomId()).thenReturn(120001L);
        return candidate;
    }

    private ChatMessageRepository.RetentionCandidate message(Long id) {
        var candidate = mock(ChatMessageRepository.RetentionCandidate.class);
        when(candidate.getId()).thenReturn(id);
        when(candidate.getRoomId()).thenReturn(120001L);
        return candidate;
    }

    private ChatReportAccessAuditRepository.RetentionCandidate audit(Long id) {
        var candidate = mock(ChatReportAccessAuditRepository.RetentionCandidate.class);
        when(candidate.getId()).thenReturn(id);
        return candidate;
    }

    private List<String> completions() {
        return appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                .filter(message -> message.startsWith("Chat retention sweep completed: ")).toList();
    }
}
