package kr.it.reserve.store.search;

import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.dialect.MySQLDialect;
import org.hibernate.type.StandardBasicTypes;

/** Criteria의 컬럼 매핑과 공통 검색 정책을 유지하며 MySQL MATCH 구문을 렌더한다. */
public final class StoreFulltextFunctionContributor implements FunctionContributor {

    @Override
    public void contributeFunctions(FunctionContributions contributions) {
        if (!(contributions.getDialect() instanceof MySQLDialect)) return;
        contributions.getFunctionRegistry().registerPattern(
                "store_search_match",
                "match(?1, ?2, ?3, ?4, ?5) against (?6 in boolean mode)",
                contributions.getTypeConfiguration().getBasicTypeRegistry().resolve(StandardBasicTypes.DOUBLE));
    }

    @Override
    public int ordinal() {
        return 1_000;
    }
}
