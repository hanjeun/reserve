package kr.it.reserve.member.entity;

/**
 * 인증 제공자 타입
 * LOCAL: 일반 회원가입 (이메일/비밀번호)
 * GOOGLE, NAVER, KAKAO: 소셜 로그인
 */
public enum AuthProvider {
    LOCAL,
    GOOGLE,
    NAVER,
    KAKAO
}
