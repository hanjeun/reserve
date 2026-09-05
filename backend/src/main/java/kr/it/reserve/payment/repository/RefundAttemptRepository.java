package kr.it.reserve.payment.repository;

import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.entity.RefundAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 환불 원장 조회. 이 리포지토리의 존재 이유는 <b>"미결 건을 뽑을 수 있다"</b> 하나다 —
 * 그게 안 되면 로그와 다를 바 없다({@link RefundAttempt} 주석 참고).
 *
 * <p>미결 상태 집합은 {@link RefundAttempt#UNRESOLVED} 한 곳에서만 정의한다.
 * JPQL 안에 enum 을 문자열로 박아 넣지 않는 이유이기도 하다 — 이름이 바뀌면
 * 컴파일은 통과하고 <b>런타임에</b> 깨지는데, 하필 이 쿼리는 "미결 건이 0개"라는
 * 가장 안심되는 모습으로 실패한다.
 */
@Repository
public interface RefundAttemptRepository extends JpaRepository<RefundAttempt, Long> {

    /**
     * 아직 결말이 안 난 시도들. 스케줄러가 재조회할 대상이다.
     *
     * <p>{@code createdAt < cutoff} 를 두는 이유: 방금 만들어진 건은 <b>지금 처리 중</b>일 수 있다.
     * 바로 집으면 진행 중인 환불을 스케줄러가 동시에 건드린다.
     */
    @Query("""
            SELECT new kr.it.reserve.payment.dto.UnresolvedRefundView(
                       ra.id, ra.paymentId, ra.merchantUid, ra.requestedAmount, ra.reason, ra.resolveAttempts)
            FROM RefundAttempt ra
            WHERE ra.status IN :statuses AND ra.createdAt < :cutoff
            ORDER BY ra.createdAt ASC
            """)
    List<UnresolvedRefundView> findUnresolvedBefore(
            @Param("statuses") Collection<RefundAttempt.Status> statuses,
            @Param("cutoff") LocalDateTime cutoff);

    /** 관리자 화면용 — 최신순 전건. */
    Page<RefundAttempt> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** 관리자 화면용 — 미결만. <b>이 목록이 비어 있는 게 정상 상태다.</b> */
    Page<RefundAttempt> findByStatusInOrderByCreatedAtDesc(
            Collection<RefundAttempt.Status> statuses, Pageable pageable);

    /** 특정 결제의 시도 이력 — 대사용. */
    List<RefundAttempt> findByPaymentIdOrderByCreatedAtAsc(Long paymentId);

    /** 알림·대시보드용 미결 건수. */
    long countByStatusIn(Collection<RefundAttempt.Status> statuses);

    @Query("""
            SELECT COUNT(ra) FROM RefundAttempt ra
             WHERE ra.status IN :statuses
               AND ra.paymentId IN (
                   SELECT p.id FROM Payment p WHERE p.reservation.store.id = :storeId)
            """)
    long countUnresolvedByStoreId(
            @Param("storeId") Long storeId,
            @Param("statuses") Collection<RefundAttempt.Status> statuses);

    @Query("""
            SELECT COUNT(ra) FROM RefundAttempt ra
             WHERE ra.status IN :statuses
               AND ra.paymentId IN (
                   SELECT p.id FROM Payment p WHERE p.member.id = :memberId)
            """)
    long countUnresolvedByMemberId(
            @Param("memberId") Long memberId,
            @Param("statuses") Collection<RefundAttempt.Status> statuses);
}
