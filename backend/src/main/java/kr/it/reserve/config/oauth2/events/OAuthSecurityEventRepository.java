package kr.it.reserve.config.oauth2.events;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthSecurityEventRepository extends JpaRepository<OAuthSecurityEventRecord, Long> {
    boolean existsByEventHash(String eventHash);
}
