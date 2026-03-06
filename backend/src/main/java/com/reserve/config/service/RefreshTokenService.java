package com.reserve.config.service;

import com.reserve.config.jwt.entity.RefreshToken;
import com.reserve.config.jwt.repository.RefreshTokenRepository;
import com.reserve.global.error.AuthException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    public RefreshToken findByRefreshToken(String refreshToken) {
        return refreshTokenRepository.findByRefreshToken(refreshToken)
                .orElseThrow(() -> new AuthException("존재하지 않거나 만료된 리프레시 토큰입니다."));
    }
}