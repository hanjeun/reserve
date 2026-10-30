package kr.it.reserve.reservation.scheduler;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReservationCandidateCursorTest {
    @Test
    void failedCandidatesDoNotStarveLaterIdsAndNewArrivalsCannotPostponeTheNextSweep() {
        var cursor = new ReservationCandidateCursor(2);
        var maximum = new AtomicLong(5);
        var snapshots = new AtomicInteger();
        List<Long> eligible = new ArrayList<>(List.of(1L, 2L, 3L, 4L, 5L));
        BiFunction<Long, Long, List<Long>> query = (after, through) -> eligible.stream()
                .filter(id -> id > after && id <= through).limit(2).toList();
        java.util.function.LongSupplier snapshot = () -> { snapshots.incrementAndGet(); return maximum.get(); };

        // 앞의 두 건이 실패하여 그대로 남아 있어도 다음 실행은 뒤의 두 건을 처리한다.
        assertThat(cursor.next(snapshot, query)).containsExactly(1L, 2L);
        maximum.set(6);
        eligible.add(6L);
        assertThat(cursor.next(snapshot, query)).containsExactly(3L, 4L);
        assertThat(cursor.next(snapshot, query)).containsExactly(5L);
        assertThat(snapshots).hasValue(1);
        assertThat(cursor.next(snapshot, query)).containsExactly(1L, 2L);
        assertThat(snapshots).hasValue(2);
    }

    @Test
    void removalBetweenPagesDoesNotSkipRemainingIdsAndLateEligibilityIsRetriedNextSweep() {
        var cursor = new ReservationCandidateCursor(2);
        List<Long> eligible = new ArrayList<>(List.of(1L, 2L, 4L, 5L));
        BiFunction<Long, Long, List<Long>> query = (after, through) -> eligible.stream()
                .filter(id -> id > after && id <= through).limit(2).toList();
        assertThat(cursor.next(() -> 5L, query)).containsExactly(1L, 2L);
        eligible.removeAll(List.of(1L, 2L));
        eligible.addFirst(1L); // 이미 지난 ID가 새로 만료 조건을 만족한 경우
        assertThat(cursor.next(() -> 5L, query)).containsExactly(4L, 5L);
        assertThat(cursor.next(() -> 5L, query)).containsExactly(1L, 4L);
    }

    @Test
    void queryFailureKeepsTheCursorAndEmptyTailStartsANewBoundedSweep() {
        var cursor = new ReservationCandidateCursor(2);
        assertThatThrownBy(() -> cursor.next(() -> 9L, (after, through) -> {
            throw new IllegalStateException("synthetic read failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(cursor.next(() -> 10L, (after, through) -> {
            assertThat(after).isZero();
            assertThat(through).isEqualTo(9);
            return List.of(1L, 2L);
        })).containsExactly(1L, 2L);
        assertThat(cursor.next(() -> 10L, (after, through) -> {
            assertThat(after).isEqualTo(2);
            return List.of();
        })).isEmpty();
        cursor.next(() -> 10L, (after, through) -> {
            assertThat(after).isZero();
            assertThat(through).isEqualTo(10);
            return List.of();
        });
    }

    @Test
    void emptyDatabaseDoesNotReadCandidateRows() {
        var cursor = new ReservationCandidateCursor(2);
        assertThat(cursor.next(() -> 0L, (after, through) -> {
            throw new AssertionError("no candidate query is needed");
        })).isEmpty();
    }
}
