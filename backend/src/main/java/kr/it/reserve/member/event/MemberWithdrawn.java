package kr.it.reserve.member.event;

/** 탈퇴 처리의 동일 트랜잭션 안에서 개인 자료 정리를 요청한다. */
public record MemberWithdrawn(Long memberId) {}
