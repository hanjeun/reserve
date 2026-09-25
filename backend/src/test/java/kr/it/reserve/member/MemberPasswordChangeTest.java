package kr.it.reserve.member;

import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.dto.PasswordChangeRequest;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberPasswordChangeTest {

    private static final long MEMBER_ID = 9L;
    private static final String CURRENT = "Current123!";
    private static final String NEXT = "NextReserve456!";

    @Mock private MemberRepository memberRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private PwnedPasswordChecker pwnedPasswordChecker;
    @InjectMocks private MemberService memberService;

    private Member member;

    @BeforeEach
    void setUp() {
        member = Member.builder()
                .id(MEMBER_ID)
                .email("password@example.com")
                .password("current-hash")
                .provider(AuthProvider.LOCAL)
                .build();
        when(memberRepository.findActiveByIdForUpdate(MEMBER_ID)).thenReturn(Optional.of(member));
    }

    @Test
    void rejectsAChangeWithoutCurrentPasswordReauthentication() {
        PasswordChangeRequest request = request("wrong", NEXT, NEXT);
        when(passwordEncoder.matches("wrong", "current-hash")).thenReturn(false);

        assertThatThrownBy(() -> memberService.changePassword(MEMBER_ID, request))
                .isInstanceOf(MemberException.class)
                .hasMessageContaining("현재 비밀번호");

        verify(passwordEncoder, never()).encode(NEXT);
        verify(refreshTokenRepository, never()).deleteByMemberId(MEMBER_ID);
        assertThat(member.getPassword()).isEqualTo("current-hash");
    }

    @Test
    void changesThePasswordAndInvalidatesEveryRefreshSession() {
        PasswordChangeRequest request = request(CURRENT, NEXT, NEXT);
        when(passwordEncoder.matches(CURRENT, "current-hash")).thenReturn(true);
        when(passwordEncoder.matches(NEXT, "current-hash")).thenReturn(false);
        when(pwnedPasswordChecker.isPwned(NEXT)).thenReturn(false);
        when(passwordEncoder.encode(NEXT)).thenReturn("next-hash");

        memberService.changePassword(MEMBER_ID, request);

        assertThat(member.getPassword()).isEqualTo("next-hash");
        assertThat(member.getAuthVersion()).isEqualTo(1);
        verify(refreshTokenRepository).deleteByMemberId(MEMBER_ID);
    }

    private PasswordChangeRequest request(String current, String next, String confirmation) {
        PasswordChangeRequest request = new PasswordChangeRequest();
        request.setCurrentPassword(current);
        request.setNewPassword(next);
        request.setNewPasswordConfirm(confirmation);
        return request;
    }
}
