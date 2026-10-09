package kr.it.reserve.waiting.service;

import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import kr.it.reserve.waiting.dto.*;
import kr.it.reserve.waiting.entity.*;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import kr.it.reserve.waiting.util.WaitingQrTokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class CustomerWaitingService {
    private static final Set<String> PERSONAL_STATUSES = Set.of("ALL", "WAITING", "CALLED", "SEATED", "CANCELLED");
    private static final Set<String> ACTIVE_NAMES = WaitingStatus.ACTIVE.stream()
            .map(WaitingStatus::name).collect(Collectors.toUnmodifiableSet());
    private final WaitingEntryRepository entries;
    private final StoreRepository stores;
    private final MemberRepository members;
    private final WaitingService staff;
    private final WaitingQrTokenProvider tokens;
    private final WaitingEventPublisher events;
    private final WaitingRetentionService retention;
    private final Clock clock;

    @Autowired
    public CustomerWaitingService(WaitingEntryRepository entries, StoreRepository stores, MemberRepository members,
                                  WaitingService staff, WaitingQrTokenProvider tokens, WaitingEventPublisher events,
                                  WaitingRetentionService retention) {
        this(entries, stores, members, staff, tokens, events, retention, Clock.systemUTC());
    }

    CustomerWaitingService(WaitingEntryRepository entries, StoreRepository stores, MemberRepository members,
                           WaitingService staff, WaitingQrTokenProvider tokens, WaitingEventPublisher events,
                           WaitingRetentionService retention, Clock clock) {
        this.entries = entries; this.stores = stores; this.members = members;
        this.staff = staff; this.tokens = tokens; this.events = events; this.clock = clock;
        this.retention = retention;
    }

    public Page<StoreResponse> directory(String keyword, int page, int size) {
        return directory(keyword, page, size, new DirectoryFilters("", "ALL", "recent"));
    }

    public record DirectoryFilters(String region, String status, String sort) {}

    public Page<StoreResponse> directory(String keyword, int page, int size, DirectoryFilters filters) {
        String term = keyword == null ? "" : keyword.strip();
        if (term.length() > 100) throw bad("검색어는 100자까지 입력해주세요.");
        String region = filters.region() == null ? "" : filters.region().strip();
        String status = filters.status() == null ? "ALL" : filters.status();
        String sort = filters.sort() == null ? "recommended" : filters.sort();
        if (region.length() > 100) throw bad("지역을 확인해주세요.");
        if (!Set.of("ALL", "OPEN", "PAUSED").contains(status)) throw bad("접수 상태를 확인해주세요.");
        if (!Set.of("recommended", "rating", "reviewCount", "recent").contains(sort)) throw bad("가게 정렬을 확인해주세요.");
        // LIKE 와일드카드는 검색어의 문자로만 처리한다.
        String escaped = term.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        Specification<Store> directory = (root, query, cb) -> cb.and(
                root.get("waitingIntakeMode").in(WaitingIntakeMode.ONSITE, WaitingIntakeMode.REMOTE, WaitingIntakeMode.BOTH),
                "ALL".equals(status) ? cb.conjunction() : cb.equal(root.get("waitingPaused"), "PAUSED".equals(status)),
                cb.or(cb.like(cb.lower(root.get("name")), "%" + escaped + "%", '\\'),
                        cb.like(cb.lower(root.get("category")), "%" + escaped + "%", '\\')));
        // 탐색과 같은 지역·추천/별점/리뷰 정렬을 전체 결과에 먼저 적용한 뒤 페이지를 자른다.
        var publicSearch = StoreSearchSpecification.publicSearch(null, "reviewCount".equals(sort) ? "reviews" : sort,
                null, region, new StoreSearchSpecification.DistanceCandidates(null, null, 0),
                clock.instant().atZone(ServiceTime.ZONE).toLocalDate());
        return stores.findAll(publicSearch.and(directory), PageRequests.bounded(page, size))
                .map(StoreResponse::fromEntity);
    }

    public Page<MyWaitingResponse> mine(Member actor, int page, int size) {
        return mine(actor, page, size, "", "ALL", "recent");
    }

    public Page<MyWaitingResponse> mine(Member actor, int page, int size, String keyword, String status, String sort) {
        validateMember(actor);
        if (keyword != null && keyword.length() > 100) throw bad("검색어는 100자까지 입력해주세요.");
        String term = keyword == null ? "" : keyword.strip();
        String filterStatus = status == null ? "ALL" : status;
        String filterSort = sort == null ? "recent" : sort;
        if (!PERSONAL_STATUSES.contains(filterStatus)) throw bad("웨이팅 상태를 확인해주세요.");
        if (!"recent".equals(filterSort) && !"oldest".equals(filterSort)) throw bad("웨이팅 정렬을 확인해주세요.");
        String escaped = term.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        var today = clock.instant().atZone(ServiceTime.ZONE).toLocalDate();
        var dayStart = WaitingService.dayStartUtc(today);
        var pageable = PageRequests.bounded(page, size);
        Page<WaitingEntry> personal = term.isEmpty() && "ALL".equals(filterStatus) && "recent".equals(filterSort)
                ? entries.findPersonal(actor.getId(), WaitingStatus.ACTIVE, dayStart, pageable)
                : entries.findPersonalFiltered(actor.getId(), ACTIVE_NAMES, dayStart, filterStatus,
                        term.isEmpty() ? "" : "%" + escaped + "%", filterSort, pageable);
        return personal
                .map(entry -> {
                    Store store = stores.findById(entry.getStoreId()).orElse(null);
                    long ahead = entry.getStatus() == WaitingStatus.WAITING
                            ? entries.teamsAhead(entry.getStoreId(), WaitingStatus.ACTIVE, entry.getBusinessDate(), entry.getEntryNumber()) : 0;
                    return new MyWaitingResponse(WaitingEntryResponse.from(entry), store == null ? "가게" : store.getName(),
                            store == null ? null : store.getMainImageUrl(), store == null ? null : store.getMainImageWidth(),
                            store == null ? null : store.getMainImageHeight(), ahead);
                });
    }

    @Transactional
    public WaitingEntryResponse join(Member actor, Long storeId, JoinWaitingRequest request) {
        // 탈퇴와 접수의 경쟁을 막는다. 잠금 순서는 회원 → 가게이며 탈퇴 정리도 같다.
        Member member = lockedMember(actor);
        Store store = availableStore(storeId, true);
        validateRequest(request);
        String requestId = request.clientRequestId().toLowerCase(Locale.ROOT);
        var existing = entries.findByStoreIdAndClientRequestId(storeId, requestId);
        if (existing.isPresent()) {
            WaitingEntry prior = existing.get();
            if (!member.getId().equals(prior.getMemberId()) || prior.getPartySize() != request.partySize()) {
                throw conflict("다른 접수에 사용된 식별자예요. 다시 접수해주세요.");
            }
            return WaitingEntryResponse.from(prior);
        }
        var policy = retention.customerPolicy();
        if (!policy.intakeReady()) {
            throw new WaitingException("웨이팅 접수를 준비 중이에요. 잠시 후 다시 이용해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (!Boolean.TRUE.equals(request.privacyAgreed()) || !policy.noticePublishedAt().equals(request.privacyNoticePublishedAt())) {
            throw bad("웨이팅 접수 안내를 확인하고 가게에 개인정보 제공에 동의해주세요.");
        }
        if (store.isWaitingPaused()) throw conflict("웨이팅 접수가 잠시 중지돼 있어요. 기존 대기는 유지돼요.");
        if (entries.existsByStoreIdAndMemberIdAndStatusIn(storeId, member.getId(), WaitingStatus.ACTIVE)) {
            throw conflict("이미 이 가게에서 대기 중이에요. 내 예약에서 확인해주세요.");
        }
        if (Objects.equals(store.getOwner() == null ? null : store.getOwner().getId(), member.getId())) {
            throw conflict("내 가게는 사업자 패널에서 접수해주세요.");
        }
        WaitingSource source;
        if (request.onsiteToken() != null && !request.onsiteToken().isBlank()) {
            if (!store.resolveWaitingIntakeMode().allowsOnsite() || !storeId.equals(tokens.parseOnsite(request.onsiteToken()))) {
                throw conflict("현재 이 가게의 현장 QR 접수를 이용할 수 없어요.");
            }
            source = WaitingSource.ONSITE;
        } else {
            if (!store.resolveWaitingIntakeMode().allowsRemote()) throw conflict("가게에 도착해 현장 접수 QR을 스캔해주세요.");
            source = WaitingSource.REMOTE;
        }
        var now = clock.instant();
        var date = now.atZone(ServiceTime.ZONE).toLocalDate();
        int last = entries.lastEntryNumber(storeId, date);
        if (last == Integer.MAX_VALUE) throw conflict("오늘 접수할 수 있는 번호를 초과했어요.");
        // 회원 이름 중 필요한 표시명만 복사한다. 이메일·전화번호는 명단에 넣지 않는다.
        String name = member.getName() == null ? null : member.getName().strip();
        if (name != null && name.length() > 40) name = name.substring(0, 40);
        WaitingEntry saved = entries.save(WaitingEntry.createForCustomer(storeId, date, last + 1, name,
                request.partySize(), requestId, LocalDateTime.ofInstant(now, ZoneOffset.UTC), member.getId(), source,
                LocalDateTime.ofInstant(policy.noticePublishedAt(), ZoneOffset.UTC)));
        events.changed(store, saved);
        return WaitingEntryResponse.from(saved);
    }

    @Transactional
    public WaitingEntryResponse cancel(Member actor, Long entryId) {
        Member member = lockedMember(actor);
        Long storeId = entries.findCustomerStoreId(entryId, member.getId())
                .orElseThrow(() -> new WaitingException("내 대기 접수를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        Store store = stores.findByIdForUpdate(storeId)
                .orElseThrow(() -> new WaitingException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        // 가게 잠금을 기다리는 동안 호출·입장 상태가 바뀔 수 있으므로 최신 행을 다시 읽는다.
        WaitingEntry entry = entries.findByIdAndStoreIdForUpdate(entryId, store.getId()).orElseThrow(() -> bad("접수를 찾을 수 없어요."));
        requireOwn(member, entry);
        entry.changeStatus(WaitingStatus.CANCELLED, nowUtc());
        events.changed(store, entry);
        return WaitingEntryResponse.from(entry);
    }

    public WaitingQrResponse entryQr(Member actor, Long entryId) {
        validateMember(actor);
        WaitingEntry entry = ownEntry(actor, entryId);
        availableStore(entry.getStoreId(), false);
        if (entry.getStatus() != WaitingStatus.CALLED) throw conflict("호출된 접수의 입장 QR만 확인할 수 있어요.");
        return tokens.issueEntry(entryId, actor.getId());
    }

    public WaitingQrResponse onsiteQr(Member actor, Long storeId) {
        Store store = staff.ownedStore(actor, storeId, false);
        if (store.getStatus() != StoreStatus.ACTIVE || store.isWaitingPaused() || !store.resolveWaitingIntakeMode().allowsOnsite()) {
            throw conflict("현장 QR 접수를 켠 가게에서 사용할 수 있어요.");
        }
        return tokens.issueOnsite(storeId);
    }

    @Transactional
    public CheckinResponse checkin(Member actor, String token) {
        var identity = tokens.parseEntry(token);
        Long storeId = entries.findStoreId(identity.entryId()).orElseThrow(() -> bad("접수를 찾을 수 없어요."));
        Store store = staff.ownedStore(actor, storeId, true);
        if (store.getStatus() != StoreStatus.ACTIVE) throw conflict("현재 입장을 처리할 수 없는 가게예요.");
        WaitingEntry entry = entries.findByIdAndStoreIdForUpdate(identity.entryId(), store.getId()).orElseThrow(() -> bad("접수를 찾을 수 없어요."));
        if (!identity.memberId().equals(entry.getMemberId())) throw bad("입장 QR과 접수가 일치하지 않아요.");
        boolean already = entry.getStatus() == WaitingStatus.SEATED;
        if (!already && entry.getStatus() != WaitingStatus.CALLED) throw conflict("호출된 접수만 입장할 수 있어요.");
        entry.changeStatus(WaitingStatus.SEATED, nowUtc());
        events.changed(store, entry);
        return new CheckinResponse(WaitingEntryResponse.from(entry), already);
    }

    public record CheckinResponse(WaitingEntryResponse entry, boolean alreadyCheckedIn) {}

    private Member lockedMember(Member actor) {
        validateMember(actor);
        Member current = members.findActiveByIdForUpdate(actor.getId()).orElseThrow(() -> bad("로그인 상태를 확인해주세요."));
        validateMember(current);
        return current;
    }
    private void validateMember(Member actor) {
        if (actor == null || actor.getId() == null || actor.isDeleted() || actor.isSuspended()) {
            throw new WaitingException("로그인 상태를 확인해주세요.", HttpStatus.FORBIDDEN);
        }
    }
    private WaitingEntry ownEntry(Member actor, Long entryId) {
        if (entryId == null || entryId < 1) throw bad("접수를 찾을 수 없어요.");
        WaitingEntry entry = entries.findById(entryId).orElseThrow(() -> bad("접수를 찾을 수 없어요."));
        requireOwn(actor, entry);
        return entry;
    }
    private void requireOwn(Member actor, WaitingEntry entry) {
        if (!actor.getId().equals(entry.getMemberId())) throw new WaitingException("내 대기 접수만 확인할 수 있어요.", HttpStatus.FORBIDDEN);
    }
    private Store availableStore(Long id, boolean lock) {
        if (id == null || id < 1) throw bad("가게를 찾을 수 없어요.");
        Store store = (lock ? stores.findByIdForUpdate(id) : stores.findById(id)).orElseThrow(() -> bad("가게를 찾을 수 없어요."));
        if (store.isDeleted() || store.getStatus() != StoreStatus.ACTIVE) throw conflict("현재 접수를 받을 수 없는 가게예요.");
        return store;
    }
    private void validateRequest(JoinWaitingRequest request) {
        if (request == null || request.partySize() == null || request.partySize() < 1 || request.partySize() > 100
                || request.clientRequestId() == null || !request.clientRequestId().matches("[A-Za-z0-9_-]{1,64}")
                || (request.onsiteToken() != null && request.onsiteToken().length() > 2048)) throw bad("접수 인원과 입력 내용을 확인해주세요.");
    }
    private LocalDateTime nowUtc() { return LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC); }
    private WaitingException bad(String message) { return new WaitingException(message, HttpStatus.BAD_REQUEST); }
    private WaitingException conflict(String message) { return new WaitingException(message, HttpStatus.CONFLICT); }
}
