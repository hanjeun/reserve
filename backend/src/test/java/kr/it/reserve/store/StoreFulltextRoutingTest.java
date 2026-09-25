package kr.it.reserve.store;

import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** H2에는 MATCH가 없다. 여기서는 운영 쿼리 선택·입력·정렬 전달 계약만 검사한다. */
@ExtendWith(MockitoExtension.class)
class StoreFulltextRoutingTest {
    @Mock StoreRepository repository;
    @InjectMocks StoreService service;

    @Test void passesWholeResultSortAndSanitizesBooleanOperators() {
        ReflectionTestUtils.setField(service, "fulltextEnabled", true);
        when(repository.searchStoresFulltextPaged(eq("+강남 +카페"), eq("reviews"), any(Pageable.class))).thenReturn(Page.empty());
        service.searchStoresPaged("강남 -카페", "reviews", 1, 15, null, null);
        verify(repository).searchStoresFulltextPaged(eq("+강남 +카페"), eq("reviews"),
                argThat(page -> page.getPageNumber() == 1 && page.getSort().isUnsorted()));
    }

    @Test void operatorOnlyAndUnindexedShortTokenUseLiteralLike() {
        ReflectionTestUtils.setField(service, "fulltextEnabled", true);
        when(repository.searchStoresPaged(anyString(), any(Pageable.class))).thenReturn(Page.empty());
        service.searchStoresPaged("@@()", "recent", 0, 15, null, null);
        service.searchStoresPaged("강남 김", "reviews", 0, 15, null, null);
        verify(repository, never()).searchStoresFulltextPaged(anyString(), anyString(), any());
        verify(repository).searchStoresPaged(eq("@@()"), argThat(page -> page.getSort().getOrderFor("createdAt") != null));
        verify(repository).searchStoresPaged(eq("강남 김"), argThat(page -> page.getSort().getOrderFor("id") != null));
    }
}
