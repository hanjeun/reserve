package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatIntro;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ChatIntroRepository extends JpaRepository<ChatIntro, Long> {

    Optional<ChatIntro> findByScopeKey(String scopeKey);
}
