package kr.it.reserve.store.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.dto.StoreRegionGroup;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import kr.it.reserve.store.search.StoreFulltextSearch;
import kr.it.reserve.store.util.StoreRegionNames;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 공개 검색·건수·지역과 소유자 수정 조회는 호출 서비스의 읽기 트랜잭션을 공유한다. */
final class StoreDirectory {
    private static final String EDIT_FORBIDDEN_MESSAGE = "가게를 수정할 권한이 없어요.";
    private static final String DISTANCE_SORT = "distance";
    private static final double DISTANCE_CANDIDATE_RADIUS_KM = 1_000.0;
    private final StoreRepository storeRepository;
    private final StoreFulltextSearch storeFulltextSearch;
    private final boolean fulltextEnabled;
    private final StoreWaitingCounts waitingCounts;

    StoreDirectory(StoreRepository stores, StoreFulltextSearch fulltext, boolean enabled, StoreWaitingCounts waitingCounts) {
        storeRepository = stores;
        storeFulltextSearch = fulltext;
        fulltextEnabled = enabled;
        this.waitingCounts = waitingCounts;
    }

    List<StoreResponse> getMyStores(Member member) {
        List<Store> stores = storeRepository.findByOwnerAndDeletedAtIsNullOrderByCreatedAtDesc(member);
        return stores.stream()
                .map(StoreResponse::fromEntity)
                .toList();
    }

    StoreResponse getStoreForEdit(Long id, Member member) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getDeletedAt() != null) {
            throw StoreException.notFound();
        }
        // 관리자는 모든 가게 수정 가능, 소유자는 본인 가게만
        boolean isAdmin = member.isAdmin();
        boolean isOwner = store.getOwner() != null && store.getOwner().getId().equals(member.getId());
        if (!isAdmin && !isOwner) {
            throw StoreException.forbidden(EDIT_FORBIDDEN_MESSAGE);
        }
        return StoreResponse.fromEntity(store);
    }

    StoreResponse getStore(Long id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(StoreException::notFound);
        if (store.getDeletedAt() != null || store.isSuspended()) {
            throw StoreException.notFound();
        }
        if (store.resolveWaitingIntakeMode() != WaitingIntakeMode.OFF) {
            return StoreResponse.fromWaitingDirectory(store, waitingCounts.activeTeams(id));
        }
        return StoreResponse.fromEntity(store);
    }

    Page<StoreResponse> search(
            String keyword, String sort, Pageable pageable, Double lat, Double lng, String domain, String region) {
        String normalizedSort = normalizeSort(sort);
        if (DISTANCE_SORT.equals(normalizedSort) && !validCoordinates(lat, lng)) {
            normalizedSort = "rating";
        }
        ServiceDomain domainFilter = ServiceDomain.parseOrNull(domain);
        String regionFilter = region == null ? "" : region.trim();
        String normalized = keyword == null ? "" : keyword.trim();
        // 공개 상태·검색·분야(legacy null 추론)·지역·노출형 우선순위·거리 후보를 같은 DB 쿼리/count에 적용한다.
        // Pageable은 그대로 전달하되 정렬은 Specification이 허용 목록으로만 구성한다.
        Specification<Store> literalSearch = StoreSearchSpecification.publicSearch(
                        normalized,
                        normalizedSort,
                        domainFilter,
                        regionFilter,
                        new StoreSearchSpecification.DistanceCandidates(lat, lng, DISTANCE_CANDIDATE_RADIUS_KM),
                        ServiceTime.today());
        if (fulltextEnabled) {
            String candidate = storeFulltextSearch.candidateQuery(normalized);
            if (!candidate.isEmpty()) {
                try {
                    return storeFulltextSearch.search(literalSearch, candidate, pageable);
                } catch (DataAccessException exception) {
                    // 독립 읽기 트랜잭션이 끝난 뒤 LIKE로 돌아가므로 실패한 MATCH가 폴백을 오염시키지 않는다.
                    storeFulltextSearch.disable();
                }
            }
        }
        return storeRepository.findAll(literalSearch, pageable).map(StoreResponse::fromEntity);
    }

    private String normalizeSort(String sort) {
        if ("reviewCount".equals(sort)) return "reviews";
        return "recommended".equals(sort) || "recent".equals(sort) || "reviews".equals(sort)
                || DISTANCE_SORT.equals(sort) ? sort : "rating";
    }

    private static boolean validCoordinates(Double lat, Double lng) {
        return lat != null && lng != null && Double.isFinite(lat) && Double.isFinite(lng)
                && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    }

    List<StoreRegionGroup> getAvailableRegions() {
        Map<String, Long> regionCounts = new HashMap<>();
        Map<String, Map<String, Long>> areaCounts = new HashMap<>();
        for (String address : storeRepository.findPublicAddresses()) {
            String[] parts = StoreRegionNames.addressParts(address);
            if (parts.length == 0) continue;
            String region = parts[0];
            regionCounts.merge(region, 1L, Long::sum);
            if (parts.length > 1) {
                areaCounts.computeIfAbsent(region, ignored -> new HashMap<>())
                        .merge(parts[1], 1L, Long::sum);
            }
        }
        return regionCounts.entrySet().stream()
                .sorted((a, b) -> {
                    int byCount = Long.compare(b.getValue(), a.getValue());
                    return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());
                })
                .map(entry -> {
                    List<StoreRegionGroup.Area> areas = areaCounts
                            .getOrDefault(entry.getKey(), Map.of()).entrySet().stream()
                            .sorted((a, b) -> {
                                int byCount = Long.compare(b.getValue(), a.getValue());
                                return byCount != 0 ? byCount : a.getKey().compareTo(b.getKey());
                            })
                            .map(area -> new StoreRegionGroup.Area(area.getKey(), area.getValue()))
                            .toList();
                    return new StoreRegionGroup(entry.getKey(), entry.getValue(), areas);
                })
                .toList();
    }
}
