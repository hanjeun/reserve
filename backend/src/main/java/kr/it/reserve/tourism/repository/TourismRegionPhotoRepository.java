package kr.it.reserve.tourism.repository;

import kr.it.reserve.tourism.entity.TourismRegionPhoto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TourismRegionPhotoRepository extends JpaRepository<TourismRegionPhoto, Long> {

    Optional<TourismRegionPhoto> findByRegionCode(String regionCode);

    List<TourismRegionPhoto> findAllByOrderByRegionCodeAsc();
}
