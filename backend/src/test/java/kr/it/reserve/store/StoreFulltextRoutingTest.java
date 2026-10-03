package kr.it.reserve.store;

import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.search.StoreFulltextSearch;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 서비스의 원문 전달·페이지 유지·실패 후 LIKE 폴백 계약. */
@ExtendWith(MockitoExtension.class)
class StoreFulltextRoutingTest {
    @Mock StoreRepository repository;
    @Mock StoreFulltextSearch fulltext;
    @InjectMocks StoreService service;

    @BeforeEach void enableFulltext() {
        ReflectionTestUtils.setField(service, "fulltextEnabled", true);
    }

    @Test void literalOperatorsAndWholeResultPagingReachTheSharedSearchGate() {
        when(fulltext.candidateQuery("강남 -카페")).thenReturn("+\"강남\"");
        when(fulltext.search(any(Specification.class), eq("+\"강남\""), any(Pageable.class)))
                .thenReturn(Page.empty());
        service.searchStoresPaged("강남 -카페", "reviewCount", 1, 15, null, null);
        verify(fulltext).candidateQuery("강남 -카페");
        verify(fulltext).search(any(Specification.class), eq("+\"강남\""), eq(PageRequest.of(1, 15)));
        verifyNoInteractions(repository);
    }

    @Test void unavailableIndexAndShortInputUseTheLiteralSpecification() {
        when(fulltext.candidateQuery(anyString())).thenReturn("");
        when(repository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());
        service.searchStoresPaged("@@()", "recent", 0, 15, null, null);
        service.searchStoresPaged("김", "reviews", 1, 15, null, null);
        verify(fulltext, never()).search(any(), anyString(), any());
        verify(repository, times(2)).findAll(any(Specification.class), any(Pageable.class));
        verify(repository).findAll(any(Specification.class),
                eq((Pageable) PageRequest.of(1, 15)));
    }

    @Test void domainRegionAndRecommendedSearchCanUseTheSameFulltextGate() {
        when(fulltext.candidateQuery("강남 카페")).thenReturn("+\"강남\"");
        when(fulltext.search(any(Specification.class), anyString(), any(Pageable.class))).thenReturn(Page.empty());

        service.searchStoresPaged(
                new StoreService.SearchScope("FOOD", "서울 강남구"),
                "강남 카페", "recommended", 0, 20, null, null);

        verify(fulltext).search(any(Specification.class), eq("+\"강남\""), eq(PageRequest.of(0, 20)));
        verifyNoInteractions(repository);
    }

    @Test void failedMatchDisablesFulltextAndReturnsTheOriginalLikePage() {
        when(fulltext.candidateQuery("사진")).thenReturn("+\"사진\"", "");
        when(fulltext.search(any(Specification.class), anyString(), any(Pageable.class)))
                .thenThrow(new InvalidDataAccessResourceUsageException("missing index"));
        when(repository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());
        service.searchStoresPaged("사진", "rating", 0, 15, null, null);
        service.searchStoresPaged("사진", "rating", 0, 15, null, null);
        verify(fulltext).disable();
        verify(fulltext, times(1)).search(any(), anyString(), any());
        verify(repository, times(2)).findAll(any(Specification.class), eq(PageRequest.of(0, 15)));
    }

    @Test void explicitOptOutDoesNotProbeTheDatabase() {
        ReflectionTestUtils.setField(service, "fulltextEnabled", false);
        when(repository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());
        service.searchStoresPaged("사진", "recent", 0, 15, null, null);
        verifyNoInteractions(fulltext);
        verify(repository).findAll(any(Specification.class), eq(PageRequest.of(0, 15)));
    }
}
