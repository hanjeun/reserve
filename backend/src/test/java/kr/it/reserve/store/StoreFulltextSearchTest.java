package kr.it.reserve.store;

import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.search.StoreFulltextSearch;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.ArgumentMatchers;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StoreFulltextSearchTest {
    @Mock DataSource dataSource;
    @Mock StoreRepository repository;
    private StoreFulltextSearch search;

    @BeforeEach void setUp() {
        search = new StoreFulltextSearch(dataSource, repository);
    }

    @ParameterizedTest
    @CsvSource(value = {"사진|사진", "강남 사진|강남", "강남 -카페|강남", "강남 김|강남",
            "100%_|10", "김|", "@@()|", "가 나|"}, delimiter = '|')
    void candidateKeepsTwoCharacterAnchorsWithoutTreatingSymbolsAsOperators(String keyword, String pair) {
        ReflectionTestUtils.setField(search, "available", true);
        assertThat(search.candidateQuery(keyword)).isEqualTo(pair == null ? "" : "+\"" + pair + "\"");
        verifyNoInteractions(dataSource, repository);
    }

    @Test void missingIndexIsDetectedOnceAndNeverAttemptsMatch() throws Exception {
        prepareMysql("CREATE TABLE store (store_id bigint, PRIMARY KEY (store_id))");
        assertThat(search.candidateQuery("사진")).isEmpty();
        assertThat(search.candidateQuery("공방")).isEmpty();
        verify(dataSource, times(1)).getConnection();
        verifyNoInteractions(repository);
    }

    @Test void matchingNgramIndexIsCachedAndRuntimeDisableStopsFutureAttempts() throws Exception {
        prepareMysql("CREATE TABLE store (FULLTEXT KEY `ft_store_search` "
                + "(`store_name`,`description`,`address`,`category`,`keywords`) "
                + "/*!50100 WITH PARSER `ngram` */)");
        assertThat(search.candidateQuery("사진")).isEqualTo("+\"사진\"");
        assertThat(search.candidateQuery("공방")).isEqualTo("+\"공방\"");
        search.disable();
        assertThat(search.candidateQuery("사진")).isEmpty();
        verify(dataSource, times(1)).getConnection();
    }

    @Test void equivalentCandidatePagePreservesOrderingTotalAndPageMetadata() {
        Specification<Store> literal = (root, query, builder) -> builder.conjunction();
        PageRequest page = PageRequest.of(1, 2);
        Store first = Store.builder().id(9L).name("사진 상위").build();
        Store second = Store.builder().id(3L).name("사진 다음").build();
        when(repository.count(literal)).thenReturn(5L);
        when(repository.findAll(any(Specification.class), eq(page)))
                .thenReturn(new PageImpl<>(List.of(first, second), page, 5));

        Page<StoreResponse> result = search.search(literal, "+\"사진\"", page);

        assertThat(result.getContent()).extracting(StoreResponse::getId).containsExactly(9L, 3L);
        assertThat(result.getTotalElements()).isEqualTo(5);
        assertThat(result.getNumber()).isEqualTo(1);
        assertThat(result.getSize()).isEqualTo(2);
        assertThat(result.getTotalPages()).isEqualTo(3);
        verify(repository, never()).findAll(eq(literal), any(PageRequest.class));
    }

    @Test void missingFulltextCandidatesReturnTheCompleteLiteralPage() {
        Specification<Store> literal = (root, query, builder) -> builder.conjunction();
        PageRequest page = PageRequest.of(0, 2);
        Store expected = Store.builder().id(7L).name("100% 사진").build();
        when(repository.count(literal)).thenReturn(1L);
        when(repository.findAll(ArgumentMatchers.<Specification<Store>>argThat(spec -> spec != literal), eq(page)))
                .thenReturn(Page.empty(page));
        when(repository.findAll(literal, page)).thenReturn(new PageImpl<>(List.of(expected), page, 1));

        Page<StoreResponse> result = search.search(literal, "+\"10\"", page);

        assertThat(result.getContent()).extracting(StoreResponse::getId).containsExactly(7L);
        assertThat(result.getTotalElements()).isEqualTo(1);
        verify(repository).findAll(literal, page);
    }

    private void prepareMysql(String definition) throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        Statement statement = mock(Statement.class);
        ResultSet tokens = mock(ResultSet.class);
        ResultSet table = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("MySQL");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery("SELECT @@ngram_token_size")).thenReturn(tokens);
        when(tokens.next()).thenReturn(true);
        when(tokens.getInt(1)).thenReturn(2);
        when(statement.executeQuery("SHOW CREATE TABLE store")).thenReturn(table);
        when(table.next()).thenReturn(true);
        when(table.getString(2)).thenReturn(definition);
    }
}
