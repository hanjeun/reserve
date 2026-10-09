package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.service.ChatMessageVisibilityService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatMessageVisibilityControllerTest {
    private final ChatMessageVisibilityService service = mock(ChatMessageVisibilityService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final ChatMessageVisibilityController controller = new ChatMessageVisibilityController(service, limiter);
    private final Member actor = Member.builder().id(9L).build();

    @AfterEach void clearSession() { SecurityContextHolder.clearContext(); }

    @Test void missingLoginCannotReachRateLimitOrDeletion() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> controller.hide(1L, 2L)).isInstanceOf(MemberException.class);
        verifyNoInteractions(limiter, service);
    }

    @Test void deletionActorIsAlwaysTheAuthenticatedMember() {
        authenticate();
        when(limiter.tryConsume("member-9", RateLimiter.Policy.CHAT_SEND)).thenReturn(true);
        when(service.hide(actor, 1L, 2L)).thenReturn(ChatMessageResponse.builder().id(2L).hidden(true).build());
        var response = controller.hide(1L, 2L);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(service).hide(actor, 1L, 2L);
    }

    @Test void exceededRateLimitCannotWriteVisibilityRows() {
        authenticate();
        assertThat(controller.hide(1L, 2L).getStatusCode().value()).isEqualTo(429);
        verifyNoInteractions(service);
    }

    private void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }
}
