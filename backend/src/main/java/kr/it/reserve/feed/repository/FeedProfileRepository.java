package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedProfile;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FeedProfileRepository extends JpaRepository<FeedProfile, Long> {
    Optional<FeedProfile> findByMember_Id(Long memberId);
    Optional<FeedProfile> findByPublicId(String publicId);
    @EntityGraph(attributePaths = "member")
    List<FeedProfile> findByMember_IdIn(Collection<Long> ids);
    boolean existsByNicknameKeyAndMember_IdNot(String nicknameKey, Long memberId);
}
