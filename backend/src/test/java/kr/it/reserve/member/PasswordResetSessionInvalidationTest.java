package kr.it.reserve.member;

import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.PasswordResetToken;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import kr.it.reserve.member.service.PasswordResetService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasswordResetSessionInvalidationTest {

    @Mock private MemberRepository memberRepository;
    @Mock private PasswordResetTokenRepository tokenRepository;
    @Mock private EmailService emailService;
    @Mock private BCryptPasswordEncoder passwordEncoder;
    @Mock private PwnedPasswordChecker pwnedPasswordChecker;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @InjectMocks private PasswordResetService passwordResetService;

    @Test
    void successfulResetInvalidatesEveryRefreshSession() {
        String email = "reset@example.com";
        String password = "NewPassword123!";
        PasswordResetToken token = PasswordResetToken.builder()
                .email(email)
                .token("123456")
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .build();
        token.markVerified();
        Member member = Member.builder().id(33L).email(email).password("old-hash").build();
        when(tokenRepository.findTopByEmailOrderByIdDesc(email)).thenReturn(Optional.of(token));
        when(memberRepository.findActiveByEmailForUpdate(email)).thenReturn(Optional.of(member));
        when(pwnedPasswordChecker.isPwned(password)).thenReturn(false);
        when(passwordEncoder.encode(password)).thenReturn("new-hash");

        passwordResetService.resetPassword(email, "123456", password);

        assertThat(member.getPassword()).isEqualTo("new-hash");
        assertThat(member.getAuthVersion()).isEqualTo(1);
        verify(refreshTokenRepository).deleteByMemberId(33L);
        verify(tokenRepository).deleteByEmail(email);
    }
}
