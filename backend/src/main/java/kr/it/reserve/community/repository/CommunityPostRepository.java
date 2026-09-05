package kr.it.reserve.community.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.community.entity.CommunityPost;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {

    // 카테고리별 조회 (페이징) - author fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM CommunityPost p JOIN FETCH p.author WHERE p.category = :category",
           countQuery = "SELECT COUNT(p) FROM CommunityPost p WHERE p.category = :category")
    Page<CommunityPost> findByCategory(@Param("category") CommunityPost.PostCategory category, Pageable pageable);

    // 전체 조회 (페이징) - author fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM CommunityPost p JOIN FETCH p.author",
           countQuery = "SELECT COUNT(p) FROM CommunityPost p")
    Page<CommunityPost> findAll(Pageable pageable);

    // 제목으로 검색
    Page<CommunityPost> findByTitleContaining(String keyword, Pageable pageable);

    // 제목 또는 내용으로 검색 - author fetch join으로 N+1 방지
    @Query(value = "SELECT p FROM CommunityPost p JOIN FETCH p.author WHERE p.title LIKE %:keyword% OR p.content LIKE %:keyword%",
           countQuery = "SELECT COUNT(p) FROM CommunityPost p WHERE p.title LIKE %:keyword% OR p.content LIKE %:keyword%")
    Page<CommunityPost> searchByTitleOrContent(@Param("keyword") String keyword, Pageable pageable);

    // 작성자별 게시글 조회
    Page<CommunityPost> findByAuthorId(Long authorId, Pageable pageable);

    // 인기 게시글 (좋아요 많은 순)
    List<CommunityPost> findTop10ByOrderByLikeCountDesc();

    // 단건 상세 조회 - author + comments fetch join으로 N+1 방지 (getPost 전용)
    @Query("SELECT DISTINCT p FROM CommunityPost p JOIN FETCH p.author LEFT JOIN FETCH p.comments WHERE p.id = :id")
    Optional<CommunityPost> findByIdWithAuthorAndComments(@Param("id") Long id);

    /** 좋아요 토글은 게시글별로 직렬화해 like_count의 갱신 유실을 막는다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM CommunityPost p WHERE p.id = :id")
    Optional<CommunityPost> findByIdForUpdate(@Param("id") Long id);

    /** 조회수는 엔티티 read-modify-write 대신 DB에서 한 문장으로 증가시킨다. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE CommunityPost p SET p.viewCount = p.viewCount + 1 WHERE p.id = :id")
    int incrementViewCount(@Param("id") Long id);

    // 댓글 개수 조회 (게시글 목록용 - comments 컬렉션 LAZY 로딩 방지)
    @Query("SELECT c.post.id, COUNT(c) FROM CommunityComment c WHERE c.post.id IN :postIds GROUP BY c.post.id")
    List<Object[]> countCommentsByPostIds(@Param("postIds") List<Long> postIds);

    // 특정 회원의 모든 게시글 ID 조회
    @Query("SELECT p.id FROM CommunityPost p WHERE p.author.id = :memberId")
    List<Long> findPostIdsByAuthorId(@Param("memberId") Long memberId);

    // 특정 회원의 모든 게시글 삭제
    @Modifying
    @Query("DELETE FROM CommunityPost p WHERE p.author.id = :memberId")
    void deleteByAuthorId(@Param("memberId") Long memberId);
}
