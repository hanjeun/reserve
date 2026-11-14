package kr.it.reserve.file.repository;

import kr.it.reserve.file.entity.SupportMailPhoto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SupportMailPhotoRepository extends JpaRepository<SupportMailPhoto, Long> {
    @Query("SELECT p.id FROM SupportMailPhoto p WHERE p.inquiryId = :id ORDER BY p.id")
    List<Long> findInquiryPhotoIds(Long id);

    @Query("SELECT p.id FROM SupportMailPhoto p WHERE p.sentMailId = :id ORDER BY p.id")
    List<Long> findSentPhotoIds(Long id);

    Optional<SupportMailPhoto> findByIdAndInquiryId(Long id, Long inquiryId);
    Optional<SupportMailPhoto> findByIdAndSentMailId(Long id, Long sentMailId);
}
