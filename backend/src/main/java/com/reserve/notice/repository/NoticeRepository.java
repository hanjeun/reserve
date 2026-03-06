package com.reserve.notice.repository;

import com.reserve.notice.entity.Notice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NoticeRepository extends JpaRepository<Notice, Long> {

    // 중요 공지 먼저, 그 다음 최신순 정렬 - author fetch join으로 N+1 방지
    @Query("SELECT n FROM Notice n JOIN FETCH n.author ORDER BY n.isImportant DESC, n.createdAt DESC")
    List<Notice> findAllOrderByImportantAndCreatedAt();

    // 중요 공지만 조회
    List<Notice> findByIsImportantTrueOrderByCreatedAtDesc();

    // 특정 회원의 모든 공지사항 삭제 (관리자 탈퇴 시)
    @Modifying
    @Query("DELETE FROM Notice n WHERE n.author.id = :memberId")
    void deleteByAuthorId(@Param("memberId") Long memberId);
}
