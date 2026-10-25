package kr.it.reserve.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 공개 경로와 보호 경로의 무인증 응답을 실제 SecurityConfig에 고정한다. */
@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigAuthorizationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void authenticatedCookieWithoutBrowserOriginProofIsForbidden() throws Exception {
        mockMvc.perform(post("/api/chat/support/open")
                        .cookie(new jakarta.servlet.http.Cookie("access_token", "invalid-test-token")))
                .andExpect(status().isForbidden());
    }

    @Test
    void foreignRefererCannotUseAuthenticationCookie() throws Exception {
        mockMvc.perform(post("/api/chat/support/open")
                        .header("Referer", "https://reserve.it.kr.attacker.test/")
                        .cookie(new jakarta.servlet.http.Cookie("access_token", "invalid-test-token")))
                .andExpect(status().isForbidden());
    }

    @Test
    void trustedRefererReachesAuthenticationWithoutCsrfToken() throws Exception {
        mockMvc.perform(post("/api/chat/support/open")
                        .header("Referer", "https://reserve.it.kr/stores")
                        .cookie(new jakarta.servlet.http.Cookie("access_token", "invalid-test-token")))
                .andExpect(status().isUnauthorized());
    }

    // 공개 API — 비로그인 상태에서도 401이 아니어야 함 (200/404 등은 데이터 유무에 따라 달라질 수 있어 허용) ──

    @Test
    void feedInteractionReadsStayPublicButPersonalWritesAndModerationStayAuthenticated() throws Exception {
        for (String prefix : new String[]{"/api", "/api/v1"}) {
            for (String path : new String[]{"/feed/interactions/config", "/feed/likes/POST/1", "/feed/likes/NEWS/1", "/feed/likes/COMMENT/1", "/feed/posts/1/comments", "/feed/comments/1", "/feed/comments/1/replies"}) {
                mockMvc.perform(get(prefix + path)).andExpect(result -> {
                    assertNotEquals(401, result.getResponse().getStatus());
                    assertNotEquals(403, result.getResponse().getStatus());
                });
            }
            for (String path : new String[]{"/feed/me/likes", "/feed/notifications", "/feed/notifications/count", "/admin/feed/comment-reports", "/admin/feed/comments/1",
                    "/admin/feed/comment-reports/1/images/1", "/admin/feed/comments/1/images/1"}) {
                mockMvc.perform(get(prefix + path)).andExpect(status().isUnauthorized());
            }
            mockMvc.perform(put(prefix + "/feed/likes/POST/1").contentType("application/json").content("{\"liked\":true}")).andExpect(status().isUnauthorized());
            mockMvc.perform(put(prefix + "/feed/likes/COMMENT/1").contentType("application/json").content("{\"liked\":true}")).andExpect(status().isUnauthorized());
            mockMvc.perform(put(prefix + "/feed/notifications/1/read")).andExpect(status().isUnauthorized());
            mockMvc.perform(put(prefix + "/feed/notifications/read-all")).andExpect(status().isUnauthorized());
            mockMvc.perform(post(prefix + "/feed/posts/1/comments").contentType("application/json").content("{\"content\":\"hello\"}")).andExpect(status().isUnauthorized());
            mockMvc.perform(delete(prefix + "/feed/comments/1")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void publicStoreListIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/stores"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void feedRegionReadIsPublicAndCannotOpenAnonymousWrites() throws Exception {
        for (String prefix : new String[]{"/api", "/api/v1"}) {
            mockMvc.perform(get(prefix + "/feed/regions")).andExpect(result -> {
                assertNotEquals(401, result.getResponse().getStatus());
                assertNotEquals(403, result.getResponse().getStatus());
            });
            mockMvc.perform(post(prefix + "/feed/regions")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void benefitMediaHasPublicReadsAndAuthenticatedWritesWithoutOpeningOwnerDetails() throws Exception {
        for (String prefix : new String[]{"/api", "/api/v1"}) {
            for (String path : new String[]{"/store-news/config", "/store-news/media/1"}) {
                mockMvc.perform(get(prefix + path)).andExpect(result -> {
                    assertNotEquals(401, result.getResponse().getStatus());
                    assertNotEquals(403, result.getResponse().getStatus());
                });
            }
            mockMvc.perform(post(prefix + "/store-news/media")).andExpect(status().isUnauthorized());
            mockMvc.perform(get(prefix + "/store-news/1")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void onlyTheWaitingDirectoryAndPrivacyPolicyArePublicIncludingVersionedAliases() throws Exception {
        for (String prefix : new String[]{"/api", "/api/v1"}) {
            mockMvc.perform(get(prefix + "/waiting/stores")).andExpect(status().isOk());
            mockMvc.perform(get(prefix + "/waiting/retention-policy")).andExpect(status().isOk());
            for (String path : new String[]{"/waiting/my", "/waiting/events", "/waiting/entries/1/qr", "/waiting/stores/1/onsite-qr"}) {
                mockMvc.perform(get(prefix + path)).andExpect(status().isUnauthorized());
            }
            mockMvc.perform(post(prefix + "/waiting/stores/1/entries")).andExpect(status().isUnauthorized());
            mockMvc.perform(post(prefix + "/waiting/entries/1/cancel")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void invalidPublicAdvertisementTypeIsBadRequestRatherThanServerError() throws Exception {
        mockMvc.perform(get("/api/advertisements/active").param("type", "invalid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void advertisementImpressionAndClickRemainPublicSuccessfulNoOpsForUnknownIds() throws Exception {
        mockMvc.perform(patch("/api/advertisements/999999/impression"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/api/advertisements/999999/click"))
                .andExpect(status().isOk());
    }

    @Test
    void publicReservationAvailabilityIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/reservations/availability")
                        .param("storeId", "1")
                        .param("date", "2026-07-10"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    // 필요한 공개 GET만 허용하고 나머지 개인 경로는 보호한다.

    @Test
    void narrowedPublicGetEndpointsStayOpen() throws Exception {
        for (String url : new String[] {
                "/api/stores/regions", "/api/stores/1",
                "/api/reviews/store/1/stats", "/api/reviews/1",
                "/api/notices", "/api/notices/highlights", "/api/notices/1" }) {
            mockMvc.perform(get(url))
                    .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus(), url + " 는 공개여야 한다"));
        }
    }

    @Test
    void personalGetEndpointsUnderFormerlyOpenPrefixesRequireLogin() throws Exception {
        for (String url : new String[] {
                "/api/stores/my", "/api/stores/1/edit", "/api/stores/1/statistics",
                "/api/reviews/my", "/api/reviews/reservation/1", "/api/reviews/can-write/1" }) {
            mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void chatPhotosAndOpenWritesRequireLoginWhileNoticeViewIsPublic() throws Exception {
        mockMvc.perform(get("/api/chat/retention-policy")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/chat/retention-policy")).andExpect(status().isOk());
        mockMvc.perform(get("/api/stores/1/waiting")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/stores/1/waiting")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/chat/images/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/chat/reports/1/images/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/chat/support/open")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/notices/999999/view")).andExpect(status().isOk());
    }

    @Test
    void publicReviewListIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/reviews/store/1"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void publicTourismRegionPhotosAreAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/tourism/region-photos").param("regions", "서울"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void inquiryCreateIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(post("/api/inquiries")
                        .contentType("application/json")
                        .content("{\"category\":\"ETC\",\"title\":\"t\",\"content\":\"c\",\"guestName\":\"g\",\"guestEmail\":\"g@test.com\"}"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void inquiryCreateRejectsInvalidGuestEmailBeforePersistingOrSendingEmail() throws Exception {
        mockMvc.perform(post("/api/inquiries")
                        .contentType("application/json")
                        .content("{\"category\":\"ETC\",\"title\":\"t\",\"content\":\"c\",\"guestName\":\"g\",\"guestEmail\":\"not-an-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.success").value(false));
    }

    @Test
    void legacyHealthCheckDoesNotExposeHostOrEnvironmentDetails() throws Exception {
        mockMvc.perform(get("/hc"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.status").value("UP"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.serverName").doesNotExist())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.env").doesNotExist());
        mockMvc.perform(get("/env")).andExpect(status().isUnauthorized());
    }

    @Test
    void emailVerificationOnlyExposesTheExplicitSignupActions() throws Exception {
        mockMvc.perform(post("/api/email/send-code")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/email/verify-code")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/email/check-verified").param("email", "person@example.test"))
                .andExpect(status().isUnauthorized());
    }

    // 보호된 API — 비로그인 상태에서는 반드시 401이어야 함 ──

    @Test
    void myReservationsRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/reservations/my"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reservationCreateRequiresAuth() throws Exception {
        mockMvc.perform(post("/api/reservations")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void qrTokenAndAdvertisementConversionRequireAuth() throws Exception {
        mockMvc.perform(get("/api/reservations/1/qr-token"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/advertisements/1/conversion")
                        .contentType("application/json")
                        .content("{\"reservationId\":1}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void memberMeRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/member/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void passwordChangeRequiresAuth() throws Exception {
        mockMvc.perform(put("/api/member/password")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void socialTermsAgreementRequiresAuth() throws Exception {
        mockMvc.perform(post("/api/auth/agree-terms")
                        .contentType("application/json")
                        .content("{\"marketingAgreed\":false}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownLoginUsesAValidDummyHashAndReturnsUnauthorizedInsteadOfServerError() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"missing-account@example.com\",\"password\":\"Unknown123!\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void signupRejectsAnInvalidPasswordBeforeEnteringTheService() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType("application/json")
                        .content("""
                                {"name":"가입자","email":"new@example.com","password":"letters-only",
                                 "passwordConfirm":"letters-only","termsAgreed":true}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void paymentStatusRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/payment/status").param("type", "ad").param("merchantUid", "AD-TEST"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminManageRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/admin/manage/members"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void depositDiagnosticRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/admin/payment-operations/deposit-invariants"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(roles = "USER")
    void customerCannotReadDepositDiagnostic() throws Exception {
        mockMvc.perform(get("/api/admin/payment-operations/deposit-invariants"))
                .andExpect(status().isForbidden());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(roles = "BUSINESS")
    void businessCannotReadDepositDiagnostic() throws Exception {
        mockMvc.perform(get("/api/admin/payment-operations/deposit-invariants"))
                .andExpect(status().isForbidden());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(roles = "ADMIN")
    void adminCanReadDepositDiagnosticWithoutHttpCaching() throws Exception {
        mockMvc.perform(get("/api/admin/payment-operations/deposit-invariants").param("size", "1000"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.content").isArray())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                        "Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
        mockMvc.perform(get("/api/admin/payment-operations/deposit-invariants")
                        .param("page", "2147483647").param("size", "100"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adPaymentOperationsRequireAuthForReadsAndWrites() throws Exception {
        mockMvc.perform(get("/api/admin/ad-payments")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/admin/ad-payments/1/refund")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/admin/ad-payments/1/reconcile")).andExpect(status().isUnauthorized());
    }

    @Test
    void chatReportsRequireAuthenticationForBothSubmissionAndAdministration() throws Exception {
        mockMvc.perform(post("/api/chat/rooms/1/reports")
                        .param("viewerRole", "MEMBER")
                        .contentType("application/json")
                        .content("{\"reason\":\"SPAM\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/chat/reports"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(roles = "BUSINESS")
    void businessRoleCannotReadTheAdminChatReportQueue() throws Exception {
        mockMvc.perform(get("/api/admin/chat/reports"))
                .andExpect(status().isForbidden());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(roles = "BUSINESS")
    void businessRoleCannotReadOrProcessTheAdminAdPaymentQueue() throws Exception {
        mockMvc.perform(get("/api/admin/ad-payments")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/ad-payments/1/refund")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/ad-payments/1/reconcile")).andExpect(status().isForbidden());
    }
}
