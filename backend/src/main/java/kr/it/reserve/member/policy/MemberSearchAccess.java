package kr.it.reserve.member.policy;

import jakarta.persistence.TypedQuery;
import kr.it.reserve.member.entity.MemberStatus;
import java.time.Clock;
import java.time.LocalDateTime;

/** 개인 검색은 현재 DB 회원 상태를 다시 확인한다. */
public final class MemberSearchAccess {
    private MemberSearchAccess() {}
    public static final String VISIBLE = """
            viewer.deletedAt IS NULL AND (viewer.status = :viewerActive
              OR (viewer.status = :viewerSuspended AND viewer.suspendedUntil < :viewerAt))
            """;
    public static final String EXISTS = "EXISTS (SELECT viewer.id FROM Member viewer WHERE viewer.id = :memberId AND " + VISIBLE + ")";
    public static <T> TypedQuery<T> bind(TypedQuery<T> query, Long memberId) {
        return query.setParameter("memberId", memberId).setParameter("viewerActive", MemberStatus.ACTIVE)
                .setParameter("viewerSuspended", MemberStatus.SUSPENDED)
                .setParameter("viewerAt", LocalDateTime.now(Clock.systemDefaultZone()));
    }
    public static void requireWindow(int limit) {
        if (limit < 1 || limit > 6) throw new IllegalArgumentException("Invalid personal search limit");
    }
}
