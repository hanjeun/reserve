package kr.it.reserve.notice.repository;

import kr.it.reserve.notice.entity.Notice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NoticeRepository extends JpaRepository<Notice, Long> {

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Notice n SET n.viewCount = n.viewCount + 1 WHERE n.id = :id")
    int incrementViewCount(@Param("id") Long id);

    // 중요 공지 먼저, 그 다음 최신순 정렬 - author fetch join으로 N+1 방지
    @Query("SELECT n FROM Notice n JOIN FETCH n.author ORDER BY n.isImportant DESC, n.createdAt DESC")
    List<Notice> findAllOrderByImportantAndCreatedAt();

    /** 홈 운영 안내용 상한 조회. 공개 화면이 긴 공지 본문 전체를 무제한으로 읽지 않게 한다. */
    @Query("SELECT n FROM Notice n ORDER BY n.isImportant DESC, n.createdAt DESC")
    List<Notice> findHighlights(Pageable pageable);

    // 중요 공지만 조회
    List<Notice> findByIsImportantTrueOrderByCreatedAtDesc();

    // 특정 회원의 모든 공지사항 삭제 (관리자 탈퇴 시)
    @Modifying
    @Query("DELETE FROM Notice n WHERE n.author.id = :memberId")
    void deleteByAuthorId(@Param("memberId") Long memberId);
}
