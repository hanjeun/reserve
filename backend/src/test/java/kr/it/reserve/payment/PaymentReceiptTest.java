package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.entity.AdPaymentAttempt;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PaymentReceiptTest {
    private static final String RECEIPT = "/api/v1/payment/receipt";
    private static final String LOOKUP = "/api/v1/admin/payment-operations/receipts/lookup";
    private static final String URL = "https://receipts.example.test/view?document=synthetic";
    private static final LocalDateTime PAID_AT = LocalDateTime.of(2026, 10, 1, 12, 0);

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired ReservationRepository reservations;
    @Autowired PaymentRepository payments;
    @Autowired AdPaymentAttemptRepository ads;
    @Autowired InquiryRepository inquiries;
    @Autowired AuditLogRepository audit;
    @MockitoBean PortoneService portone;

    private Member customer;
    private Member other;
    private Member admin;
    private Store store;
    private Payment hiddenOrder;

    @BeforeEach
    void seedHiddenReservation() {
        customer = member(Role.USER);
        other = member(Role.USER);
        admin = member(Role.ADMIN);
        store = stores.save(Store.builder().name("합성 가게").owner(other).category("카페").address("테스트 주소").build());
        var reservation = reservations.save(Reservation.builder().member(customer).store(store)
                .reservationDate(LocalDate.of(2026, 10, 1)).reservationTime(LocalTime.NOON).guestCount(1)
                .status(Reservation.ReservationStatus.CANCELLED).deletedAt(PAID_AT.plusDays(1)).build());
        hiddenOrder = payments.save(Payment.builder().member(customer).reservation(reservation).merchantUid("ORD-" + UUID.randomUUID())
                .status(Payment.PaymentStatus.REFUNDED).paidAt(PAID_AT).amount(10_000).refundAmount(10_000).build());
    }

    @Test
    void onlyAnOrderOwnerCanSeeAReceiptEvenAfterHidingTheReservation() throws Exception {
        var uid = hiddenOrder.getMerchantUid();
        mvc.perform(get(RECEIPT).param("merchantUid", uid)).andExpect(status().isUnauthorized());
        mvc.perform(get(RECEIPT).param("merchantUid", uid).with(as(other, "PASSWORD"))).andExpect(status().isNotFound());
        mvc.perform(get(RECEIPT).param("merchantUid", uid).with(as(admin, "PASSKEY"))).andExpect(status().isNotFound());
        verifyNoInteractions(portone);

        when(portone.getPaymentInfo(uid)).thenReturn(upstream("CANCELLED", 10_000, "\"receiptUrl\":\"" + URL + "\""));
        mvc.perform(get(RECEIPT).param("merchantUid", uid).with(as(customer, "PASSWORD")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.receiptUrl").value(URL));
        assertThat(payments.findById(hiddenOrder.getId()).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        verify(portone).getPaymentInfo(uid);
        verifyNoMoreInteractions(portone);
    }

    @Test
    void administratorUsesTheOwnersInquiryAndCommitsTheAuditBeforeCallingThePg() throws Exception {
        var uid = hiddenOrder.getMerchantUid();
        var request = inquiry(customer, uid, null);
        mvc.perform(post(LOOKUP).contentType(MediaType.APPLICATION_JSON).content(body(uid, request.getId())))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(LOOKUP).with(as(customer, "PASSKEY")).contentType(MediaType.APPLICATION_JSON).content(body(uid, request.getId())))
                .andExpect(status().isForbidden());
        mvc.perform(post(LOOKUP).with(as(admin, "PASSWORD")).contentType(MediaType.APPLICATION_JSON).content(body(uid, request.getId())))
                .andExpect(status().isForbidden());
        for (var invalid : List.of(inquiry(other, uid, null), inquiry(null, uid, UUID.randomUUID().toString()), inquiry(customer, uid + "X", null))) {
            mvc.perform(post(LOOKUP).with(as(admin, "PASSKEY")).contentType(MediaType.APPLICATION_JSON).content(body(uid, invalid.getId())))
                    .andExpect(status().isNotFound());
        }
        verifyNoInteractions(portone);

        when(portone.getPaymentInfo(uid)).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(audit.findByEntityTypeOrderByCreatedAtDesc("PAYMENT", PageRequest.of(0, 20)))
                    .filteredOn(log -> log.getEntityId().equals(hiddenOrder.getId()))
                    .singleElement().satisfies(log -> {
                        assertThat(log.getAction()).isEqualTo("RECEIPT_LOOKUP");
                        assertThat(log.getActorEmail()).isEqualTo("admin:" + admin.getId());
                        assertThat(log.getSnapshot()).contains("문의 번호", request.getId().toString())
                                .doesNotContain(URL, uid, customer.getEmail());
                    });
            return upstream("CANCELLED", 10_000, "\"receiptUrl\":\"" + URL + "\"");
        });
        mvc.perform(post(LOOKUP).with(as(admin, "PASSKEY")).contentType(MediaType.APPLICATION_JSON).content(body(uid, request.getId())))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.receiptUrl").value(URL)).andExpect(jsonPath("$.data.buyerEmail").doesNotExist());
        verify(portone).getPaymentInfo(uid);
        verifyNoMoreInteractions(portone);
    }

    @Test
    void paidAdsExposeIssuedCashReceiptAndSuppressMissingOrUnsafeLinks() throws Exception {
        var uid = "AD-" + UUID.randomUUID();
        var attempt = AdPaymentAttempt.create(Advertisement.builder().id(901L).store(store).merchantUid(uid).amount(8_000).build(), false);
        attempt.reviewed(AdPaymentAttempt.State.PAID, null);
        ads.save(attempt);
        var request = get(RECEIPT).param("type", "ad").param("merchantUid", uid).with(as(other, "PASSWORD"));
        when(portone.getPaymentInfo(uid)).thenReturn(
                upstream("PAID", 8_000, "\"cashReceipt\":{\"status\":\"ISSUED\",\"url\":\"" + URL + "\"}"),
                upstream("PAID", 8_000, "\"receiptUrl\":\"javascript:void(0)\""),
                upstream("PAID", 8_001, "\"receiptUrl\":\"" + URL + "\""));
        mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.data.receiptUrl").value(URL));
        mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.data.receiptUrl").doesNotExist());
        mvc.perform(request).andExpect(status().isConflict());
    }

    private Member member(Role role) {
        return members.save(Member.builder().name("합성 회원").email(UUID.randomUUID() + "@example.test").role(role).build());
    }

    private Inquiry inquiry(Member member, String order, String resendId) {
        return inquiries.save(Inquiry.builder().member(member).resendEmailId(resendId).category(Inquiry.InquiryCategory.PAYMENT)
                .title("결제 영수증 부탁드려요").content("주문번호: " + order).build());
    }

    private RequestPostProcessor as(Member member, String method) {
        var auth = new UsernamePasswordAuthenticationToken(member, null, List.of(new SimpleGrantedAuthority("ROLE_" + member.getRole())));
        auth.setDetails(new SecurityUtil.OAuthAuthenticationDetails(null, method, "synthetic-session"));
        return authentication(auth);
    }

    private String body(String uid, long inquiryId) {
        return "{\"type\":\"reservation\",\"merchantUid\":\"" + uid + "\",\"inquiryId\":" + inquiryId + "}";
    }

    private PortoneV2PaymentResponse upstream(String status, int amount, String receipt) throws Exception {
        return new ObjectMapper().readValue("{\"status\":\"" + status + "\",\"amount\":{\"total\":" + amount + "}," + receipt + "}",
                PortoneV2PaymentResponse.class);
    }
}
