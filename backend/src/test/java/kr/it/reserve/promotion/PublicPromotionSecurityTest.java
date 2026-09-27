package kr.it.reserve.promotion;

import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.service.PromotionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:public-promotion-security;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PublicPromotionSecurityTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean PromotionService service;

    @Test
    void onlyThePublicListAndDetailAreAccessibleWithoutAuthentication() throws Exception {
        when(service.getPublicPromotions(0, 12)).thenReturn(Page.empty(PageRequest.of(0, 12)));
        when(service.getPublicPromotion(7L)).thenReturn(PromotionDto.PublicPromotionDetailResponse.builder()
                .id(7L).storeId(3L).title("가게 안내").content("plain text").build());

        mockMvc.perform(get("/api/promotions/public"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isEmpty());
        mockMvc.perform(get("/api/promotions/public/7"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(7))
                .andExpect(jsonPath("$.data.content").value("plain text"))
                .andExpect(jsonPath("$.data.memberId").doesNotExist());
        for (String protectedRoute : List.of("/api/promotions", "/api/promotions/7", "/api/promotions/my",
                "/api/promotions/my-stores", "/api/promotions/public/7/extra", "/api/community/posts")) {
            mockMvc.perform(get(protectedRoute)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void publicLookingPathsDoNotMakeWritesAnonymous() throws Exception {
        mockMvc.perform(post("/api/promotions").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/promotions/7").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/promotions/7")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/promotions/public").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
