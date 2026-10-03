package kr.it.reserve.store;

import kr.it.reserve.store.search.StoreFulltextFunctionContributor;
import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.dialect.MySQLDialect;
import org.hibernate.query.ReturnableType;
import org.hibernate.query.sqm.function.FunctionRenderer;
import org.hibernate.query.sqm.function.SqmFunctionRegistry;
import org.hibernate.sql.ast.SqlAstNodeRenderingMode;
import org.hibernate.sql.ast.SqlAstTranslator;
import org.hibernate.sql.ast.spi.StringBuilderSqlAppender;
import org.hibernate.sql.ast.tree.SqlAstNode;
import org.hibernate.type.spi.TypeConfiguration;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.ServiceLoader;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class StoreFulltextFunctionTest {
    @Test void serviceLoaderRegistersMatchAgainstWithMappedColumnsAndQueryParameter() {
        FunctionContributor contributor = ServiceLoader.load(FunctionContributor.class).stream()
                .map(ServiceLoader.Provider::get)
                .filter(StoreFulltextFunctionContributor.class::isInstance)
                .findFirst().orElseThrow();
        FunctionContributions contributions = mock(FunctionContributions.class);
        SqmFunctionRegistry registry = new SqmFunctionRegistry();
        when(contributions.getDialect()).thenReturn(new MySQLDialect());
        when(contributions.getFunctionRegistry()).thenReturn(registry);
        when(contributions.getTypeConfiguration()).thenReturn(new TypeConfiguration());
        contributor.contributeFunctions(contributions);

        StringBuilderSqlAppender sql = new StringBuilderSqlAppender();
        List<SqlAstNode> arguments = List.of(mock(SqlAstNode.class), mock(SqlAstNode.class),
                mock(SqlAstNode.class), mock(SqlAstNode.class), mock(SqlAstNode.class), mock(SqlAstNode.class));
        List<String> mappedColumns = List.of("s.store_name", "s.description", "s.address", "s.category", "s.keywords", "?");
        SqlAstTranslator<?> translator = mock(SqlAstTranslator.class);
        doAnswer(invocation -> {
            sql.appendSql(mappedColumns.get(arguments.indexOf(invocation.getArgument(0))));
            return null;
        }).when(translator).render(any(SqlAstNode.class), any(SqlAstNodeRenderingMode.class));

        ((FunctionRenderer) registry.findFunctionDescriptor("store_search_match"))
                .render(sql, arguments, (ReturnableType<?>) null, translator);

        assertThat(sql.getStringBuilder().toString()).isEqualTo(
                "match(s.store_name, s.description, s.address, s.category, s.keywords) against (? in boolean mode)");
    }
}
