package kr.it.reserve.seo;

import kr.it.reserve.seo.service.SitemapService;
import kr.it.reserve.store.dto.StoreSitemapEntry;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SitemapServiceTest {

    @Mock
    private StoreRepository storeRepository;

    @Test
    void includesPublicPagesAndStoreDetailsButNotAuthenticationPages() {
        when(storeRepository.findPublicSitemapEntries(org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(List.of(
                        new StoreSitemapEntry(7L, LocalDateTime.of(2026, 9, 2, 10, 0), null),
                        new StoreSitemapEntry(9L, null, LocalDateTime.of(2026, 8, 31, 12, 0))
                ));

        String xml = new SitemapService(storeRepository).build();

        assertThat(xml)
                .contains("<loc>https://reserve.it.kr/</loc>")
                .contains("<loc>https://reserve.it.kr/stores</loc>")
                .contains("<loc>https://reserve.it.kr/terms</loc>")
                .contains("<loc>https://reserve.it.kr/privacy</loc>")
                .contains("<loc>https://reserve.it.kr/store/7</loc>")
                .contains("<lastmod>2026-09-02</lastmod>")
                .doesNotContain("/login")
                .doesNotContain("/signup");

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(storeRepository).findPublicSitemapEntries(pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(49_996);
    }
}
