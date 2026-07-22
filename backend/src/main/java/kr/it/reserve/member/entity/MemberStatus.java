package kr.it.reserve.member.entity;

public enum MemberStatus {
    ACTIVE,     // 정상
    SUSPENDED,  // 기간 정지 (suspendedUntil까지)
    BANNED      // 영구 정지
}
