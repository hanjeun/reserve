package com.reserve.favorite.service;

import com.reserve.favorite.dto.FavoriteDto;
import com.reserve.favorite.entity.Favorite;
import com.reserve.favorite.repository.FavoriteRepository;
import com.reserve.global.error.FavoriteException;
import com.reserve.member.entity.Member;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final StoreRepository storeRepository;

    @Transactional
    public FavoriteDto.ToggleResponse toggleFavorite(Long storeId, Member member) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new FavoriteException("해당 가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        return favoriteRepository.findByMemberAndStore(member, store)
                .map(favorite -> {
                    favoriteRepository.delete(favorite);
                    log.info("찜 삭제: 회원={}, 가게={}", member.getEmail(), store.getName());
                    return createToggleResponse(false, store);
                })
                .orElseGet(() -> {
                    Favorite favorite = Favorite.builder()
                            .member(member)
                            .store(store)
                            .build();
                    favoriteRepository.save(favorite);
                    log.info("찜 추가: 회원={}, 가게={}", member.getEmail(), store.getName());
                    return createToggleResponse(true, store);
                });
    }

    public FavoriteDto.StatusResponse getFavoriteStatus(Long storeId, Member member) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new FavoriteException("해당 가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        boolean isFavorite = member != null && favoriteRepository.existsByMemberAndStore(member, store);
        long favoriteCount = favoriteRepository.countByStore(store);

        return FavoriteDto.StatusResponse.builder()
                .isFavorite(isFavorite)
                .favoriteCount(favoriteCount)
                .build();
    }

    public List<FavoriteDto.Response> getMyFavorites(Member member) {
        return favoriteRepository.findByMemberOrderByCreatedAtDesc(member)
                .stream()
                .map(FavoriteDto.Response::fromEntity)
                .collect(Collectors.toList());
    }

    private FavoriteDto.ToggleResponse createToggleResponse(boolean isFavorite, Store store) {
        return FavoriteDto.ToggleResponse.builder()
                .isFavorite(isFavorite)
                .favoriteCount(favoriteRepository.countByStore(store))
                .build();
    }
}