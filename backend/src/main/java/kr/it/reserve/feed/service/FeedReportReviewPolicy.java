package kr.it.reserve.feed.service;

import kr.it.reserve.feed.FeedException;
import org.springframework.http.HttpStatus;

/** 글·소식·댓글 신고를 같은 사유·편집 충돌 규칙으로 처리한다. */
public final class FeedReportReviewPolicy {
    private FeedReportReviewPolicy() {}

    public static void requireRevision(Long expected, long current) {
        requireRevision(expected, current, "다른 관리자가 신고를 변경했어요. 다시 불러와 검토해주세요.");
    }

    public static void requireRevision(Long expected, long current, String conflictMessage) {
        if (expected == null || expected < 0) throw FeedException.invalid("확인한 신고 버전이 필요해요. 다시 불러와주세요.");
        if (expected != current) throw new FeedException(conflictMessage, HttpStatus.CONFLICT);
    }

    public static String requiredNote(String value) {
        String note = FeedService.clean(value, 1000, "처리 이유");
        if (note.isBlank()) throw FeedException.invalid("처리 이유를 입력해주세요.");
        return note;
    }
}
