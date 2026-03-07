package com.reserve.config.jwt.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Getter
@Entity
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "refresh_token", nullable = false, columnDefinition = "TEXT")
    private String refreshToken;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    public RefreshToken(Long memberId, String refreshToken, LocalDateTime expiresAt) {
        this.memberId = memberId;
        this.refreshToken = refreshToken;
        this.expiresAt = expiresAt;
    }

    public RefreshToken update(String newToken, LocalDateTime newExpiresAt) {
        this.refreshToken = newToken;
        this.expiresAt = newExpiresAt;
        return this;
    }

    public boolean isExpired() {
        if (this.expiresAt == null) return true; // null이면 만료된 것으로 처리
        return LocalDateTime.now().isAfter(this.expiresAt);
    }
}
