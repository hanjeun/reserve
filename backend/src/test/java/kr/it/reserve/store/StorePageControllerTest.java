package kr.it.reserve.store;

import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.controller.StorePageController;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.service.StorePageService;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class StorePageControllerTest {
    private static final UUID PUBLIC_ID = UUID.fromString("6ab45364-aec9-4bc7-9ed9-376854433f19");

    @Test
    void anExistingStoreWithoutAShellReturnsAnUncacheableServiceUnavailable() throws Exception {
        assertUnavailable(page(false, true));
    }

    @Test
    void aMissingStoreWithoutAShellPreservesServiceUnavailableFromTheNotFoundPage() throws Exception {
        assertUnavailable(page(false, false));
    }

    @Test
    void aMissingStoreWithAShellRemainsNotFound() throws Exception {
        var mvc = page(true, false);
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.HEAD)) {
            mvc.perform(request(method, "/api/public/store-pages/" + PUBLIC_ID).accept(MediaType.TEXT_HTML))
                    .andExpect(handler().methodName("storePageByPublicId"))
                    .andExpect(status().isNotFound())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"));
        }
    }

    private void assertUnavailable(MockMvc mvc) throws Exception {
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.HEAD)) {
            var result = mvc.perform(request(method, "/api/public/store-pages/" + PUBLIC_ID).accept(MediaType.TEXT_HTML))
                    .andExpect(handler().methodName("storePageByPublicId"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
            if (method == HttpMethod.GET) {
                result.andExpect(content().string("공유 페이지를 준비하고 있어요. 잠시 후 다시 시도해주세요."));
            }
        }
    }

    private MockMvc page(boolean shellAvailable, boolean storeAvailable) throws Exception {
        var stores = mock(StoreService.class);
        if (storeAvailable) {
            var store = mock(StoreResponse.class);
            when(store.getName()).thenReturn("합성 가게");
            when(store.getPublicId()).thenReturn(PUBLIC_ID.toString());
            when(stores.getStoreByPublicId(PUBLIC_ID)).thenReturn(store);
        } else {
            when(stores.getStoreByPublicId(PUBLIC_ID)).thenThrow(StoreException.notFound());
        }
        var resource = new ByteArrayResource("<html><head><title>RESERVE</title></head></html>".getBytes(StandardCharsets.UTF_8)) {
            @Override
            public boolean exists() { return shellAvailable; }
        };
        var pages = new StorePageService(stores, resource);
        return MockMvcBuilders.standaloneSetup(new StorePageController(pages))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }
}
