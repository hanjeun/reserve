package kr.it.reserve.feed;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.util.Set;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class FeedPolicy {
    public static final int MAX_IMAGES = 6;
    public static final long MAX_IMAGE_BYTES = 7L * 1024 * 1024;
    public static final int DELETE_GRACE_DAYS = 30;
    public static final int REPORT_RETENTION_DAYS = 365;
    public static final Set<String> REGIONS = Set.of("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주");
    private final boolean enabled;
    private final int accessAuditYears;
    @Autowired
    public FeedPolicy(@Value("${FEED_ENABLED:false}") boolean enabled,
                      @Value("${feed.retention.access-audit-years:1}") String auditYears) {
        this.enabled = enabled;
        if ("1".equals(auditYears)) accessAuditYears = 1;
        else if ("2".equals(auditYears)) accessAuditYears = 2;
        else {
            accessAuditYears = 0;
            log.warn("Feed audit retention disabled: invalid access audit period");
        }
    }
    public FeedPolicy(boolean enabled) { this(enabled, "1"); }
    public boolean isEnabled() { return enabled; }
    public void requireEnabled() {
        if (!enabled) throw new FeedException("피드를 준비 중이에요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    /** 관리자 원문/사진 열람 정책. API 비활성화와 무관하며 잘못된 기간은 파기를 중지한다. */
    public LocalDateTime accessAuditCutoff(LocalDateTime now) {
        return accessAuditYears == 0 || now == null ? null : now.minusYears(accessAuditYears);
    }
    public static String region(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().replaceAll("\\s+", " ");
        String[] parts = normalized.split(" ");
        if (normalized.length() > 50 || parts.length > 2 || !REGIONS.contains(parts[0])
                || parts.length == 2 && !parts[1].matches("[가-힣A-Za-z0-9·-]+")) {
            throw FeedException.invalid("지역을 다시 선택해주세요.");
        }
        return normalized;
    }
}
