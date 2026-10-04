package kr.it.reserve.waiting.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.waiting.dto.CreateWaitingRequest;
import kr.it.reserve.waiting.dto.UpdateWaitingStatusRequest;
import kr.it.reserve.waiting.dto.WaitingBoardResponse;
import kr.it.reserve.waiting.dto.WaitingEntryResponse;
import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Objects;

@Service
@Transactional(readOnly = true)
public class WaitingService {
    private final WaitingEntryRepository entries;
    private final StoreRepository stores;
    private final Clock clock;

    @Autowired
    public WaitingService(WaitingEntryRepository entries, StoreRepository stores) {
        this(entries, stores, Clock.systemUTC());
    }

    WaitingService(WaitingEntryRepository entries, StoreRepository stores, Clock clock) {
        this.entries = entries;
        this.stores = stores;
        this.clock = clock;
    }

    public WaitingBoardResponse getBoard(Member actor, Long storeId) {
        ownedStore(actor, storeId, false);
        LocalDate today = clock.instant().atZone(ServiceTime.ZONE).toLocalDate();
        LocalDateTime start = dayStartUtc(today);
        LocalDateTime end = dayStartUtc(today.plusDays(1));
        return new WaitingBoardResponse(storeId, today,
                entries.findBoard(storeId, WaitingStatus.ACTIVE, WaitingStatus.TERMINAL, start, end)
                        .stream().map(WaitingEntryResponse::from).toList());
    }

    @Transactional
    public WaitingEntryResponse create(Member actor, Long storeId, CreateWaitingRequest request) {
        Store store = ownedStore(actor, storeId, true);
        if (store.getStatus() != StoreStatus.ACTIVE) {
            throw new WaitingException("현재 접수를 받을 수 없는 가게입니다.", HttpStatus.CONFLICT);
        }
        if (request == null || request.partySize() == null || request.partySize() < 1 || request.partySize() > 100) {
            throw new WaitingException("인원은 1명부터 100명까지 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        String displayName = normalizeName(request.displayName());
        String requestId = normalizeRequestId(request.clientRequestId());
        var existing = entries.findByStoreIdAndClientRequestId(storeId, requestId);
        if (existing.isPresent()) {
            WaitingEntry entry = existing.get();
            // 완료 후 표시 이름이 최소화된 행은 이름을 복원하지 않고 기존 접수만 반환한다.
            boolean clearedName = entry.getStatus().isTerminal() && entry.getDisplayName() == null;
            if (entry.getPartySize() != request.partySize()
                    || (!clearedName && !Objects.equals(entry.getDisplayName(), displayName))) {
                throw new WaitingException("접수 식별자가 다른 접수에 사용되었습니다. 목록을 새로고침해주세요.", HttpStatus.CONFLICT);
            }
            return WaitingEntryResponse.from(entry);
        }

        Instant now = clock.instant();
        LocalDate today = now.atZone(ServiceTime.ZONE).toLocalDate();
        // 같은 Store row를 잠근 상태에서 번호 조회·저장을 실행해 동시 접수와 폐업이 직렬화된다.
        int last = entries.lastEntryNumber(storeId, today);
        if (last == Integer.MAX_VALUE) {
            throw new WaitingException("오늘 접수할 수 있는 번호를 초과했습니다.", HttpStatus.CONFLICT);
        }
        WaitingEntry entry = WaitingEntry.create(storeId, today, last + 1, displayName, request.partySize(),
                requestId, LocalDateTime.ofInstant(now, ZoneOffset.UTC));
        return WaitingEntryResponse.from(entries.save(entry));
    }

    @Transactional
    public WaitingEntryResponse updateStatus(Member actor, Long storeId, Long entryId, UpdateWaitingStatusRequest request) {
        ownedStore(actor, storeId, true);
        if (request == null || request.status() == null) {
            throw new WaitingException("변경할 상태를 선택해주세요.", HttpStatus.BAD_REQUEST);
        }
        WaitingEntry entry = entries.findByIdAndStoreId(entryId, storeId)
                .orElseThrow(() -> new WaitingException("대기 접수를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        entry.changeStatus(request.status(), LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
        return WaitingEntryResponse.from(entry);
    }

    private Store ownedStore(Member actor, Long storeId, boolean lock) {
        if (actor == null || actor.getId() == null || actor.isDeleted() || actor.isSuspended()
                || (!actor.isBusiness() && !actor.isAdmin())) {
            throw new WaitingException("가게 운영 권한이 필요합니다.", HttpStatus.FORBIDDEN);
        }
        if (storeId == null || storeId < 1) {
            throw new WaitingException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
        Store store = (lock ? stores.findByIdForUpdate(storeId) : stores.findById(storeId))
                .orElseThrow(() -> new WaitingException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (store.isDeleted()) {
            throw new WaitingException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
        if (store.getOwner() == null || !actor.getId().equals(store.getOwner().getId())) {
            throw new WaitingException("내 가게의 대기 접수만 처리할 수 있습니다.", HttpStatus.FORBIDDEN);
        }
        return store;
    }

    private static String normalizeName(String value) {
        if (value == null) return null;
        String name = value.replaceAll("\\s+", " ").strip();
        if (name.length() > 40) {
            throw new WaitingException("표시 이름은 40자까지 입력할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
        return name.isEmpty() ? null : name;
    }

    private static String normalizeRequestId(String value) {
        if (value == null || value.length() > 64 || !value.matches("[A-Za-z0-9_-]+")) {
            throw new WaitingException("올바른 접수 식별자가 필요합니다.", HttpStatus.BAD_REQUEST);
        }
        return value.toLowerCase(Locale.ROOT);
    }

    static LocalDateTime dayStartUtc(LocalDate date) {
        return date.atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }
}
