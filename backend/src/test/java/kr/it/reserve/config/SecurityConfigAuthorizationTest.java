package kr.it.reserve.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SecurityConfig의 인가(authorization) 규칙이 실제 컨트롤러의 의도와 어긋나지 않는지 검증.
 *
 * 배경: GET /api/reservations/availability는 컨트롤러 주석에 "공개 API — 로그인 불필요"라고
 * 명시돼 있었는데도 SecurityConfig의 블랭킷 규칙("/api/reservations/**".authenticated())에
 * 걸려 실제로는 401을 반환하던 버그가 있었음(2026-07 hotfix로 수정).
 *
 * 이런 종류의 "컨트롤러 의도 vs SecurityConfig 규칙 불일치"는 코드 리뷰만으로는 놓치기 쉬워서,
 * 인증 없이 호출했을 때 기대 결과(공개 API는 401이 아니어야 함 / 보호된 API는 401이어야 함)를
 * 명시적으로 고정해두는 테스트. 새 엔드포인트를 추가할 때 이 클래스에 한 줄 추가하는 걸 습관화할 것.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigAuthorizationTest {

    @Autowired
    private MockMvc mockMvc;

    // ── 공개 API — 비로그인 상태에서도 401이 아니어야 함 (200/404 등은 데이터 유무에 따라 달라질 수 있어 허용) ──

    @Test
    void publicStoreListIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/stores"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void publicReservationAvailabilityIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/reservations/availability")
                        .param("storeId", "1")
                        .param("date", "2026-07-10"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void publicReviewListIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/reviews/store/1"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    @Test
    void inquiryCreateIsAccessibleWithoutAuth() throws Exception {
        mockMvc.perform(post("/api/inquiries")
                        .contentType("application/json")
                        .content("{\"category\":\"ETC\",\"title\":\"t\",\"content\":\"c\",\"guestName\":\"g\",\"guestEmail\":\"g@test.com\"}"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }

    // ── 보호된 API — 비로그인 상태에서는 반드시 401이어야 함 ──

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
    void memberMeRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/member/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminManageRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/admin/manage/members"))
                .andExpect(status().isUnauthorized());
    }
}
