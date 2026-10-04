package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.chat.dto.ChatRetentionPolicyResponse;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ChatRetentionPolicyTest {
    private final LocalDateTime now = LocalDateTime.of(2026, 10, 1, 12, 0);
    private final ChatRetentionPolicy policy = new ChatRetentionPolicy(true, "2026-08-31T21:00:00+09:00", "1");

    @Test void missingInvalidFutureOrDisabledPublicationCannotAgeIntoPermission() {
        for (String notice : new String[]{"", "invalid", "2090-01-01T00:00:00Z"}) {
            var invalid = new ChatRetentionPolicy(true, notice, "1");
            assertThat(invalid.isActive(now.plusYears(100))).isFalse();
            assertThat(ChatRetentionPolicyResponse.from(invalid, now).noticePublishedAt()).isNull();
        }
        assertThat(new ChatRetentionPolicy(false, "2026-08-01T00:00:00Z", "1").isActive(now)).isFalse();
        assertThat(new ChatRetentionPolicy(true, "2026-08-01T00:00:00Z", "0").isActive(now)).isFalse();
    }

    @Test void publicationGraceMessageAgeAndAuditYearsUseSeparateStrictBoundaries() {
        var published = LocalDateTime.of(2026, 8, 31, 12, 0);
        assertThat(policy.isActive(published.plusDays(30).minusNanos(1))).isFalse();
        assertThat(policy.isActive(published.plusDays(30))).isTrue();
        assertThat(policy.canPurgeMessage(now.minusDays(90), now)).isFalse();
        assertThat(policy.canPurgeMessage(now.minusDays(90).minusNanos(1), now)).isTrue();
        assertThat(policy.auditCutoff(now)).isEqualTo(now.minusYears(1));
        assertThat(new ChatRetentionPolicy(true, "2026-08-01T00:00:00Z", "2").auditCutoff(now))
                .isEqualTo(now.minusYears(2));
        var publicPolicy = ChatRetentionPolicyResponse.from(policy, now);
        assertThat(publicPolicy.noticePublishedAt().toLocalDateTime()).isEqualTo(published);
        assertThat(publicPolicy.effectiveAt().toLocalDateTime()).isEqualTo(published.plusDays(30));
    }

    @Test void unresolvedUnclassifiedAndManualHoldsNeverExpire() {
        var report = report(ChatReport.RetentionCategory.GENERAL_REPORT, now.minusYears(6));
        report.review(ChatReport.Status.REVIEWING, "확인 중", 7L, now.minusYears(6));
        assertThat(policy.canPurgeReport(report, now)).isFalse();
        report.review(ChatReport.Status.RESOLVED, "처리 완료", 7L, now.minusYears(6));
        report.changeRetention(ChatReport.RetentionCategory.UNCLASSIFIED, false, null, "분류 확인", 7L, now);
        assertThat(policy.canPurgeReport(report, now)).isFalse();
        report.changeRetention(ChatReport.RetentionCategory.GENERAL_REPORT, true, null, "분쟁 보류", 7L, now);
        assertThat(policy.canPurgeReport(report, now)).isFalse();
    }

    @Test void generalAndConsumerReportsExpireFromResolutionAndContractFromActualBasis() {
        var general = report(ChatReport.RetentionCategory.GENERAL_REPORT, now.minusYears(1));
        assertThat(policy.canPurgeReport(general, now)).isFalse();
        assertThat(policy.canPurgeReport(general, now.plusSeconds(1))).isTrue();
        var consumer = report(ChatReport.RetentionCategory.CONSUMER_DISPUTE, now.minusYears(3));
        assertThat(policy.canPurgeReport(consumer, now)).isFalse();
        assertThat(policy.canPurgeReport(consumer, now.plusSeconds(1))).isTrue();
        var contract = report(ChatReport.RetentionCategory.CONTRACT_PAYMENT, now.minusYears(6));
        assertThat(policy.reportExpiresAt(contract)).isNull();
        contract.changeRetention(ChatReport.RetentionCategory.CONTRACT_PAYMENT, false, now.minusYears(5), "공급일", 7L, now);
        assertThat(policy.canPurgeReport(contract, now)).isFalse();
        assertThat(policy.canPurgeReport(contract, now.plusDays(1).plusSeconds(1))).isTrue();
    }

    @Test void correctingCategoryOrBasisCannotShortenEstablishedStatutoryFloor() {
        var report = report(ChatReport.RetentionCategory.CONTRACT_PAYMENT, now.minusYears(4));
        report.changeRetention(ChatReport.RetentionCategory.CONTRACT_PAYMENT, false, now.minusYears(4), "결제일", 7L, now);
        var minimum = report.getMinimumRetentionUntil();
        report.changeRetention(ChatReport.RetentionCategory.GENERAL_REPORT, false, null, "분류 정정", 7L, now);
        assertThat(report.getMinimumRetentionUntil()).isEqualTo(minimum);
        assertThat(policy.canPurgeReport(report, now)).isFalse();
        assertThat(policy.reportExpiresAt(report)).isEqualTo(minimum);
    }

    private ChatReport report(ChatReport.RetentionCategory category, LocalDateTime reviewedAt) {
        return ChatReport.builder().id(5L).status(ChatReport.Status.RESOLVED).retentionCategory(category)
                .reviewedAt(reviewedAt).build();
    }
}
