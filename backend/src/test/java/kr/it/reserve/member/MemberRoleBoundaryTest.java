package kr.it.reserve.member;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.dto.MemberResponse;
import kr.it.reserve.member.dto.MemberSignupRequest;
import kr.it.reserve.member.dto.MemberUpdateRequest;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 공개 회원 API에서 역할은 입력값이 아니라 서버가 소유하는 상태라는 계약을 고정한다.
 */
@ExtendWith(MockitoExtension.class)
class MemberRoleBoundaryTest {

    private static final String EMAIL = "role-boundary@example.com";
    private static final String PASSWORD = "SafePassw0rd!";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock private MemberRepository memberRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private EmailVerificationService emailVerificationService;
    @Mock private PwnedPasswordChecker pwnedPasswordChecker;

    @InjectMocks
    private MemberService memberService;

    @ParameterizedTest(name = "회원가입 role={0} 주입을 버리고 USER로 저장")
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    @DisplayName("회원가입 요청의 상승 역할을 무시하고 USER로 저장한다")
    void signupAlwaysPersistsUserRole(Role injectedRole) throws Exception {
        MemberSignupRequest request = objectMapper.readValue("""
                {
                  "name": "가입자",
                  "email": "%s",
                  "password": "%s",
                  "passwordConfirm": "%s",
                  "role": "%s",
                  "termsAgreed": true,
                  "marketingAgreed": false
                }
                """.formatted(EMAIL, PASSWORD, PASSWORD, injectedRole.name()), MemberSignupRequest.class);

        when(memberRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(emailVerificationService.isEmailVerified(EMAIL)).thenReturn(true);
        when(pwnedPasswordChecker.isPwned(PASSWORD)).thenReturn(false);
        when(passwordEncoder.encode(PASSWORD)).thenReturn("encoded-password");
        when(memberRepository.save(any(Member.class))).thenAnswer(invocation -> {
            Member saved = invocation.getArgument(0);
            saved.setId(1L);
            return saved;
        });

        memberService.join(request);

        ArgumentCaptor<Member> savedMember = ArgumentCaptor.forClass(Member.class);
        verify(memberRepository).save(savedMember.capture());
        assertThat(savedMember.getValue().getRole()).isEqualTo(Role.USER);
    }

    @ParameterizedTest(name = "기존 {0} 역할을 본인 수정에서 보존")
    @EnumSource(Role.class)
    @DisplayName("본인 수정 요청의 role 필드를 무시하고 기존 역할을 보존한다")
    void selfUpdateCannotChangeExistingRole(Role existingRole) throws Exception {
        Member member = Member.builder()
                .id(1L)
                .name("수정 전")
                .email(EMAIL)
                .password("encoded-password")
                .role(existingRole)
                .provider(AuthProvider.LOCAL)
                .build();
        MemberUpdateRequest request = objectMapper.readValue("""
                {"name":"수정 후","role":"ADMIN"}
                """, MemberUpdateRequest.class);

        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.of(member));
        when(memberRepository.save(member)).thenReturn(member);

        MemberResponse response = memberService.updateMember(1L, request);

        assertThat(member.getName()).isEqualTo("수정 후");
        assertThat(member.getRole()).isEqualTo(existingRole);
        assertThat(response.getRole()).isEqualTo(existingRole);
        verify(memberRepository).save(member);
    }
}
