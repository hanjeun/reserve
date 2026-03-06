package com.reserve.favorite.repository;

import com.reserve.favorite.entity.Favorite;
import com.reserve.member.entity.Member;
import com.reserve.store.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {

    // 회원과 가게로 찜 여부 확인
    boolean existsByMemberAndStore(Member member, Store store);

    // 회원과 가게로 찜 찾기
    Optional<Favorite> findByMemberAndStore(Member member, Store store);

    // 회원의 모든 찜 목록 조회 - store fetch join으로 N+1 방지
    @Query("SELECT f FROM Favorite f JOIN FETCH f.store WHERE f.member = :member ORDER BY f.createdAt DESC")
    List<Favorite> findByMemberOrderByCreatedAtDesc(@Param("member") Member member);

    // 가게의 찜 개수 조회
    long countByStore(Store store);

    // 회원 ID와 가게 ID로 찜 여부 확인
    @Query("SELECT COUNT(f) > 0 FROM Favorite f WHERE f.member.id = :memberId AND f.store.id = :storeId")
    boolean existsByMemberIdAndStoreId(@Param("memberId") Long memberId, @Param("storeId") Long storeId);

    // 특정 가게의 모든 찜 삭제
    @Modifying
    @Query("DELETE FROM Favorite f WHERE f.store.id = :storeId")
    void deleteByStoreId(@Param("storeId") Long storeId);

    // 특정 회원의 모든 찜 삭제
    @Modifying
    @Query("DELETE FROM Favorite f WHERE f.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") Long memberId);
}
