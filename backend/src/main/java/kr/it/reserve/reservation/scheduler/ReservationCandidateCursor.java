package kr.it.reserve.reservation.scheduler;

import java.util.List;
import java.util.function.BiFunction;
import java.util.function.LongSupplier;

/**
 * 한 실행은 한 페이지만 처리하고, 실패·보류 후보도 다음 순회에서 다시 본다.
 * 순회 상한을 고정하므로 계속 들어오는 새 ID가 과거 후보의 재시도를 막지 않는다.
 * 상태 변경은 개별 processor가 잠금 아래 재검사하며, 재시작 시 커서는 처음부터 돈다.
 */
final class ReservationCandidateCursor {
    private final int batchSize;
    private long afterId;
    private long throughId;

    ReservationCandidateCursor(int batchSize) {
        this.batchSize = batchSize;
    }

    List<Long> next(LongSupplier maximumId, BiFunction<Long, Long, List<Long>> query) {
        if (throughId == 0) throughId = maximumId.getAsLong();
        if (throughId == 0) return List.of();

        List<Long> ids = query.apply(afterId, throughId);
        if (ids.size() < batchSize || ids.getLast() >= throughId) {
            afterId = 0;
            throughId = 0;
        } else {
            afterId = ids.getLast();
        }
        return ids;
    }
}
