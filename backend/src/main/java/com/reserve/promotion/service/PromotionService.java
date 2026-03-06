package com.reserve.promotion.service;

import com.reserve.global.error.PromotionException;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import com.reserve.member.repository.MemberRepository;
import com.reserve.promotion.dto.PromotionDto;
import com.reserve.promotion.entity.Promotion;
import com.reserve.promotion.repository.PromotionRepository;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PromotionService {

    private final PromotionRepository promotionRepository;
    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;

    // 전체 홍보글 조회 (향상된 switch 문 적용)
    public Page<PromotionDto.PromotionResponse> getAllPromotions(int page, int size, String sortBy) {
        Pageable pageable = PageRequest.of(page, size);

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
        Promotion promotion = findPromotionByIdOrThrow(promotionId);
        promotion.increaseViewCount();
        return PromotionDto.PromotionResponse.fromEntity(promotion);
    }

    // 홍보글 작성
    @Transactional
    public PromotionDto.PromotionResponse createPromotion(Long memberId, PromotionDto.PromotionRequest request) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new PromotionException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 권한 확인
        if (member.getRole() != Role.BUSINESS && member.getRole() != Role.ADMIN) {
            throw new PromotionException("사업자 또는 관리자만 홍보글을 작성할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        Store store = storeRepository.findById(request.getStoreId())
                .orElseThrow(() -> new PromotionException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 소유권 확인
        if (!store.getOwner().getId().equals(memberId)) {
            throw new PromotionException("본인이 등록한 가게만 홍보할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

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
        Promotion promotion = findPromotionByIdOrThrow(promotionId);

        if (!promotion.getMember().getId().equals(memberId)) {
            throw new PromotionException("본인의 홍보글만 수정할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

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
        Promotion promotion = findPromotionByIdOrThrow(promotionId);

        if (!promotion.getMember().getId().equals(memberId)) {
            throw new PromotionException("본인의 홍보글만 삭제할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

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
                .collect(Collectors.toList());
    }

    // 내 홍보글 목록 조회
    public Page<PromotionDto.PromotionResponse> getMyPromotions(Long memberId, int page, int size) {
        return promotionRepository.findByMemberIdOrderByCreatedAtDesc(memberId, PageRequest.of(page, size))
                .map(PromotionDto.PromotionResponse::fromEntity);
    }

    // 공통 도우미 메서드
    private Promotion findPromotionByIdOrThrow(Long id) {
        return promotionRepository.findById(id)
                .orElseThrow(() -> new PromotionException("홍보글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }
}