package kr.it.reserve.feed;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 실제 HTTP 관문·서비스·JPA를 함께 확인하며 운영/개발 계정과 DB를 사용하지 않는다. */
@SpringBootTest(properties = {"FEED_ENABLED=true", "FEED_INTERACTIONS_ENABLED=true", "STORE_NEWS_ENABLED=true",
        "spring.datasource.url=jdbc:h2:mem:feed_api_lifecycle;MODE=MySQL;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc @Transactional
class FeedApiLifecycleTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired MemberRepository members;
    @Autowired kr.it.reserve.store.repository.StoreRepository stores;
    @Autowired kr.it.reserve.feed.repository.FeedMediaRepository media;

    @Test void aDraftSurvivesRepeatedReadsAndEditingAndStaysPrivate() throws Exception {
        Member owner = actor(Role.USER), other = actor(Role.USER);
        var created = success(owner, post("/api/feed/posts"), postBody("첫 초안", true, 0));
        long id = created.path("id").asLong();
        for (int i = 0; i < 2; i++) {
            mvc.perform(as(owner, get("/api/feed/posts/" + id))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.state").value("DRAFT")).andExpect(jsonPath("$.data.content").value("첫 초안"));
            mvc.perform(as(owner, get("/api/feed/me/posts?drafts=true"))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.content[0].id").value(id));
        }
        mvc.perform(get("/api/feed/posts/" + id)).andExpect(status().isNotFound());
        mvc.perform(as(other, get("/api/feed/posts/" + id))).andExpect(status().isNotFound());
        success(owner, put("/api/feed/posts/" + id), postBody("수정한 초안", true, 0));
        mvc.perform(as(owner, get("/api/feed/posts/" + id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("수정한 초안")).andExpect(jsonPath("$.data.revision").value(1));
        mvc.perform(as(owner, put("/api/feed/posts/" + id)).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(postBody("오래된 초안", true, 0)))).andExpect(status().isConflict());
    }

    @Test void commentsSupportOwnEditDeleteAndOneReplyLevelWithoutAllowingOtherUsersEdits() throws Exception {
        Member owner = actor(Role.USER), other = actor(Role.USER);
        long postId = success(owner, post("/api/feed/posts"), postBody("공개 글", false, 0)).path("id").asLong();
        long root = success(owner, post("/api/feed/posts/" + postId + "/comments"), comment("첫 댓글", null, 0)).path("id").asLong();
        long reply = success(other, post("/api/feed/posts/" + postId + "/comments"), comment("답글", root, 0)).path("id").asLong();
        mvc.perform(as(other, put("/api/feed/comments/" + root)).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(comment("다른 회원 수정", null, 0)))).andExpect(status().isNotFound());
        mvc.perform(as(other, delete("/api/feed/comments/" + root))).andExpect(status().isNotFound());
        mvc.perform(get("/api/feed/posts/" + postId + "/comments")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].content").value("첫 댓글"));
        mvc.perform(as(other, post("/api/feed/posts/" + postId + "/comments")).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(comment("2단계 답글", reply, 0)))).andExpect(status().isBadRequest());
        success(owner, put("/api/feed/comments/" + root), comment("수정한 댓글", null, 0));
        mvc.perform(as(owner, delete("/api/feed/comments/" + root))).andExpect(status().isOk());
        mvc.perform(get("/api/feed/comments/" + root + "/replies")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].content").value("답글"));
        mvc.perform(get("/api/feed/posts/" + postId + "/comments")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].content").value(""))
                .andExpect(jsonPath("$.data.content[0].author").doesNotExist());
    }

    @Test void reportApiRequiresAReasonAndCannotUndoANewerAdministratorsHold() throws Exception {
        Member author = actor(Role.USER), reporter = actor(Role.USER), admin = actor(Role.ADMIN);
        long postId = success(author, post("/api/feed/posts"), postBody("신고 대상 글", false, 0)).path("id").asLong();
        success(reporter, post("/api/feed/posts/" + postId + "/reports"), Map.of("reason", "SPAM", "detail", "점검 신고"));
        var list = success(admin, get("/api/admin/feed/reports"), null);
        long reportId = list.path("content").get(0).path("id").asLong();
        mvc.perform(as(admin, patch("/api/admin/feed/reports/" + reportId)).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(Map.of("status", "RESOLVED", "hold", true, "note", " ", "revision", 0))))
                .andExpect(status().isBadRequest());
        success(admin, patch("/api/admin/feed/reports/" + reportId), Map.of("status", "RESOLVED", "hold", true, "note", "분쟁 보류", "revision", 0));
        mvc.perform(as(admin, patch("/api/admin/feed/reports/" + reportId)).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(Map.of("status", "OPEN", "hold", false, "note", "이전 창", "revision", 0))))
                .andExpect(status().isConflict());
        mvc.perform(as(admin, get("/api/admin/feed/reports/" + reportId))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hold").value(true)).andExpect(jsonPath("$.data.note").value("분쟁 보류"))
                .andExpect(jsonPath("$.data.revision").value(1));
    }

    @Test void aBenefitStaysOutOfTheFeedAndEditingAnApprovedBenefitRequiresReviewAgain() throws Exception {
        Member owner = actor(Role.BUSINESS), admin = actor(Role.ADMIN);
        var store = stores.saveAndFlush(kr.it.reserve.store.entity.Store.builder().owner(owner).name("점검 가게")
                .status(kr.it.reserve.store.entity.StoreStatus.ACTIVE).build());
        var photo = media.saveAndFlush(kr.it.reserve.feed.entity.FeedMedia.create(owner,
                kr.it.reserve.file.util.FileStoragePaths.feedImage(owner.getId()) + "fixture.bin", "image/jpeg", 1200, 800, 100,
                java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)));
        var request = new java.util.HashMap<String, Object>();
        request.put("storeId", store.getId()); request.put("title", "첫 혜택"); request.put("content", "혜택 내용");
        request.put("newsType", "BENEFIT"); request.put("startsAt", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(1));
        request.put("endsAt", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).plusDays(1));
        request.put("mediaIds", List.of(photo.getId())); request.put("draft", false); request.put("benefitRequested", true);
        request.put("clientRequestId", UUID.randomUUID().toString());
        var submitted = success(owner, post("/api/store-news"), request);
        long id = submitted.path("id").asLong();
        org.assertj.core.api.Assertions.assertThat(submitted.path("benefitState").asText()).isEqualTo("PENDING");
        mvc.perform(get("/api/promotions/public/" + id)).andExpect(status().isNotFound());
        var approved = success(admin, patch("/api/admin/promotions/applications/" + id),
                Map.of("revision", submitted.path("revision").asLong(), "approved", true, "note", "사진과 조건 확인"));
        mvc.perform(get("/api/promotions/public/" + id)).andExpect(status().isOk());
        mvc.perform(get("/api/feed/posts")).andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isEmpty());
        request.put("title", "수정한 혜택"); request.put("revision", approved.path("revision").asLong());
        var edited = success(owner, put("/api/store-news/" + id), request);
        org.assertj.core.api.Assertions.assertThat(edited.path("benefitState").asText()).isEqualTo("PENDING");
        mvc.perform(get("/api/promotions/public/" + id)).andExpect(status().isNotFound());
        mvc.perform(as(admin, patch("/api/admin/promotions/applications/" + id)).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(Map.of("revision", approved.path("revision").asLong(), "approved", true, "note", "옛 심사"))))
                .andExpect(status().isConflict());
    }

    private Member actor(Role role) throws Exception {
        String key = UUID.randomUUID().toString().substring(0, 8);
        Member member = members.saveAndFlush(Member.builder().name("테스트 계정").email(key + "@example.test")
                .role(role).termsAgreed(true).emailNotificationEnabled(false).build());
        success(member, put("/api/feed/me/profile"), Map.of("nickname", "점검_" + key, "bio", "", "useAccountAvatar", false));
        return member;
    }
    private MockHttpServletRequestBuilder as(Member member, MockHttpServletRequestBuilder request) {
        return request.with(authentication(new UsernamePasswordAuthenticationToken(member, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + member.getRole().name()))))).with(csrf());
    }
    private JsonNode success(Member member, MockHttpServletRequestBuilder request, Object body) throws Exception {
        as(member, request);
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body));
        return mapper.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
    }
    private Map<String, Object> postBody(String text, boolean draft, long revision) {
        return Map.of("content", text, "draft", draft, "revision", revision, "mediaIds", List.of(), "clientRequestId", UUID.randomUUID().toString());
    }
    private Map<String, Object> comment(String text, Long parent, long revision) {
        var body = new java.util.HashMap<String, Object>();
        body.put("content", text); body.put("parentId", parent); body.put("revision", revision); body.put("clientRequestId", UUID.randomUUID().toString()); return body;
    }
}
