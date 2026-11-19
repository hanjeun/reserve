package kr.it.reserve.store;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:store_public_address")
@AutoConfigureMockMvc
@Transactional
class StorePublicAddressIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired StoreRepository stores;
    @Autowired MemberRepository members;
    @MockitoBean EmailService email;

    @Test
    void publicReadsResolveBothAddressesAndForeignBusinessCannotEdit() throws Exception {
        Member owner = member("owner");
        Member visitor = member("visitor");
        Store store = stores.saveAndFlush(Store.builder().owner(owner).name("공개 가게").build());
        UUID publicId = UUID.fromString(store.getPublicId());
        assertThat(publicId.version()).isEqualTo(4);
        assertThat(publicId.variant()).isEqualTo(2);

        for (String prefix : List.of("/api", "/api/v1")) {
            String legacy = prefix + "/stores/" + store.getId();
            String shared = prefix + "/stores/" + store.getPublicId().toUpperCase(Locale.ROOT);
            for (String path : List.of(legacy, shared)) {
                mvc.perform(get(path)).andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.id").value(store.getId()))
                        .andExpect(jsonPath("$.data.publicId").value(store.getPublicId()));
                mvc.perform(get(path).with(asBusiness(visitor))).andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.id").value(store.getId()));
                mvc.perform(get(path + "/edit")).andExpect(status().isUnauthorized());
            }
            mvc.perform(get(legacy + "/edit").with(asBusiness(owner))).andExpect(status().isOk());
            mvc.perform(get(legacy + "/edit").with(asBusiness(visitor))).andExpect(status().isForbidden());
            mvc.perform(put(legacy).with(asBusiness(visitor)).with(csrf()).param("name", "변경 시도"))
                    .andExpect(status().isForbidden());
            mvc.perform(get(shared + "/edit").with(asBusiness(visitor))).andExpect(status().isBadRequest());
            mvc.perform(put(shared).with(asBusiness(visitor)).with(csrf()).param("name", "변경 시도"))
                    .andExpect(status().isBadRequest());
        }
        assertThat(stores.findByPublicId(store.getPublicId())).hasValueSatisfying(saved -> {
            assertThat(saved.getId()).isEqualTo(store.getId());
            assertThat(saved.getName()).isEqualTo("공개 가게");
        });
    }

    @Test
    void anotherAccountCannotReadBannedOrClosedStoresByEitherAddress() throws Exception {
        Member owner = member("owner");
        Member visitor = member("visitor");
        Store banned = Store.builder().owner(owner).name("제재 가게").status(StoreStatus.BANNED).build();
        Store closed = Store.builder().owner(owner).name("종료 가게").build();
        closed.softDelete();
        for (Store store : stores.saveAllAndFlush(List.of(banned, closed))) {
            for (String key : List.of(store.getId().toString(), store.getPublicId())) {
                mvc.perform(get("/api/stores/" + key).with(asBusiness(visitor)))
                        .andExpect(status().isNotFound()).andExpect(jsonPath("$.data").doesNotExist());
            }
        }
    }

    @Test
    void sharedPageLookupAndHeadArePublicOnBothApiAliases() throws Exception {
        String missingPublicId = UUID.randomUUID().toString();
        for (String prefix : List.of("/api", "/api/v1")) {
            String path = prefix + "/public/store-pages/" + missingPublicId;
            // 프론트 산출물 없이 실행한 테스트에서도 공개 경로의 실제 핸들러를 확인해요.
            mvc.perform(get(path)).andExpect(handler().methodName("storePageByPublicId"))
                    .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(404, 503));
            mvc.perform(head(path)).andExpect(handler().methodName("storePageByPublicId"))
                    .andExpect(result -> assertThat(result.getResponse().getStatus()).isIn(404, 503));
            mvc.perform(get(path + "/edit")).andExpect(status().isUnauthorized());
            mvc.perform(get(prefix + "/public/store-pages/42")).andExpect(status().isUnauthorized());
        }
    }

    private Member member(String name) {
        return members.save(Member.builder().email(name + "@uuid.test").name(name).role(Role.BUSINESS).build());
    }

    private RequestPostProcessor asBusiness(Member member) {
        return authentication(new UsernamePasswordAuthenticationToken(member, null,
                List.of(new SimpleGrantedAuthority("ROLE_BUSINESS"))));
    }
}
