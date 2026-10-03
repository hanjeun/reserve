package kr.it.reserve.store.search;

import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@RequiredArgsConstructor
@Service
public class StoreFulltextSearch {
    private static final Set<String> MATCH_COLUMNS = Set.of(
            "store_name", "description", "address", "category", "keywords");
    private static final Pattern NGRAM_INDEX = Pattern.compile(
            "FULLTEXT\\s+(?:KEY|INDEX)\\s+[^\\s(]+\\s*\\(([^)]*)\\)\\s*"
                    + "(?:/\\*!\\d+\\s*)?WITH\\s+PARSER\\s+`?ngram`?", Pattern.CASE_INSENSITIVE);

    private final DataSource dataSource;
    private final StoreRepository storeRepository;
    private volatile Boolean available;

    /** 짧은 문자·기호는 LIKE로, 색인 가능한 두 글자는 연산자 없는 후보로만 사용한다. */
    public String candidateQuery(String keyword) {
        String pair = indexedPair(keyword);
        return pair.isEmpty() || !isAvailable() ? "" : "+\"" + pair + "\"";
    }

    /**
     * 후보는 LIKE 결과의 부분집합이다. 동일 스냅샷의 count가 같을 때만 해당 페이지를 사용한다.
     * 불용어·콜레이션 등의 차이로 누락되면 같은 스냅샷에서 원문 LIKE 페이지를 반환한다.
     * 독립 트랜잭션은 MATCH 실패가 호출자의 LIKE 폴백을 rollback-only로 만들지 않게 한다.
     */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, isolation = Isolation.REPEATABLE_READ)
    public Page<StoreResponse> search(
            Specification<Store> literalSearch, String candidate, Pageable pageable) {
        long literalTotal = storeRepository.count(literalSearch);
        Page<Store> matched = storeRepository.findAll(
                StoreSearchSpecification.withFulltextCandidate(literalSearch, candidate), pageable);
        Page<Store> result = matched.getTotalElements() == literalTotal
                ? matched : storeRepository.findAll(literalSearch, pageable);
        // 소유자 등 lazy 필드도 독립 트랜잭션이 끝나기 전에 응답 DTO로 변환한다.
        return result.map(StoreResponse::fromEntity);
    }

    /** 인덱스 제거·조회 실패 후에는 재시작/설정 변경 전까지 MATCH 오류를 반복하지 않는다. */
    public synchronized void disable() {
        if (!Boolean.FALSE.equals(available)) {
            available = false;
            log.warn("Store FULLTEXT disabled; continuing with literal LIKE search");
        }
    }

    private boolean isAvailable() {
        Boolean current = available;
        if (current != null) return current;
        synchronized (this) {
            if (available == null) available = detectIndex();
            return available;
        }
    }

    private boolean detectIndex() {
        try (Connection connection = dataSource.getConnection()) {
            if (!"MySQL".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())) return false;
            try (Statement statement = connection.createStatement()) {
                try (ResultSet tokenSize = statement.executeQuery("SELECT @@ngram_token_size")) {
                    if (!tokenSize.next() || tokenSize.getInt(1) != 2) return false;
                }
                try (ResultSet table = statement.executeQuery("SHOW CREATE TABLE store")) {
                    return table.next() && hasMatchingIndex(table.getString(2));
                }
            }
        } catch (SQLException exception) {
            // 접속 정보·SQL·검색 원문이 포함될 수 있는 예외 메시지는 기록하지 않는다.
            log.warn("Store FULLTEXT capability check failed; using literal LIKE search (SQL state: {})",
                    exception.getSQLState());
            return false;
        }
    }

    private static boolean hasMatchingIndex(String definition) {
        Matcher matcher = NGRAM_INDEX.matcher(definition);
        while (matcher.find()) {
            Set<String> columns = Arrays.stream(matcher.group(1).split(","))
                    .map(column -> column.replace("`", "").trim())
                    .collect(Collectors.toSet());
            if (MATCH_COLUMNS.equals(columns)) return true;
        }
        return false;
    }

    private static String indexedPair(String keyword) {
        if (keyword == null) return "";
        int[] characters = keyword.codePoints().toArray();
        String firstPair = "";
        for (int index = 1; index < characters.length; index++) {
            int previous = characters[index - 1];
            int current = characters[index];
            if (!Character.isLetterOrDigit(previous) || !Character.isLetterOrDigit(current)) continue;
            String pair = new String(new int[]{previous, current}, 0, 2);
            if (Character.UnicodeScript.of(previous) == Character.UnicodeScript.HANGUL
                    && Character.UnicodeScript.of(current) == Character.UnicodeScript.HANGUL) return pair;
            if (firstPair.isEmpty()) firstPair = pair;
        }
        return firstPair;
    }
}
