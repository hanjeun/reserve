package kr.it.reserve.config.jwt.repository;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.member.entity.Member;

/** One request's current member and device session, loaded by the same non-locking query. */
public record LoginSessionAuthentication(Member member, RefreshToken session) { }
