package com.reserve.store.repository;

import com.reserve.member.entity.Member;
import com.reserve.store.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StoreRepository extends JpaRepository<Store, Long> {
    
    /**
     * 특정 회원이 등록한 가게 목록 조회
     */
    List<Store> findByOwnerOrderByCreatedAtDesc(Member owner);
    
    /**
     * 특정 회원 ID로 가게 목록 조회
     */
    List<Store> findByOwnerId(Long ownerId);
    
    /**
     * 가게 이름으로 검색 (부분 일치)
     */
    List<Store> findByNameContainingIgnoreCase(String keyword);
    
    /**
     * 카테고리로 검색
     */
    List<Store> findByCategory(String category);
    
    /**
     * 가게 이름, 설명, 주소, 카테고리, 키워드에서 검색 (키워드 포함)
     */
    @Query("SELECT s FROM Store s WHERE " +
           "LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    List<Store> searchStores(@Param("keyword") String keyword);
    
    /**
     * 평점 순으로 정렬하여 조회
     */
    List<Store> findAllByOrderByRatingDesc();
    
    /**
     * 리뷰 많은 순으로 정렬하여 조회
     */
    List<Store> findAllByOrderByReviewCountDesc();
    
    /**
     * 최근 등록순으로 정렬하여 조회
     */
    List<Store> findAllByOrderByCreatedAtDesc();
}
