package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.favorite.entity.Favorite;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.util.StoreRegionNames;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class FeedService {
    static final String PROFILE_IMAGE_DELETION_SOURCE = "FEED_PROFILE_IMAGE";
    private final FeedPolicy policy;
    private final FeedProfileRepository profiles;
    private final FeedPostRepository posts;
    private final FeedMediaRepository media;
    private final MemberRepository members;
    private final StoreRepository stores;
    private final PromotionRepository promotions;
    private final FileStorageService storage;
    private final FileDeletionOutboxService fileDeletions;
    @Autowired(required = false)
    private EntityUpdates updates;
    @PersistenceContext private EntityManager entityManager;

    public FeedDto.Profile myProfile(Long memberId) {
        policy.requireEnabled(); activeReader(memberId);
        return profiles.findByMember_Id(memberId).filter(profile -> !profile.isHidden() && profile.isConfigured()).map(this::profileDto).orElse(null);
    }

    @Transactional
    public FeedDto.Profile updateProfile(Long memberId, FeedDto.ProfileRequest request) {
        policy.requireEnabled(); Member member = activeWriter(memberId);
        String nickname = clean(request.nickname(), 30, "닉네임");
        if (nickname.isBlank() || nickname.contains("\n") || nickname.contains("\t")) throw FeedException.invalid("한 줄의 공개 닉네임을 입력해주세요.");
        String key = Normalizer.normalize(nickname, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        if (key.length() > 120) throw FeedException.invalid("다른 닉네임을 입력해주세요.");
        if (profiles.existsByNicknameKeyAndMember_IdNot(key, memberId)) {
            throw new FeedException("이미 사용 중인 닉네임이에요.", HttpStatus.CONFLICT);
        }
        FeedProfile profile = profiles.findByMember_Id(memberId).orElseGet(() -> FeedProfile.create(member, now()));
        if (profile.isHidden()) throw new FeedException("공개 프로필을 변경할 수 없어요.", HttpStatus.FORBIDDEN);
        FeedDto.AvatarSource source = requestedAvatar(profile, request);
        String previous = profile.getCustomAvatarKey();
        profile.update(nickname, key, clean(request.bio(), 160, "소개"), source == FeedDto.AvatarSource.ACCOUNT, now());
        profile.changeAvatar(source == FeedDto.AvatarSource.ACCOUNT, source == FeedDto.AvatarSource.CUSTOM ? previous : null, now());
        profiles.saveAndFlush(profile);
        if (!Objects.equals(previous, profile.getCustomAvatarKey())) deleteCustomAvatar(previous, memberId);
        profileChanged();
        return profileDto(profile);
    }

    @Transactional
    public FeedDto.Profile uploadProfileAvatar(Long memberId, MultipartFile image) {
        policy.requireEnabled(); activeWriter(memberId); FeedProfile profile = writableProfile(memberId);
        if (image == null || image.isEmpty()) throw FeedException.invalid("업로드할 프로필 사진을 선택해주세요.");
        String previous = profile.getCustomAvatarKey();
        String key = storage.storeFile(image, FileStoragePaths.feedProfile(memberId));
        if (key == null) throw FeedException.invalid("업로드할 프로필 사진을 선택해주세요.");
        profile.changeAvatar(false, key, now());
        profiles.saveAndFlush(profile);
        if (!Objects.equals(previous, key)) deleteCustomAvatar(previous, memberId);
        profileChanged();
        return profileDto(profile);
    }

    @Transactional
    public FeedDto.Profile deleteProfileAvatar(Long memberId) {
        policy.requireEnabled(); activeWriter(memberId); FeedProfile profile = writableProfile(memberId);
        String previous = profile.getCustomAvatarKey();
        profile.changeAvatar(false, null, now());
        profiles.saveAndFlush(profile);
        deleteCustomAvatar(previous, memberId);
        profileChanged();
        return profileDto(profile);
    }

    private FeedDto.AvatarSource requestedAvatar(FeedProfile profile, FeedDto.ProfileRequest request) {
        FeedDto.AvatarSource source = request.avatarSource();
        if (source == null && request.useAccountAvatar() != null) {
            source = request.useAccountAvatar() ? FeedDto.AvatarSource.ACCOUNT
                    : profile.getCustomAvatarKey() == null ? FeedDto.AvatarSource.NONE : FeedDto.AvatarSource.CUSTOM;
        }
        if (source == null) source = profile.isConfigured() ? avatarSource(profile) : FeedDto.AvatarSource.ACCOUNT;
        if (source == FeedDto.AvatarSource.CUSTOM && (profile.getCustomAvatarKey() == null
                || !storage.isManagedFileUnderPrefix(profile.getCustomAvatarKey(), FileStoragePaths.feedProfile(profile.getMember().getId())))) {
            throw FeedException.invalid("공개 프로필 사진을 먼저 업로드해주세요.");
        }
        return source;
    }

    private void deleteCustomAvatar(String key, Long memberId) {
        if (key != null && storage.isManagedFileUnderPrefix(key, FileStoragePaths.feedProfile(memberId))) {
            fileDeletions.enqueue(key, PROFILE_IMAGE_DELETION_SOURCE, memberId);
        }
    }

    public FeedDto.Profile publicProfile(String publicId) {
        policy.requireEnabled(); return profileDto(publicAuthor(publicId));
    }

    public Page<FeedDto.Post> publicPosts(int page, int size, String region, boolean favoriteOnly, Long viewer) {
        return publicPosts(page, size, region, favoriteOnly, viewer, "latest");
    }

    public Page<FeedDto.Post> publicPosts(int page, int size, String region, boolean favoriteOnly, Long viewer, String sort) {
        policy.requireEnabled(); String selectedRegion = FeedPolicy.region(region);
        if (!"latest".equals(sort) && !"popular".equals(sort)) throw FeedException.invalid("피드 정렬을 다시 선택해주세요.");
        if (favoriteOnly) {
            if (viewer == null) throw new FeedException("찜한 가게 소식은 로그인 후 볼 수 있어요.", HttpStatus.UNAUTHORIZED);
            activeReader(viewer);
        }
        var specification = publicSpecification(selectedRegion, null, favoriteOnly ? viewer : null);
        var bounds = PageRequests.bounded(page, size);
        if ("popular".equals(sort)) specification = specification.and(popularityOrder());
        else bounds = bounds.withSort(Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        return posts.findAll(specification, bounds)
                .map(post -> postDto(post, viewer));
    }

    static Specification<FeedPost> popularityOrder() {
        return (root, query, cb) -> {
            if (query != null && FeedPost.class.equals(query.getResultType())) {
                var count = query.subquery(Long.class);
                var like = count.from(ContentLike.class);
                count.select(cb.count(like)).where(cb.equal(like.get("post"), root));
                query.orderBy(cb.desc(count), cb.desc(root.get("createdAt")), cb.desc(root.get("id")));
            }
            return cb.conjunction();
        };
    }

    public List<FeedDto.RegionGroup> publicRegions() {
        policy.requireEnabled();
        var cb = entityManager.getCriteriaBuilder();
        var query = cb.createTupleQuery();
        var root = query.from(FeedPost.class);
        var store = root.join("store", JoinType.LEFT);
        // 일반 글의 연결 가게가 비공개가 되면 그 주소를 지역 집계에도 사용하지 않는다.
        var address = cb.<String>selectCase().when(visibleStore(store, cb, LocalDateTime.now(Clock.systemDefaultZone())),
                store.<String>get("address")).otherwise(cb.nullLiteral(String.class));
        var region = root.<String>get("region");
        query.multiselect(region.alias("region"), address.alias("address"), cb.count(root).alias("count"))
                .where(publicSpecification(null, null, null).toPredicate(root, query, cb)).groupBy(region, address);
        Map<String, Long> counts = new HashMap<>();
        Map<String, Map<String, Long>> areas = new HashMap<>();
        for (var row : entityManager.createQuery(query).getResultList()) {
            String selected = resolvedRegion(row.get("region", String.class), row.get("address", String.class));
            if (selected == null) continue;
            String[] parts = selected.split(" ");
            long count = row.get("count", Long.class);
            counts.merge(parts[0], count, Long::sum);
            if (parts.length == 2) areas.computeIfAbsent(parts[0], ignored -> new HashMap<>()).merge(parts[1], count, Long::sum);
        }
        return counts.entrySet().stream().map(group -> new FeedDto.RegionGroup(group.getKey(), group.getValue(),
                areas.getOrDefault(group.getKey(), Map.of()).entrySet().stream()
                        .map(area -> new FeedDto.RegionArea(area.getKey(), area.getValue()))
                        .sorted(Comparator.comparingLong(FeedDto.RegionArea::count).reversed().thenComparing(FeedDto.RegionArea::name)).toList()))
                .sorted(Comparator.comparingLong(FeedDto.RegionGroup::count).reversed().thenComparing(FeedDto.RegionGroup::name)).toList();
    }

    static String resolvedRegion(String explicitRegion, String publicAddress) {
        String selected;
        try { selected = FeedPolicy.region(explicitRegion); }
        catch (FeedException ignored) { return null; }
        String[] address = StoreRegionNames.addressParts(publicAddress);
        if (address.length == 0 || !FeedPolicy.REGIONS.contains(address[0])) return selected;
        if (selected != null && (selected.contains(" ") || !selected.equals(address[0]))) return selected;
        String derived = address[0];
        if (address.length > 1 && address[1].matches("[가-힣A-Za-z0-9·-]+") && derived.length() + address[1].length() + 1 <= 50) derived += " " + address[1];
        return derived;
    }

    public Page<FeedDto.Post> authorPosts(String publicId, int page, int size, Long viewer) {
        policy.requireEnabled(); FeedProfile profile = publicAuthor(publicId);
        return posts.findAll(publicSpecification(null, profile.getId(), null),
                PageRequests.bounded(page, size).withSort(Sort.by(Sort.Direction.DESC, "createdAt", "id")))
                .map(post -> postDto(post, viewer));
    }

    public Page<FeedDto.Post> myPosts(Long memberId, boolean drafts, int page, int size) {
        policy.requireEnabled(); activeReader(memberId);
        var pageable = PageRequests.bounded(page, size);
        return (drafts ? posts.findByProfile_Member_IdAndNewsPromotionIsNullAndStateOrderByCreatedAtDescIdDesc(memberId, FeedPost.State.DRAFT, pageable)
                : posts.findByProfile_Member_IdAndNewsPromotionIsNullAndStateNotOrderByCreatedAtDescIdDesc(memberId, FeedPost.State.DRAFT, pageable))
                .map(post -> postDto(post, memberId));
    }

    public FeedDto.Post readPost(Long id, Long viewer) {
        policy.requireEnabled(); FeedPost post = posts.findById(id).orElseThrow(FeedException::missing);
        if (post.getNewsPromotion() != null || post.getState() == FeedPost.State.DELETED) throw FeedException.missing();
        boolean mine = Objects.equals(viewer, post.getProfile().getMember().getId());
        boolean feedPublic = isPublic(post);
        if (!feedPublic && !(mine && readableMember(post.getProfile().getMember()) && !post.getProfile().isHidden())) {
            throw FeedException.missing();
        }
        return postDto(post, viewer);
    }

    @Transactional
    public FeedDto.Post create(Long memberId, FeedDto.PostRequest request) {
        policy.requireEnabled(); Member member = activeWriter(memberId); FeedProfile profile = writableProfile(memberId);
        String requestId = requestId(request.clientRequestId());
        if (requestId != null) {
            Optional<FeedPost> previous = posts.findByProfile_Member_IdAndClientRequestId(memberId, requestId);
            if (previous.isPresent()) {
                if (previous.get().getNewsPromotion() != null) throw FeedException.invalid("작성 요청을 다시 열어주세요.");
                return postDto(previous.get(), memberId);
            }
        }
        Links links = links(member, request); List<Long> ids = mediaIds(request);
        String content = content(request, ids);
        FeedPost post = FeedPost.create(profile, requestId, now());
        post.edit(content, FeedPolicy.region(request.region()), links.store(), links.promotion(), request.draft(), now());
        posts.saveAndFlush(post);
        applyMedia(post, ids, memberId);
        changed(post, false, EntityUpdates.Operation.CREATED);
        return postDto(post, memberId);
    }

    @Transactional
    public FeedDto.Post edit(Long memberId, Long id, FeedDto.PostRequest request) {
        policy.requireEnabled(); Member member = activeWriter(memberId); writableProfile(memberId);
        Links links = links(member, request);
        FeedPost post = posts.findForUpdate(id).orElseThrow(FeedException::missing);
        requireOwner(post, memberId);
        if (post.getNewsPromotion() != null) throw new FeedException("가게 소식 편집 화면에서 수정해주세요.", HttpStatus.CONFLICT);
        if (post.getState() == FeedPost.State.DELETED) throw FeedException.missing();
        if (post.getState() == FeedPost.State.HIDDEN) throw new FeedException("숨겨진 게시물은 수정할 수 없어요.", HttpStatus.CONFLICT);
        if (request.revision() == null || request.revision() != post.getRevision()) {
            throw new FeedException("게시물이 변경됐어요. 다시 불러온 뒤 수정해주세요.", HttpStatus.CONFLICT);
        }
        boolean wasPublic = isPublic(post);
        List<Long> ids = mediaIds(request);
        post.edit(content(request, ids), FeedPolicy.region(request.region()), links.store(), links.promotion(), request.draft(), now());
        applyMedia(post, ids, memberId); posts.flush();
        changed(post, wasPublic, EntityUpdates.Operation.UPDATED);
        return postDto(post, memberId);
    }

    @Transactional
    public void delete(Long memberId, Long id) {
        policy.requireEnabled(); activeWriter(memberId);
        if (posts.newsSourceId(id).isPresent()) throw FeedException.missing();
        FeedPost post = posts.findForUpdate(id).orElseThrow(FeedException::missing); requireOwner(post, memberId);
        if (post.getNewsPromotion() != null) throw FeedException.missing();
        if (post.getState() != FeedPost.State.DELETED) {
            boolean wasPublic = isPublic(post);
            post.delete(now());
            changed(post, wasPublic, EntityUpdates.Operation.DELETED);
        }
    }

    void changed(FeedPost post, boolean wasPublic, EntityUpdates.Operation operation) {
        if (updates == null) return;
        updates.publish(EntityUpdates.Domain.FEED, post.getId(), null,
                post.getStore() == null ? null : post.getStore().getId(), operation,
                wasPublic || isPublic(post), Set.of(post.getProfile().getMember().getId()), false);
    }

    private void profileChanged() {
        if (updates == null) return;
        for (var domain : List.of(EntityUpdates.Domain.FEED,
                EntityUpdates.Domain.COMMENT)) {
            updates.publish(domain, 0L, null, null, EntityUpdates.Operation.INVALIDATED,
                    true, Set.of(), false);
        }
    }
    public Member activeWriter(Long id) {
        Member member = members.findActiveByIdForUpdate(id).orElseThrow(() -> new FeedException("로그인이 필요해요.", HttpStatus.UNAUTHORIZED));
        if (!readableMember(member)) throw new FeedException("현재 글을 작성할 수 없어요.", HttpStatus.FORBIDDEN);
        return member;
    }

    public void requireAdmin(Long id) {
        Member member = members.findByIdAndDeletedAtIsNull(id).orElseThrow(() -> new FeedException("로그인이 필요해요.", HttpStatus.UNAUTHORIZED));
        if (!readableMember(member)) throw new FeedException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
        if (member.getRole() != Role.ADMIN) throw new FeedException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
    }

    public boolean isPublic(FeedPost post) {
        return post.getNewsPromotion() == null && post.getState() == FeedPost.State.PUBLISHED && post.getProfile().isConfigured()
                && !post.getProfile().isHidden() && readableMember(post.getProfile().getMember());
    }

    public FeedDto.Post postDto(FeedPost post, Long viewer) {
        Promotion news = post.getNewsPromotion();
        boolean deleted = post.getState() == FeedPost.State.DELETED || (news != null && news.getState() == Promotion.State.DELETED);
        Store store = deleted ? null : post.getStore();
        FeedDto.StoreLink storeLink = usableStore(store) ? new FeedDto.StoreLink(store.getId(), store.getName(),
                store.isReservationEnabled(), store.resolveWaitingIntakeMode() != WaitingIntakeMode.OFF) : null;
        List<FeedDto.Image> images = deleted ? List.of() : media.findByPost_IdOrderByPositionAscIdAsc(post.getId()).stream().map(this::imageDto).toList();
        return new FeedDto.Post(post.getId(), deleted ? "" : news == null ? post.getContent() : news.getContent(), deleted ? null : post.getRegion(),
                post.getCreatedAt().atOffset(ZoneOffset.UTC), post.getUpdatedAt().atOffset(ZoneOffset.UTC), post.getRevision(), post.getState().name(),
                Objects.equals(viewer, post.getProfile().getMember().getId()), profileDto(post.getProfile()), images, storeLink, null,
                deleted || news == null ? null : newsMetadata(news));
    }

    public FeedDto.News newsMetadata(Promotion news) {
        return new FeedDto.News(news.getId(), news.getTitle(), news.getNewsType().name(), StoreNewsPolicy.offset(news.getStartsAt()),
                StoreNewsPolicy.offset(news.getEndsAt()), news.getConditions(), StoreNewsPolicy.period(news, now()), false, news.getRevision());
    }

    public FeedDto.Post newsSnapshot(Promotion news) {
        Store store = news.getStore();
        FeedPost carrier = FeedPost.linkedTo(news);
        return new FeedDto.Post(carrier == null ? null : carrier.getId(), news.getContent(), null, StoreNewsPolicy.offset(news.getCreatedAt()), StoreNewsPolicy.offset(news.getUpdatedAt()),
                news.getRevision(), news.getState().name(), false, new FeedDto.Profile(null, store.getName(), "", null, false), List.of(),
                new FeedDto.StoreLink(store.getId(), store.getName(), store.isReservationEnabled(),
                        store.resolveWaitingIntakeMode() != WaitingIntakeMode.OFF), null, newsMetadata(news));
    }

    public FeedDto.Image imageDto(FeedMedia image) { return new FeedDto.Image(image.getId(), "/api/feed/media/" + image.getId(), image.getWidth(), image.getHeight()); }

    private FeedProfile publicAuthor(String publicId) {
        try { if (!UUID.fromString(publicId).toString().equalsIgnoreCase(publicId)) throw FeedException.missing(); }
        catch (IllegalArgumentException exception) { throw FeedException.missing(); }
        FeedProfile profile = profiles.findByPublicId(publicId.toLowerCase(Locale.ROOT)).orElseThrow(FeedException::missing);
        if (!profile.isConfigured() || profile.isHidden() || !readableMember(profile.getMember())) throw FeedException.missing(); return profile;
    }

    public FeedProfile writableProfile(Long id) {
        FeedProfile profile = profiles.findByMember_Id(id).orElseThrow(() -> FeedException.invalid("먼저 공개 닉네임을 설정해주세요."));
        if (!profile.isConfigured()) throw FeedException.invalid("먼저 공개 닉네임을 설정해주세요.");
        if (profile.isHidden()) throw new FeedException("공개 프로필을 사용할 수 없어요.", HttpStatus.FORBIDDEN); return profile;
    }

    public void activeReader(Long id) {
        Member member = members.findByIdAndDeletedAtIsNull(id).orElseThrow(() -> new FeedException("로그인이 필요해요.", HttpStatus.UNAUTHORIZED));
        if (!readableMember(member)) throw new FeedException("현재 피드를 사용할 수 없어요.", HttpStatus.FORBIDDEN);
    }

    static boolean readableMember(Member member) { return member != null && !member.isDeleted() && !member.isSuspended() && member.isTermsAgreed(); }
    private static boolean usableStore(Store store) { return store != null && !store.isDeleted() && !store.isSuspended() && readableMember(store.getOwner()); }
    private void requireOwner(FeedPost post, Long member) { if (!Objects.equals(post.getProfile().getMember().getId(), member)) throw FeedException.missing(); }

    private Links links(Member member, FeedDto.PostRequest request) {
        if (request.promotionId() != null) throw FeedException.invalid("피드와 혜택은 별도로 작성해주세요.");
        if (request.storeId() == null) {
            return new Links(null, null);
        }
        if (member.getRole() != Role.BUSINESS) throw new FeedException("사업자 본인의 가게만 연결할 수 있어요.", HttpStatus.FORBIDDEN);
        Store store = stores.findByIdForUpdate(request.storeId()).orElseThrow(FeedException::missing);
        if (!usableStore(store) || !Objects.equals(store.getOwner().getId(), member.getId())) {
            throw new FeedException("운영 중인 본인 가게만 연결할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        return new Links(store, null);
    }

    public FeedProfile mediaProfile(Member member) {
        return profiles.findByMember_Id(member.getId()).orElseGet(() -> profiles.saveAndFlush(FeedProfile.mediaOwner(member, now())));
    }

    private List<Long> mediaIds(FeedDto.PostRequest request) {
        List<Long> ids = request.mediaIds() == null ? List.of() : request.mediaIds();
        if (ids.size() > FeedPolicy.MAX_IMAGES || ids.stream().anyMatch(id -> id == null || id <= 0) || new HashSet<>(ids).size() != ids.size()) {
            throw FeedException.invalid("사진을 다시 선택해주세요. 최대 6장까지 첨부할 수 있어요.");
        }
        return ids;
    }

    private String content(FeedDto.PostRequest request, List<Long> ids) {
        String value = clean(request.content(), 2000, "내용");
        if (!request.draft() && value.isBlank() && ids.isEmpty()) throw FeedException.invalid("글이나 사진을 추가해주세요.");
        return value;
    }

    public void applyMedia(FeedPost post, List<Long> ids, Long owner) {
        // 동일 회원의 수정·파기는 회원 잠금에서 직렬화한다. 요청 순서와 잠금 순서는 분리한다.
        Map<Long, FeedMedia> locked = new HashMap<>();
        for (Long id : ids.stream().sorted().toList()) {
            FeedMedia item = media.findForUpdate(id).orElseThrow(() -> FeedException.invalid("첨부 사진을 찾을 수 없어요."));
            if (!Objects.equals(item.getMember().getId(), owner)
                    || item.getComment() != null || item.getOriginalCommentId() != null
                    || (item.getOriginalPostId() != null && !Objects.equals(item.getOriginalPostId(), post.getId()))
                    || (item.getPost() != null && !Objects.equals(item.getPost().getId(), post.getId()))) {
                throw FeedException.invalid("다른 게시물의 사진은 사용할 수 없어요.");
            }
            locked.put(id, item);
        }
        for (FeedMedia previous : media.findByPost_IdOrderByPositionAscIdAsc(post.getId())) if (!locked.containsKey(previous.getId())) previous.detach(now());
        for (int i = 0; i < ids.size(); i++) locked.get(ids.get(i)).attach(post, i);
        media.flush();
    }

    FeedDto.Profile profileDto(FeedProfile profile) {
        return new FeedDto.Profile(profile.getPublicId(), profile.getNickname(), profile.getBio(), avatar(profile),
                profile.isUseAccountAvatar(), avatarSource(profile));
    }

    private FeedDto.AvatarSource avatarSource(FeedProfile profile) {
        return profile.getCustomAvatarKey() != null ? FeedDto.AvatarSource.CUSTOM
                : profile.isUseAccountAvatar() ? FeedDto.AvatarSource.ACCOUNT : FeedDto.AvatarSource.NONE;
    }

    private String avatar(FeedProfile profile) {
        if (!profile.isConfigured() || profile.isHidden() || !readableMember(profile.getMember())) return null;
        if (profile.getCustomAvatarKey() != null) {
            return storage.isManagedFileUnderPrefix(profile.getCustomAvatarKey(), FileStoragePaths.feedProfile(profile.getMember().getId()))
                    ? storage.getPublicUrl(profile.getCustomAvatarKey()) : null;
        }
        if (!profile.isUseAccountAvatar()) return null;
        String candidate = profile.getMember().getProfileImage();
        if (candidate == null || candidate.isBlank()) return null;
        if (storage.isManagedFileUnderPrefix(candidate, FileStoragePaths.userProfile(profile.getMember().getId()))) {
            return candidate.startsWith("https://") ? candidate : storage.getPublicUrl(candidate);
        }
        try {
            URI uri = URI.create(candidate); String host = uri.getHost();
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                    && host != null && Set.of("lh3.googleusercontent.com", "lh4.googleusercontent.com", "lh5.googleusercontent.com", "lh6.googleusercontent.com", "k.kakaocdn.net", "phinf.pstatic.net").contains(host.toLowerCase(Locale.ROOT))) return candidate;
        } catch (IllegalArgumentException ignored) { /* 잘못된 계정 사진은 공개 프로필에서 제외한다. */ }
        return null;
    }

    /** 사진 조회나 조회수 변경 없이 같은 공개 조회 조건을 재사용한다. */
    public Specification<FeedPost> publicSearchSpecification() {
        policy.requireEnabled();
        return publicSpecification(null, null, null);
    }

    private Specification<FeedPost> publicSpecification(String region, Long author, Long favoriteMember) {
        // 기존 제재 기산일은 systemDefaultZone으로 저장한다. 새 피드 UTC 날짜와 섞지 않는다.
        LocalDateTime timestamp = LocalDateTime.now(Clock.systemDefaultZone());
        return (root, query, cb) -> {
            var profile = root.join("profile"); var member = profile.join("member");
            var active = cb.or(cb.equal(member.get("status"), MemberStatus.ACTIVE),
                    cb.and(cb.equal(member.get("status"), MemberStatus.SUSPENDED), cb.lessThan(member.get("suspendedUntil"), timestamp)));
            var predicate = cb.and(cb.equal(root.get("state"), FeedPost.State.PUBLISHED), cb.isFalse(profile.get("hidden")),
                    cb.isNull(member.get("deletedAt")), cb.isTrue(member.get("termsAgreed")), active);
            // 혜택 사진의 내부 저장 행은 공개 피드·지역 집계·작성자 목록에 포함하지 않는다.
            predicate = cb.and(predicate, cb.isNull(root.get("newsPromotion")), cb.notEqual(profile.get("nickname"), ""));
            if (region != null) {
                var selected = cb.or(cb.equal(root.get("region"), region), cb.like(root.get("region"), region + " %"));
                String[] parts = region.split(" ");
                // 게시물의 지역이 없거나 시도만 있으면 현재 공개 가능한 연결 가게의 주소를 사용한다.
                var linkedStore = root.join("store", JoinType.LEFT);
                var addresses = StoreRegionNames.variants(parts[0]).stream()
                        .map(name -> parts.length == 2 ? name + " " + parts[1] : name)
                        .map(prefix -> cb.or(cb.equal(linkedStore.get("address"), prefix), cb.like(linkedStore.get("address"), prefix + " %")))
                        .toArray(Predicate[]::new);
                var fallback = parts.length == 2 ? cb.or(cb.isNull(root.get("region")), cb.equal(root.get("region"), parts[0]))
                        : cb.isNull(root.get("region"));
                selected = cb.or(selected, cb.and(fallback, visibleStore(linkedStore, cb, timestamp), cb.or(addresses)));
                predicate = cb.and(predicate, selected);
            }
            if (author != null) predicate = cb.and(predicate, cb.equal(profile.get("id"), author));
            if (favoriteMember != null) {
                var store = root.join("store", JoinType.INNER); var storeOwner = store.join("owner");
                var favorite = query.subquery(Long.class); var item = favorite.from(Favorite.class);
                favorite.select(item.get("id")).where(cb.equal(item.get("member").get("id"), favoriteMember), cb.equal(item.get("store").get("id"), store.get("id")));
                var activeStore = cb.or(cb.equal(store.get("status"), StoreStatus.ACTIVE),
                        cb.and(cb.equal(store.get("status"), StoreStatus.SUSPENDED), cb.lessThan(store.get("suspendedUntil"), timestamp)));
                var activeOwner = cb.or(cb.equal(storeOwner.get("status"), MemberStatus.ACTIVE),
                        cb.and(cb.equal(storeOwner.get("status"), MemberStatus.SUSPENDED), cb.lessThan(storeOwner.get("suspendedUntil"), timestamp)));
                predicate = cb.and(predicate, cb.isNull(store.get("deletedAt")), activeStore, cb.isNull(storeOwner.get("deletedAt")),
                        cb.isTrue(storeOwner.get("termsAgreed")), activeOwner, cb.exists(favorite));
            }
            return predicate;
        };
    }

    private static Predicate visibleStore(From<?, ?> store, CriteriaBuilder cb, LocalDateTime timestamp) {
        var owner = store.join("owner", JoinType.LEFT);
        var activeStore = cb.or(cb.equal(store.get("status"), StoreStatus.ACTIVE),
                cb.and(cb.equal(store.get("status"), StoreStatus.SUSPENDED), cb.lessThan(store.get("suspendedUntil"), timestamp)));
        var activeOwner = cb.or(cb.equal(owner.get("status"), MemberStatus.ACTIVE),
                cb.and(cb.equal(owner.get("status"), MemberStatus.SUSPENDED), cb.lessThan(owner.get("suspendedUntil"), timestamp)));
        return cb.and(cb.isNotNull(store.get("id")), cb.isNull(store.get("deletedAt")), activeStore, cb.isNull(owner.get("deletedAt")),
                cb.isTrue(owner.get("termsAgreed")), activeOwner);
    }

    static String clean(String value, int max, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > max || normalized.codePoints().anyMatch(code -> Character.isISOControl(code) && code != '\n' && code != '\t')) {
            throw FeedException.invalid(label + "을 다시 입력해주세요.");
        }
        return normalized;
    }
    static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private String requestId(String value) {
        if (value == null) return null;
        try {
            String normalized = UUID.fromString(value).toString();
            if (!normalized.equalsIgnoreCase(value)) throw FeedException.invalid("작성 요청을 다시 열어주세요.");
            return normalized;
        } catch (IllegalArgumentException exception) { throw FeedException.invalid("작성 요청을 다시 열어주세요."); }
    }
    private record Links(Store store, Promotion promotion) {}
}
