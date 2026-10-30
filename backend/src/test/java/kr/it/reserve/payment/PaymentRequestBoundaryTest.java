package kr.it.reserve.payment;

import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.controller.PaymentApiController;
import kr.it.reserve.payment.controller.PaymentCheckoutReturnController;
import kr.it.reserve.payment.dto.PaymentCheckoutReturnResponse;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class PaymentRequestBoundaryTest {
    private final PaymentService payments = mock(PaymentService.class);
    private final PaymentVerificationService verification = mock(PaymentVerificationService.class);
    private final PaymentCheckoutReturnService returns = mock(PaymentCheckoutReturnService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private MockMvc mvc;
    @BeforeEach void setUp() {
        mvc = standaloneSetup(new PaymentApiController(payments, verification, mock(PortoneService.class),
                        mock(PaymentRepository.class), limiter), new PaymentCheckoutReturnController(returns, limiter))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                Member.builder().id(1L).build(), null, List.of()));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest @CsvSource(value = {
            "prepare|{}", "prepare|{\"reservationId\":0}", "verify|{}", "verify|{\"merchantUid\":\" \"}",
            "refund|{}", "refund|{\"reservationId\":-1}", "checkout-return|{}"
    }, delimiter = '|')
    void missingAndInvalidIdentifiersStopBeforePaymentWork(String path, String body) throws Exception {
        mvc.perform(post("/api/payment/" + path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(payments, verification, returns);
    }

    @Test void oversizedUntrustedStringsDoNotReachDatabaseOrPg() throws Exception {
        mvc.perform(post("/api/payment/verify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"merchantUid\":\"" + "x".repeat(256) + "\"}" )).andExpect(status().isBadRequest());
        mvc.perform(post("/api/payment/refund").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reservationId\":1,\"refundReason\":\"" + "x".repeat(501) + "\"}" )).andExpect(status().isBadRequest());
        verifyNoInteractions(payments, verification, returns);
    }

    @ParameterizedTest @CsvSource(value = {"prepare|{\"reservationId\":1}", "verify|{\"merchantUid\":\"ORDER-test\"}",
            "refund|{\"reservationId\":1}", "checkout-return|{\"merchantUid\":\"ORDER-test\"}"}, delimiter = '|')
    void rateLimitStopsAllCostlyMemberPaymentOperations(String path, String body) throws Exception {
        mvc.perform(post("/api/payment/" + path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(payments, verification, returns);
    }

    @Test void checkoutReturnUsesAuthenticatedMemberAndIsNeverCached() throws Exception {
        when(limiter.tryConsume("member:1", RateLimiter.Policy.PAYMENT_VERIFY)).thenReturn(true);
        when(returns.check("ORDER-test", 1L)).thenReturn(new PaymentCheckoutReturnResponse("ORDER-test",
                PaymentCheckoutReturnResponse.Outcome.INCOMPLETE, 3L));
        mvc.perform(post("/api/payment/checkout-return").contentType(MediaType.APPLICATION_JSON)
                .content("{\"merchantUid\":\"ORDER-test\",\"memberId\":99}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.outcome").value("INCOMPLETE"));
        verify(returns).check("ORDER-test", 1L);
    }
}
