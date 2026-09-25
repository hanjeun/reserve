package kr.it.reserve.member.repository;

import kr.it.reserve.member.entity.MarketingConsentHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MarketingConsentHistoryRepository extends JpaRepository<MarketingConsentHistory, Long> {
    List<MarketingConsentHistory> findByMemberIdOrderByCreatedAtAsc(Long memberId);
}
