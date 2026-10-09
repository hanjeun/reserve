package kr.it.reserve.promotion.service;

import kr.it.reserve.global.error.PromotionException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import kr.it.reserve.global.common.PageRequests;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PromotionService {

    private final PromotionRepository promotionRepository;
    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;

    public Page<PromotionDto.PublicPromotionSummaryResponse> getPublicPromotions(int page, int size) {
        return promotionRepository.findAllPublic(PageRequests.bounded(page, size))
                .map(PromotionDto.PublicPromotionSummaryResponse::fromEntity);
    }

    /** 공개 상세는 조회수·읽음·파일을 변경하지 않는 순수 읽기다. */
    public PromotionDto.PublicPromotionDetailResponse getPublicPromotion(Long promotionId) {
        return promotionRepository.findPublicById(promotionId)
                .map(PromotionDto.PublicPromotionDetailResponse::fromEntity)
                .orElseThrow(() -> new PromotionException("홍보글을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }

    // 전체 홍보글 조회 (향상된 switch 문 적용)
    public Page<PromotionDto.PromotionResponse> getAllPromotions(int page, int size, String sortBy) {
        Pageable pageable = PageRequests.bounded(page, size);

        Page<Promotion> promotions = switch (sortBy) {
            case "popular" -> promotionRepository.findAllByOrderByViewCountDesc(pageable);
            case "likes" -> promotionRepository.findAllByOrderByLikeCountDesc(pageable);
            default -> promotionRepository.findAllByOrderByCreatedAtDesc(pageable);
        };

        return promotions.map(PromotionDto.PromotionResponse::fromEntity);
    }

    // 홍보글 상세 조회
    @Transactional
    public PromotionDto.PromotionResponse getPromotion(Long promotionId) {
        if (promotionRepository.incrementViewCount(promotionId) == 0) {
            throw new PromotionException("홍보글을 찾을 수 없어요.", HttpStatus.NOT_FOUND);
        }
        Promotion promotion = findPromotionByIdOrThrow(promotionId);
        return PromotionDto.PromotionResponse.fromEntity(promotion);
    }

    // 홍보글 작성
    @Transactional
    public PromotionDto.PromotionResponse createPromotion(Long memberId, PromotionDto.PromotionRequest request) {
        Member member = findActiveMemberForUpdateOrThrow(memberId);

        // 권한 확인
        if (member.getRole() != Role.BUSINESS && member.getRole() != Role.ADMIN) {
            throw new PromotionException("사업자 또는 관리자만 홍보글을 작성할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        Store store = findOwnedOperatingStoreForUpdateOrThrow(request.getStoreId(), memberId);

        Promotion promotion = Promotion.builder()
                .member(member)
                .store(store)
                .title(request.getTitle())
                .content(request.getContent())
                .category(Promotion.PromotionCategory.valueOf(request.getCategory()))
                .imageUrl(request.getImageUrl())
                .specialMenu(request.getSpecialMenu())
                .storyHistory(request.getStoryHistory())
                .tags(request.getTags())
                .build();

        return PromotionDto.PromotionResponse.fromEntity(promotionRepository.save(promotion));
    }

    // 홍보글 수정
    @Transactional
    public PromotionDto.PromotionResponse updatePromotion(Long promotionId, Long memberId, PromotionDto.PromotionRequest request) {
        Promotion promotion = findWritablePromotionOrThrow(promotionId, memberId);

        promotion.setTitle(request.getTitle());
        promotion.setContent(request.getContent());
        promotion.setCategory(Promotion.PromotionCategory.valueOf(request.getCategory()));
        promotion.setImageUrl(request.getImageUrl());
        promotion.setSpecialMenu(request.getSpecialMenu());
        promotion.setStoryHistory(request.getStoryHistory());
        promotion.setTags(request.getTags());

        return PromotionDto.PromotionResponse.fromEntity(promotion);
    }

    // 홍보글 삭제
    @Transactional
    public void deletePromotion(Long promotionId, Long memberId) {
        Promotion promotion = findWritablePromotionOrThrow(promotionId, memberId);

        promotionRepository.delete(promotion);
    }

    // 내 가게 목록 조회
    public List<PromotionDto.StoreSimpleResponse> getMyStores(Long memberId) {
        return storeRepository.findByOwnerId(memberId).stream()
                .map(store -> PromotionDto.StoreSimpleResponse.builder()
                        .id(store.getId())
                        .name(store.getName())
                        .category(store.getCategory())
                        .address(store.getAddress())
                        .phone(store.getPhone())
                        .mainImageUrl(store.getMainImageUrl())
                        .build())
                .toList();
    }

    // 내 홍보글 목록 조회
    public Page<PromotionDto.PromotionResponse> getMyPromotions(Long memberId, int page, int size) {
        return promotionRepository.findByMemberIdOrderByCreatedAtDesc(memberId, PageRequests.bounded(page, size))
                .map(PromotionDto.PromotionResponse::fromEntity);
    }

    // 공통 도우미 메서드
    private Member findActiveMemberForUpdateOrThrow(Long memberId) {
        Member member = memberRepository.findActiveByIdForUpdate(memberId)
                .orElseThrow(() -> new PromotionException("회원을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (member.isDeleted()) {
            throw new PromotionException("회원을 찾을 수 없어요.", HttpStatus.NOT_FOUND);
        }
        if (member.isSuspended()) {
            throw new PromotionException("현재 이용이 제한된 회원은 홍보글을 변경할 수 없어요.", HttpStatus.FORBIDDEN);
        }
        return member;
    }

    private Store findOwnedOperatingStoreForUpdateOrThrow(Long storeId, Long memberId) {
        Store store = storeRepository.findByIdForUpdate(storeId)
                .orElseThrow(() -> new PromotionException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (store.isDeleted() || store.isSuspended()) {
            throw new PromotionException("현재 운영 중인 가게의 홍보글만 작성·변경할 수 있어요.", HttpStatus.CONFLICT);
        }
        if (store.getOwner() == null || !memberId.equals(store.getOwner().getId())) {
            throw new PromotionException("본인 소유 가게의 홍보글만 작성·변경할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        return store;
    }

    private Promotion findWritablePromotionOrThrow(Long promotionId, Long memberId) {
        // 탈퇴(회원 → 홍보 삭제), 폐업(가게 → 홍보 삭제)과 역순 잠금을 만들지 않는다.
        // 등록과 동일하게 회원 → 가게를 잠그고, 작성자 제한은 소유권과 별도로 유지한다.
        findActiveMemberForUpdateOrThrow(memberId);
        Promotion promotion = findPromotionByIdOrThrow(promotionId);
        if (!memberId.equals(promotion.getMember().getId())) {
            throw new PromotionException("본인의 홍보글만 변경할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        // 요청의 storeId가 아닌 기존 연결 가게의 최신 상태·소유권을 잠금 아래 재검사한다.
        findOwnedOperatingStoreForUpdateOrThrow(promotion.getStore().getId(), memberId);
        return promotion;
    }

    private Promotion findPromotionByIdOrThrow(Long id) {
        return promotionRepository.findById(id)
                .orElseThrow(() -> new PromotionException("홍보글을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
    }
}
