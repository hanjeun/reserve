package com.reserve.member.repository;

import com.reserve.member.entity.AuthProvider;
import com.reserve.member.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmailAndDeletedAtIsNull(String email);

    // 관리자용 — 삭제되지 않은 전체 회원 목록
    Page<Member> findByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

    // 하위 호환 — 삭제된 계정 포함 (비밀번호 재설정 등 예외 케이스)
    Optional<Member> findByEmail(String email);

    // OAuth2 로그인용: provider와 providerId로 회원 조회
    Optional<Member> findByProviderAndProviderIdAndDeletedAtIsNull(AuthProvider provider, String providerId);

    // 하위 호환
    Optional<Member> findByProviderAndProviderId(AuthProvider provider, String providerId);

    @Modifying
    @Query("UPDATE Member m SET m.deletedAt = NULL WHERE m.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM Member m WHERE m.deletedAt IS NOT NULL AND m.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(LocalDateTime cutoff);
}

