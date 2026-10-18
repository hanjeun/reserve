package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface FeedProfileRepository extends JpaRepository<FeedProfile, Long> {
    Optional<FeedProfile> findByMember_Id(Long memberId);
    Optional<FeedProfile> findByPublicId(String publicId);
    boolean existsByNicknameKeyAndMember_IdNot(String nicknameKey, Long memberId);
}
