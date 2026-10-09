package kr.it.reserve.member;

import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.controller.MemberApiController;
import kr.it.reserve.member.dto.MemberResponse;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class MemberControllerPrincipalContractTest {
    private final MemberService service = mock(MemberService.class);
    private final CookieUtil cookies = mock(CookieUtil.class);
    private final MemberApiController controller = new MemberApiController(service, cookies);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    static Stream<Arguments> guardedProfileActions() {
        String missingMember = "인증된 사용자 정보를 찾을 수 없어요.";
        String denied = "수정 권한이 없어요.";
        return Stream.of(
                Arguments.of((Consumer<MemberApiController>) MemberApiController::getCurrentMember, missingMember),
                Arguments.of((Consumer<MemberApiController>) value -> value.updateMarketingConsent(Map.of()), missingMember),
                Arguments.of((Consumer<MemberApiController>) value -> value.updateLocation(null), missingMember),
                Arguments.of((Consumer<MemberApiController>) value -> value.updateMember(null), denied),
                Arguments.of((Consumer<MemberApiController>) value -> value.uploadProfileImage(null), denied),
                Arguments.of((Consumer<MemberApiController>) MemberApiController::deleteProfileImage, denied));
    }

    @ParameterizedTest
    @MethodSource("guardedProfileActions")
    void missingAuthenticationStopsBeforeProfileReadsOrWrites(Consumer<MemberApiController> action, String message) {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> action.accept(controller))
                .isInstanceOf(MemberException.class).hasMessage(message);
        verifyNoInteractions(service, cookies);
    }

    @Test
    void currentProfileIsReadFreshUsingOnlyTheAuthenticatedMemberId() {
        Member principal = Member.builder().id(7L).name("이전 이름").build();
        MemberResponse current = MemberResponse.fromEntity(Member.builder().id(7L).name("새 이름").build());
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
        when(service.getMemberResponse(7L)).thenReturn(current);

        var response = controller.getCurrentMember();

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(current);
        assertThat(response.getMessage()).isEqualTo("내 정보 조회 성공");
        verify(service).getMemberResponse(7L);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(cookies);
    }
}
