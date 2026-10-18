package kr.it.reserve.config.updates;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.waiting.controller.CustomerWaitingApiController;
import kr.it.reserve.waiting.service.CustomerWaitingService;
import kr.it.reserve.waiting.service.WaitingEventStream;
import kr.it.reserve.waiting.service.WaitingRetentionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class StreamOAuthContextControllerTest {
    @AfterEach
    void clearContext() { SecurityContextHolder.clearContext(); }

    @Test
    void bothPrivateStreamControllersForwardTheCapturedClaimRatherThanTheLatestMemberAuthentication() {
        LocalDateTime original = LocalDateTime.of(2026, 10, 16, 8, 0);
        Member member = Member.builder().id(1L).role(Role.USER).oauthAuthenticatedAt(original.plusHours(1)).build();
        var authentication = new UsernamePasswordAuthenticationToken(member, null, List.of());
        authentication.setDetails(new SecurityUtil.OAuthAuthenticationDetails(original));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        EntityUpdateStream entities = mock(EntityUpdateStream.class);
        WaitingEventStream waiting = mock(WaitingEventStream.class);
        SseEmitter emitter = new SseEmitter(1_000L);
        when(entities.subscribe(member, original)).thenReturn(emitter);
        when(waiting.subscribe(member, original)).thenReturn(emitter);

        assertThat(new EntityUpdateController(entities).events(new MockHttpServletResponse())).isSameAs(emitter);
        assertThat(new CustomerWaitingApiController(mock(CustomerWaitingService.class), waiting,
                mock(RateLimiter.class), mock(WaitingRetentionService.class)).events().getBody()).isSameAs(emitter);

        verify(entities).subscribe(member, original);
        verify(waiting).subscribe(member, original);
    }

    @Test
    void missingOrUnrelatedAuthenticationDetailsRemainUnknown() {
        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isNull();
        Member member = Member.builder().id(1L).role(Role.USER).oauthAuthenticatedAt(LocalDateTime.now()).build();
        var authentication = new UsernamePasswordAuthenticationToken(member, null, List.of());
        authentication.setDetails("unrelated-web-details");
        SecurityContextHolder.getContext().setAuthentication(authentication);

        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isNull();
    }
}
