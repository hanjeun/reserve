package kr.it.reserve.global.security;

/** 공통 인증 정책은 회원 엔티티 대신 식별자와 인증 버전만 읽어요. */
public interface LoginIdentity {
    Long getId();
    int getAuthVersion();
}
