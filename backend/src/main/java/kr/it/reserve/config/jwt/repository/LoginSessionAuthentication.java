package kr.it.reserve.config.jwt.repository;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.member.entity.Member;

/** 요청의 현재 회원과 기기 세션을 잠금 없이 함께 조회한다. */
public record LoginSessionAuthentication(Member member, RefreshToken session, Boolean mfaEnabled) {
    public LoginSessionAuthentication(Member member, RefreshToken session) { this(member, session, null); }
}
