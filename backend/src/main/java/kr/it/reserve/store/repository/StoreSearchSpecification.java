package kr.it.reserve.store.repository;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.util.StoreRegionNames;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 공개 가게 탐색의 필터와 전체 결과 정렬을 DB 한 관문에서 강제한다. */
public final class StoreSearchSpecification {

    private static final char LIKE_ESCAPE = '!';
    private static final double EARTH_RADIUS_KM = 6_371.0088;

    private StoreSearchSpecification() {
    }

    public static Specification<Store> publicSearch(
            String keyword,
            String sort,
            ServiceDomain domain,
            String region,
            Double latitude,
            Double longitude,
            double distanceCandidateRadiusKm,
            LocalDate today) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.isNull(root.get("deletedAt")));
            predicates.add(builder.equal(root.get("status"), StoreStatus.ACTIVE));

            addKeywordPredicate(predicates, root, builder, keyword);
            addDomainPredicate(predicates, root, builder, domain);
            addRegionPredicate(predicates, root, builder, region);

            boolean distanceSort = "distance".equals(sort) && latitude != null && longitude != null;
            if (distanceSort) {
                addBoundingBoxPredicate(
                        predicates, root, builder, latitude, longitude, distanceCandidateRadiusKm);
            }

            if (!isCountQuery(query)) {
                applyOrdering(root, query, builder, sort, latitude, longitude, today);
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static void addKeywordPredicate(
            List<Predicate> predicates, Root<Store> root, CriteriaBuilder builder, String keyword) {
        String normalized = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) return;

        String pattern = "%" + escapeLike(normalized) + "%";
        predicates.add(builder.or(
                likeLower(root, builder, "name", pattern),
                likeLower(root, builder, "description", pattern),
                likeLower(root, builder, "address", pattern),
                likeLower(root, builder, "category", pattern),
                likeLower(root, builder, "keywords", pattern)));
    }

    private static Predicate likeLower(
            Root<Store> root, CriteriaBuilder builder, String field, String pattern) {
        return builder.like(builder.lower(root.get(field)), pattern, LIKE_ESCAPE);
    }

    private static void addDomainPredicate(
            List<Predicate> predicates, Root<Store> root, CriteriaBuilder builder, ServiceDomain domain) {
        if (domain == null) return;

        Predicate explicit = builder.equal(root.get("serviceDomain"), domain);
        Predicate inferred = builder.and(
                builder.isNull(root.get("serviceDomain")),
                inferredDomainPredicate(root, builder, domain));
        predicates.add(builder.or(explicit, inferred));
    }

    private static Predicate inferredDomainPredicate(
            Root<Store> root, CriteriaBuilder builder, ServiceDomain domain) {
        return switch (domain) {
            case FOOD, BEAUTY_CLINIC, SPORTS, PERFORMANCE, POPUP -> {
                Predicate matchesDomain = categoryContainsAny(root, builder, domain.legacyCategoryWords());
                List<String> higherPriorityWords = domain.higherPriorityLegacyCategoryWords();
                yield higherPriorityWords.isEmpty()
                        ? matchesDomain
                        : builder.and(
                                matchesDomain,
                                builder.not(categoryContainsAny(root, builder, higherPriorityWords)));
            }
            case OTHER -> builder.or(
                    builder.isNull(root.get("category")),
                    builder.not(categoryContainsAny(
                            root,
                            builder,
                            ServiceDomain.allKnownLegacyCategoryWords())));
        };
    }

    private static Predicate categoryContainsAny(
            Root<Store> root, CriteriaBuilder builder, List<String> categoryWords) {
        List<Predicate> matches = new ArrayList<>(categoryWords.size());
        for (String word : categoryWords) {
            matches.add(builder.like(
                    builder.lower(root.get("category")),
                    "%" + escapeLike(word.toLowerCase(Locale.ROOT)) + "%",
                    LIKE_ESCAPE));
        }
        return builder.or(matches.toArray(Predicate[]::new));
    }

    private static void addRegionPredicate(
            List<Predicate> predicates, Root<Store> root, CriteriaBuilder builder, String region) {
        if (region == null || region.isBlank()) return;

        String[] parts = StoreRegionNames.addressParts(region);
        if (parts.length == 0 || parts.length > 2) {
            predicates.add(builder.disjunction());
            return;
        }

        String normalizedRegion = parts[0];
        String district = parts.length == 2 ? parts[1] : null;
        List<Predicate> matches = new ArrayList<>();
        for (String variant : StoreRegionNames.variants(normalizedRegion)) {
            String prefix = district == null ? variant : variant + " " + district;
            String escapedPrefix = escapeLike(prefix);
            matches.add(builder.equal(root.get("address"), prefix));
            matches.add(builder.like(root.get("address"), escapedPrefix + " %", LIKE_ESCAPE));
        }
        predicates.add(matches.isEmpty()
                ? builder.disjunction()
                : builder.or(matches.toArray(Predicate[]::new)));
    }

    /**
     * 거리순은 전체 행을 JVM으로 올리지 않는다. 먼저 좌표 인덱스로 줄일 수 있는 사각 후보를 만들고,
     * 그 후보 안에서 DB가 구면 거리와 같은 순서를 내는 cosine 값을 계산한다.
     */
    private static void addBoundingBoxPredicate(
            List<Predicate> predicates,
            Root<Store> root,
            CriteriaBuilder builder,
            double latitude,
            double longitude,
            double radiusKm) {
        double angularRadius = Math.min(Math.PI, Math.max(0.0, radiusKm) / EARTH_RADIUS_KM);
        double latitudeDelta = Math.toDegrees(angularRadius);
        double minimumLatitude = Math.max(-90.0, latitude - latitudeDelta);
        double maximumLatitude = Math.min(90.0, latitude + latitudeDelta);

        // 구면 cap의 최대 경도 폭을 쓴다. 조회 band가 극점을 포함하면 모든 경도가 후보이고,
        // 그렇지 않으면 asin(sin(angularRadius) / cos(latitude))가 안전한 보수 경계다.
        boolean includesPole = minimumLatitude <= -90.0 || maximumLatitude >= 90.0;
        double longitudeDelta;
        if (includesPole) {
            longitudeDelta = 180.0;
        } else {
            double ratio = Math.sin(angularRadius) / Math.cos(Math.toRadians(latitude));
            longitudeDelta = Math.toDegrees(Math.asin(Math.min(1.0, Math.abs(ratio))));
        }

        Expression<Double> storeLatitude = root.get("latitude");
        Expression<Double> storeLongitude = root.get("longitude");
        predicates.add(builder.isNotNull(storeLatitude));
        predicates.add(builder.isNotNull(storeLongitude));
        predicates.add(builder.between(
                storeLatitude,
                minimumLatitude,
                maximumLatitude));

        if (longitudeDelta >= 180.0) return;

        double minimumLongitude = longitude - longitudeDelta;
        double maximumLongitude = longitude + longitudeDelta;
        if (minimumLongitude < -180.0) {
            predicates.add(builder.or(
                    builder.greaterThanOrEqualTo(storeLongitude, minimumLongitude + 360.0),
                    builder.lessThanOrEqualTo(storeLongitude, maximumLongitude)));
        } else if (maximumLongitude > 180.0) {
            predicates.add(builder.or(
                    builder.greaterThanOrEqualTo(storeLongitude, minimumLongitude),
                    builder.lessThanOrEqualTo(storeLongitude, maximumLongitude - 360.0)));
        } else {
            predicates.add(builder.between(storeLongitude, minimumLongitude, maximumLongitude));
        }
    }

    private static void applyOrdering(
            Root<Store> root,
            CriteriaQuery<?> query,
            CriteriaBuilder builder,
            String sort,
            Double latitude,
            Double longitude,
            LocalDate today) {
        List<Order> orders = new ArrayList<>();
        Subquery<Long> promotedStores = query.subquery(Long.class);
        Root<Advertisement> advertisement = promotedStores.from(Advertisement.class);
        promotedStores.select(advertisement.get("store").get("id"));
        promotedStores.where(
                builder.equal(advertisement.get("store").get("id"), root.get("id")),
                builder.equal(advertisement.get("status"), AdStatus.ACTIVE),
                builder.equal(advertisement.get("adType"), AdType.BADGE),
                builder.isNull(advertisement.get("deletedAt")),
                builder.lessThanOrEqualTo(advertisement.get("startDate"), today),
                builder.greaterThanOrEqualTo(advertisement.get("endDate"), today));
        Expression<Integer> promotionRank = builder.<Integer>selectCase()
                .when(builder.exists(promotedStores), 0)
                .otherwise(1);
        orders.add(builder.asc(promotionRank));
        switch (sort) {
            case "distance" -> orders.add(builder.desc(distanceCosine(root, builder, latitude, longitude)));
            case "recommended" -> {
                orders.add(builder.desc(builder.coalesce(root.get("rating"), 0.0)));
                orders.add(builder.desc(builder.coalesce(root.get("reviewCount"), 0)));
            }
            case "recent" -> orders.add(builder.desc(root.get("createdAt")));
            case "reviews" -> orders.add(builder.desc(builder.coalesce(root.get("reviewCount"), 0)));
            default -> orders.add(builder.desc(builder.coalesce(root.get("rating"), 0.0)));
        }
        orders.add(builder.desc(root.get("id")));
        query.orderBy(orders);
    }

    /** acos는 단조 감소하므로 구면 거리 오름차순은 cosine 내림차순과 동일하다. */
    private static Expression<Double> distanceCosine(
            Root<Store> root, CriteriaBuilder builder, double latitude, double longitude) {
        double latitudeRadians = Math.toRadians(latitude);
        Expression<Double> storeLatitudeRadians = builder.function(
                "radians", Double.class, root.get("latitude"));
        Expression<Double> longitudeDeltaRadians = builder.function(
                "radians", Double.class, builder.diff(root.<Double>get("longitude"), longitude));
        Expression<Double> latitudeTerm = builder.prod(
                Math.sin(latitudeRadians),
                builder.function("sin", Double.class, storeLatitudeRadians));
        Expression<Double> longitudeTerm = builder.prod(
                Math.cos(latitudeRadians),
                builder.prod(
                        builder.function("cos", Double.class, storeLatitudeRadians),
                        builder.function("cos", Double.class, longitudeDeltaRadians)));
        return builder.sum(latitudeTerm, longitudeTerm);
    }

    private static boolean isCountQuery(CriteriaQuery<?> query) {
        return Long.class.equals(query.getResultType()) || long.class.equals(query.getResultType());
    }

    private static String escapeLike(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

}
