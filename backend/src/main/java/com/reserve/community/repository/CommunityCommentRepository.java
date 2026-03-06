package com.reserve.community.repository;

import com.reserve.community.entity.CommunityComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {

    // 게시글별 댓글 조회 - author fetch join으로 N+1 방지
    @Query("SELECT c FROM CommunityComment c JOIN FETCH c.author WHERE c.post.id = :postId ORDER BY c.createdAt ASC")
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(@Param("postId") Long postId);

    // 게시글별 댓글 개수
    Long countByPostId(Long postId);

    // 특정 게시글들의 모든 댓글 삭제
    @Modifying
    @Query("DELETE FROM CommunityComment c WHERE c.post.id IN :postIds")
    void deleteByPostIds(@Param("postIds") List<Long> postIds);

    // 특정 회원의 모든 댓글 삭제
    @Modifying
    @Query("DELETE FROM CommunityComment c WHERE c.author.id = :memberId")
    void deleteByAuthorId(@Param("memberId") Long memberId);
}
