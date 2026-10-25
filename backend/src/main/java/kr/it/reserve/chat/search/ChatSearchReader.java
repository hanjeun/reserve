package kr.it.reserve.chat.search;

import java.time.LocalDate;
import java.util.List;

/** 소유권·표시 기간을 DB에서 확인한 제한된 검색 결과만 제공한다. */
public interface ChatSearchReader {
    record Hit(Long id, Long roomId, Long storeId, String storeName, String excerpt, boolean customer, boolean support) {}
    List<Hit> search(Long memberId, boolean business, String pattern, LocalDate date, int limit);
}
