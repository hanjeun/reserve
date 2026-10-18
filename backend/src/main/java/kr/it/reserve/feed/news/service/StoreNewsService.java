package kr.it.reserve.feed.news.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedAuditRecord;
import kr.it.reserve.feed.repository.FeedAuditRepository;
import kr.it.reserve.feed.repository.FeedMediaRepository;
import kr.it.reserve.feed.repository.FeedPostRepository;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

/** 혜택은 별도 원문·심사·공개 경로를 사용하고 사진 보존 기반만 재사용한다. */
@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class StoreNewsService {
    private final StoreNewsAvailability policy;
    private final FeedService feeds;
    private final PromotionRepository promotions;
    private final FeedPostRepository posts;
    private final FeedMediaRepository media;
    private final MemberRepository members;
    private final StoreRepository stores;
    private final EntityManager entityManager;
    private final FeedAuditRepository audits;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private StoreNewsEvents changes;

    public Page<PromotionDto.PublicPromotionSummaryResponse> publicList(int page, int size, Long storeId, String type, String period) {
        if (storeId != null && storeId <= 0) throw FeedException.invalid("가게를 다시 선택해주세요.");
        if (!Set.of("ONGOING", "ALL").contains(period)) throw FeedException.invalid("소식 기간을 다시 선택해주세요.");
        Promotion.NewsType selected = type == null || type.isBlank() ? null : type(type);
        return promotions.findAll(StoreNewsPolicy.publicSpecification(storeId, selected, "ONGOING".equals(period)),
                PageRequests.bounded(page, size).withSort(Sort.by(Sort.Direction.DESC, "createdAt", "id")))
                .map(news -> {
                    var result = PromotionDto.PublicPromotionSummaryResponse.fromEntity(news);
                    result.setImages(images(news)); return result;
                });
    }

    public PromotionDto.PublicPromotionDetailResponse publicDetail(Long id) {
        Promotion news = promotions.findById(id).filter(StoreNewsPolicy::publiclyVisible).orElseThrow(FeedException::missing);
        var result = PromotionDto.PublicPromotionDetailResponse.fromEntity(news); result.setImages(images(news)); return result;
    }

    public List<StoreNewsDto.StoreChoice> stores(Long memberId) {
        policy.requireEnabled(); business(reader(memberId));
        return stores.findByOwnerId(memberId).stream().filter(StoreNewsPolicy::usable)
                .map(store -> new StoreNewsDto.StoreChoice(store.getId(), store.getName(), store.getCategory(), store.getAddress(),
                        store.getMainImageUrl(), store.isReservationEnabled(),
                        store.resolveWaitingIntakeMode() != kr.it.reserve.store.entity.WaitingIntakeMode.OFF)).toList();
    }

    public Page<StoreNewsDto.News> mine(Long memberId, Long storeId, String state, int page, int size) {
        policy.requireEnabled(); business(reader(memberId));
        if (storeId != null && storeId <= 0) throw FeedException.invalid("가게를 다시 선택해주세요.");
        if (!Set.of("ALL", "DRAFT", "PUBLISHED", "ENDED", "HIDDEN", "DELETED").contains(state)) throw FeedException.invalid("소식 상태를 다시 선택해주세요.");
        LocalDateTime now = StoreNewsPolicy.now();
        Specification<Promotion> specification = (root, query, cb) -> {
            var result = cb.and(cb.equal(root.get("member").get("id"), memberId), cb.notEqual(root.get("state"), Promotion.State.DELETED));
            if (storeId != null) result = cb.and(result, cb.equal(root.get("store").get("id"), storeId));
            if ("ENDED".equals(state)) result = cb.and(result, cb.equal(root.get("state"), Promotion.State.PUBLISHED), cb.lessThanOrEqualTo(root.get("endsAt"), now));
            else if (!"ALL".equals(state)) {
                result = cb.and(result, cb.equal(root.get("state"), Promotion.State.valueOf(state)));
                if ("PUBLISHED".equals(state)) result = cb.and(result, cb.or(cb.isNull(root.get("endsAt")), cb.greaterThan(root.get("endsAt"), now)));
            }
            return result;
        };
        return promotions.findAll(specification, PageRequests.bounded(page, size).withSort(Sort.by(Sort.Direction.DESC, "createdAt", "id")))
                .map(this::newsDto);
    }

    public StoreNewsDto.News own(Long memberId, Long id) {
        policy.requireEnabled(); business(reader(memberId));
        Promotion news = promotions.findById(id).orElseThrow(FeedException::missing); owner(news, memberId);
        if (news.getState() == Promotion.State.DELETED) throw FeedException.missing();
        return newsDto(news);
    }

    @Transactional
    public StoreNewsDto.News create(Long memberId, StoreNewsDto.Request request) {
        policy.requireEnabled(); Member member = feeds.activeWriter(memberId); business(member);
        var profile = feeds.mediaProfile(member); String requestId = requestId(request.clientRequestId());
        Optional<FeedPost> previous = posts.findByProfile_Member_IdAndClientRequestId(memberId, requestId);
        if (previous.isPresent()) {
            Promotion original = previous.get().getNewsPromotion();
            if (original == null) throw FeedException.invalid("작성 요청을 다시 열어주세요.");
            return newsDto(original);
        }
        Store store = ownedStore(request.storeId(), memberId);
        Values values = values(request, Promotion.BenefitDesign.STANDARD);
        Promotion news = Promotion.builder().member(member).store(store).title("").content("")
                .category(Promotion.PromotionCategory.ETC).state(Promotion.State.DRAFT).build();
        apply(news, values, request); promotions.saveAndFlush(news);
        FeedPost post = FeedPost.create(profile, requestId, StoreNewsPolicy.now());
        post.linkNews(news, region(store), StoreNewsPolicy.now()); posts.saveAndFlush(post);
        feeds.applyMedia(post, values.mediaIds(), memberId);
        applyBenefit(news, request, true, memberId); promotions.flush(); changed(news); return newsDto(news);
    }

    @Transactional
    public StoreNewsDto.News edit(Long memberId, Long id, StoreNewsDto.Request request) {
        policy.requireEnabled(); Member member = feeds.activeWriter(memberId); business(member); var profile = feeds.mediaProfile(member);
        Promotion news = lockedNews(memberId, id);
        boolean wasPublic = StoreNewsPolicy.publiclyVisible(news);
        if (!Objects.equals(request.storeId(), news.getStore().getId())) throw FeedException.invalid("등록한 소식의 가게는 바꿀 수 없어요.");
        if (news.getState() == Promotion.State.DELETED) throw FeedException.missing();
        if (news.getState() == Promotion.State.HIDDEN) throw new FeedException("숨겨진 소식은 수정할 수 없어요.", HttpStatus.CONFLICT);
        if (request.revision() == null || request.revision() != news.getRevision()) throw new FeedException("소식이 변경됐어요. 다시 불러온 뒤 수정해주세요.", HttpStatus.CONFLICT);
        if (news.getState() == Promotion.State.PUBLISHED && request.draft()) throw FeedException.invalid("게시한 소식은 임시저장으로 되돌릴 수 없어요.");
        Values values = values(request, news.getDesign());
        boolean changed = materialChanged(news, values);
        FeedPost post = FeedPost.linkedTo(news);
        if (post == null) {
            post = FeedPost.create(profile, null, StoreNewsPolicy.now());
            apply(news, values, request); post.linkNews(news, region(news.getStore()), StoreNewsPolicy.now()); posts.saveAndFlush(post);
        } else {
            entityManager.refresh(post, LockModeType.PESSIMISTIC_WRITE);
            apply(news, values, request); post.linkNews(news, region(news.getStore()), StoreNewsPolicy.now());
        }
        feeds.applyMedia(post, values.mediaIds(), memberId);
        applyBenefit(news, request, changed, memberId); posts.flush(); promotions.flush(); changed(news, wasPublic || StoreNewsPolicy.publiclyVisible(news)); return newsDto(news);
    }

    @Transactional
    public void delete(Long memberId, Long id) {
        policy.requireEnabled(); business(feeds.activeWriter(memberId));
        Promotion news = lockedNews(memberId, id);
        boolean wasPublic = StoreNewsPolicy.publiclyVisible(news);
        if (news.getNewsPost() != null) entityManager.refresh(news.getNewsPost(), LockModeType.PESSIMISTIC_WRITE);
        news.deleteNews(StoreNewsPolicy.now());
        changed(news, wasPublic);
    }

    private Promotion lockedNews(Long memberId, Long id) {
        Promotion candidate = promotions.findById(id).orElseThrow(FeedException::missing); owner(candidate, memberId);
        ownedStore(candidate.getStore().getId(), memberId);
        // 회원→가게→소식→피드→사진. 후보의 stale managed 상태를 잠금 아래 재검사한다.
        entityManager.refresh(candidate, LockModeType.PESSIMISTIC_WRITE); owner(candidate, memberId); return candidate;
    }

    private Store ownedStore(Long id, Long memberId) {
        if (id == null || id <= 0) throw FeedException.invalid("가게를 선택해주세요.");
        Store store = stores.findByIdForUpdate(id).orElseThrow(FeedException::missing);
        if (!Objects.equals(memberId, store.getOwner() == null ? null : store.getOwner().getId()) || !StoreNewsPolicy.usable(store)) {
            throw new FeedException("운영 중인 본인 가게의 소식만 작성·변경할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        return store;
    }

    private Member reader(Long id) {
        return members.findByIdAndDeletedAtIsNull(id).filter(StoreNewsPolicy::active)
                .orElseThrow(() -> new FeedException("현재 가게 소식을 사용할 수 없어요.", HttpStatus.FORBIDDEN));
    }
    private void business(Member member) {
        if (member.getRole() != Role.BUSINESS && member.getRole() != Role.ADMIN) throw new FeedException("사업자 본인의 가게 소식만 관리할 수 있어요.", HttpStatus.FORBIDDEN);
    }
    private void owner(Promotion news, Long id) { if (!Objects.equals(news.getMember().getId(), id)) throw FeedException.missing(); }

    private Values values(StoreNewsDto.Request request, Promotion.BenefitDesign fallback) {
        Promotion.NewsType type = type(request.newsType());
        String title = clean(request.title(), 200, "제목"), content = clean(request.content(), 2000, "내용");
        String conditions = clean(request.conditions(), 1000, "이용 조건");
        LocalDateTime start = utc(request.startsAt()), end = utc(request.endsAt());
        boolean periodType = type == Promotion.NewsType.EVENT || type == Promotion.NewsType.BENEFIT;
        if (!periodType && (start != null || end != null)) throw FeedException.invalid("행사·혜택에서만 기간을 지정할 수 있어요.");
        if (start != null && end != null && !start.isBefore(end)) throw FeedException.invalid("종료 시각은 시작 시각보다 뒤여야 해요.");
        if (!request.draft() && (title.isBlank() || content.isBlank())) throw FeedException.invalid("소식 제목과 내용을 입력해주세요.");
        if (!request.draft() && periodType && (start == null || end == null)) throw FeedException.invalid("행사·혜택의 시작과 종료 시각을 입력해주세요.");
        List<Long> ids = request.mediaIds() == null ? List.of() : request.mediaIds();
        if (ids.size() > FeedPolicy.MAX_IMAGES || ids.stream().anyMatch(id -> id == null || id <= 0) || new HashSet<>(ids).size() != ids.size()) throw FeedException.invalid("사진은 서로 다른 최대 6장까지 선택해주세요.");
        if (request.benefitRequested() && !request.draft() && ids.isEmpty()) throw FeedException.invalid("혜택 신청에는 사진을 1장 이상 첨부해주세요.");
        Promotion.BenefitDesign design = fallback == null ? Promotion.BenefitDesign.STANDARD : fallback;
        if (request.design() != null) {
            try { design = Promotion.BenefitDesign.valueOf(request.design()); }
            catch (IllegalArgumentException invalid) { throw FeedException.invalid("혜택 디자인을 다시 선택해주세요."); }
        }
        return new Values(title, content, type, start, end, conditions, ids, design);
    }

    private boolean materialChanged(Promotion news, Values values) {
        return !Objects.equals(news.getTitle(), values.title()) || !Objects.equals(news.getContent(), values.content())
                || news.getNewsType() != values.type() || !Objects.equals(news.getStartsAt(), values.start())
                || !Objects.equals(news.getEndsAt(), values.end()) || !Objects.equals(news.getConditions(), values.conditions())
                || !imageIds(news).equals(values.mediaIds()) || news.getDesign() != values.design();
    }

    private List<Long> imageIds(Promotion news) {
        return news.getNewsPost() == null ? List.of() : media.findByPost_IdOrderByPositionAscIdAsc(news.getNewsPost().getId())
                .stream().map(item -> item.getId()).toList();
    }

    private void applyBenefit(Promotion news, StoreNewsDto.Request request, boolean changed, Long actor) {
        Promotion.BenefitState previous = news.getBenefitState();
        if (!request.benefitRequested()) {
            if (previous != Promotion.BenefitState.NONE) {
                news.withdrawBenefit(); benefitAudit(actor, "BENEFIT_WITHDRAWN", news, "revision=" + news.getRevision());
            }
        } else if (request.draft()) news.requestBenefit(true, StoreNewsPolicy.now());
        else if (changed || previous != Promotion.BenefitState.APPROVED && previous != Promotion.BenefitState.PENDING) {
            if (previous == Promotion.BenefitState.APPROVED) benefitAudit(actor, "BENEFIT_EDIT_REVIEW", news, "revision=" + news.getRevision());
            news.requestBenefit(false, StoreNewsPolicy.now());
            benefitAudit(actor, "BENEFIT_SUBMITTED", news, "revision=" + news.getRevision());
        }
    }

    @Transactional
    public Page<StoreNewsDto.News> applications(Long admin, String state, int page, int size) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        if (!Set.of("ALL", "PENDING", "APPROVED", "REJECTED").contains(state)) throw FeedException.invalid("혜택 신청 상태를 다시 선택해주세요.");
        Specification<Promotion> filter = (root, query, cb) -> "ALL".equals(state)
                ? root.get("benefitState").in(Promotion.BenefitState.PENDING, Promotion.BenefitState.APPROVED, Promotion.BenefitState.REJECTED)
                : cb.equal(root.get("benefitState"), Promotion.BenefitState.valueOf(state));
        Page<StoreNewsDto.News> result = promotions.findAll(filter, PageRequests.bounded(page, size)
                .withSort(Sort.by(Sort.Direction.DESC, "benefitRequestedAt", "id"))).map(item -> newsDto(item, true));
        for (var item : result) audits.save(FeedAuditRecord.news(admin, "BENEFIT_LIST_READ", item.feedPostId(), item.id(), null, null, StoreNewsPolicy.now()));
        return result;
    }

    @Transactional
    public StoreNewsDto.News application(Long admin, Long id) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        Promotion news = promotions.findForRead(id).orElseThrow(FeedException::missing);
        if (news.getBenefitState() == Promotion.BenefitState.NONE || news.getBenefitState() == Promotion.BenefitState.DRAFT) throw FeedException.missing();
        benefitAudit(admin, "BENEFIT_READ", news, "revision=" + news.getRevision()); return newsDto(news, true);
    }

    @Transactional
    public StoreNewsDto.News reviewBenefit(Long admin, Long id, StoreNewsDto.BenefitReview request) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        if (request.approved() == null) throw FeedException.invalid("승인 또는 반려를 선택해주세요.");
        Promotion candidate = promotions.findById(id).orElseThrow(FeedException::missing);
        Long owner = candidate.getMember().getId(); business(feeds.activeWriter(owner));
        Promotion news = lockedNews(owner, id);
        if (request.revision() == null || request.revision() != news.getRevision()) {
            throw new FeedException("신청 내용이 변경됐어요. 최신 글·사진을 다시 검토해주세요.", HttpStatus.CONFLICT);
        }
        if (news.getBenefitState() != Promotion.BenefitState.PENDING || !StoreNewsPolicy.publicNews(news)) {
            throw new FeedException("현재 공개 가능한 심사 대기 소식만 처리할 수 있어요.", HttpStatus.CONFLICT);
        }
        FeedPost post = FeedPost.linkedTo(news);
        if (post == null) throw FeedException.invalid("신청 사진을 다시 확인해주세요.");
        entityManager.refresh(post, LockModeType.PESSIMISTIC_WRITE);
        if (!post.isPublished()) throw FeedException.missing();
        List<Long> ids = imageIds(news);
        if (ids.isEmpty() || ids.size() > FeedPolicy.MAX_IMAGES) throw FeedException.invalid("혜택 신청 사진은 1~6장이어야 해요.");
        // 사진을 다른 원문에 다시 붙이거나 정리하는 작업과도 같은 잠금을 사용한다.
        feeds.applyMedia(post, ids, owner);
        String note = clean(request.note(), 1000, "심사 사유");
        if (note.isBlank()) throw FeedException.invalid("심사 사유를 입력해주세요.");
        news.reviewBenefit(request.approved(), admin, note, StoreNewsPolicy.now()); news.setUpdatedAt(StoreNewsPolicy.now());
        benefitAudit(admin, request.approved() ? "BENEFIT_APPROVED" : "BENEFIT_REJECTED", news,
                "reviewedRevision=" + request.revision() + ", note=" + note);
        promotions.flush(); changed(news); return newsDto(news, true);
    }

    private void benefitAudit(Long actor, String action, Promotion news, String reason) {
        audits.save(FeedAuditRecord.news(actor, action, news.getNewsPost() == null ? null : news.getNewsPost().getId(),
                news.getId(), null, reason, StoreNewsPolicy.now()));
    }
    private void apply(Promotion news, Values values, StoreNewsDto.Request request) {
        if (news.getState() == Promotion.State.DRAFT && !request.draft()) news.setCreatedAt(StoreNewsPolicy.now());
        news.editNews(values.title(), values.content(), values.type(), values.start(), values.end(), values.conditions(), false, request.draft());
        news.setDesign(values.design());
        // 사진만 수정해도 revision이 변한다. 신고 이후 편집을 기존 원문으로 오인하지 않는다.
        news.setUpdatedAt(StoreNewsPolicy.now());
    }
    private StoreNewsDto.News newsDto(Promotion news) {
        return newsDto(news, false);
    }
    private StoreNewsDto.News newsDto(Promotion news, boolean adminView) {
        boolean deleted = news.getState() == Promotion.State.DELETED;
        Store store = news.getStore(); FeedPost post = FeedPost.linkedTo(news);
        List<FeedDto.Image> photos = deleted ? List.of() : images(news);
        if (adminView) photos = photos.stream().map(image -> new FeedDto.Image(image.id(),
                "/api/admin/promotions/" + news.getId() + "/images/" + image.id(), image.width(), image.height())).toList();
        return new StoreNewsDto.News(news.getId(), store.getId(), store.getName(), store.getAddress(), store.getCategory(), deleted ? null : store.getMainImageUrl(),
                deleted ? "삭제한 소식" : news.getTitle(), deleted ? "" : news.getContent(), news.getNewsType().name(),
                deleted ? null : StoreNewsPolicy.offset(news.getStartsAt()), deleted ? null : StoreNewsPolicy.offset(news.getEndsAt()), deleted ? null : news.getConditions(),
                deleted ? null : StoreNewsPolicy.period(news, StoreNewsPolicy.now()), false, news.getState().name(), news.getRevision(), adminView && post != null ? post.getId() : null,
                photos, StoreNewsPolicy.offset(news.getCreatedAt()), StoreNewsPolicy.offset(news.getUpdatedAt()), news.getBenefitState().name(),
                StoreNewsPolicy.offset(news.getBenefitRequestedAt()), StoreNewsPolicy.offset(news.getBenefitReviewedAt()), deleted ? null : news.getBenefitReviewNote(),
                news.getDesign() == null ? "STANDARD" : news.getDesign().name());
    }
    private List<FeedDto.Image> images(Promotion news) {
        if (news.getNewsPost() == null || news.getState() == Promotion.State.DELETED) return List.of();
        return media.findByPost_IdOrderByPositionAscIdAsc(news.getNewsPost().getId()).stream().map(image -> new FeedDto.Image(image.getId(),
                "/api/store-news/media/" + image.getId(), image.getWidth(), image.getHeight())).toList();
    }
    private String region(Store store) {
        String[] parts = kr.it.reserve.store.util.StoreRegionNames.addressParts(store.getAddress());
        if (parts.length == 0 || !FeedPolicy.REGIONS.contains(parts[0])) return null;
        return parts.length > 1 && parts[1].matches("[가-힣A-Za-z0-9·-]+") && parts[1].length() <= 40
                ? FeedPolicy.region(parts[0] + " " + parts[1]) : parts[0];
    }
    private static LocalDateTime utc(OffsetDateTime value) {
        if (value == null) return null;
        var utc = value.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        if (utc.getYear() < 2000 || utc.getYear() > 2100) throw FeedException.invalid("소식 기간을 다시 입력해주세요.");
        return utc;
    }
    private static String clean(String value, int limit, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > limit || normalized.codePoints().anyMatch(code -> Character.isISOControl(code) && code != '\n' && code != '\t')) throw FeedException.invalid(label + "을 다시 입력해주세요.");
        return normalized;
    }
    private static Promotion.NewsType type(String value) {
        try { return Promotion.NewsType.valueOf(value); }
        catch (IllegalArgumentException | NullPointerException exception) { throw FeedException.invalid("소식 종류를 다시 선택해주세요."); }
    }
    private String requestId(String value) {
        try {
            String normalized = UUID.fromString(value).toString();
            if (!normalized.equalsIgnoreCase(value)) throw FeedException.invalid("작성 요청을 다시 열어주세요."); return normalized;
        } catch (IllegalArgumentException | NullPointerException exception) { throw FeedException.invalid("작성 요청을 다시 열어주세요."); }
    }
    private void changed(Promotion news) { changed(news, StoreNewsPolicy.publiclyVisible(news)); }
    private void changed(Promotion news, boolean publicChanged) { if (changes != null) changes.changed(news.getId(), news.getMember().getId(), publicChanged); }
    private record Values(String title, String content, Promotion.NewsType type, LocalDateTime start, LocalDateTime end, String conditions,
                          List<Long> mediaIds, Promotion.BenefitDesign design) {}
}
