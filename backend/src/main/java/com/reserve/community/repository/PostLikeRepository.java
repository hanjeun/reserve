package com.reserve.community.repository;

import com.reserve.community.entity.PostLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike, Long> {

    // 특정 사용자가 특정 게시글에 좋아요를 눌렀는지 확인
    Optional<PostLike> findByPostIdAndMemberId(Long postId, Long memberId);

    // 특정 사용자가 특정 게시글에 좋아요를 눌렀는지 여부
    boolean existsByPostIdAndMemberId(Long postId, Long memberId);

    // 특정 게시글의 좋아요 개수
    Long countByPostId(Long postId);

    // 특정 게시글들의 모든 좋아요 삭제
    @Modifying
    @Query("DELETE FROM PostLike pl WHERE pl.post.id IN :postIds")
    void deleteByPostIds(@Param("postIds") List<Long> postIds);

    // 특정 회원의 모든 좋아요 삭제
    @Modifying
    @Query("DELETE FROM PostLike pl WHERE pl.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") Long memberId);
}
