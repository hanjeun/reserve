package com.reserve.notice.service;

import com.reserve.global.error.NoticeException;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.notice.dto.NoticeDTO;
import com.reserve.notice.dto.NoticeRequestDTO;
import com.reserve.notice.entity.Notice;
import com.reserve.notice.repository.NoticeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NoticeService {

    private final NoticeRepository noticeRepository;
    private final MemberRepository memberRepository;

    // 모든 공지사항 조회 (중요 공지 우선 순위)
    public List<NoticeDTO> getAllNotices() {
        return noticeRepository.findAllOrderByImportantAndCreatedAt()
                .stream()
                .map(NoticeDTO::fromEntity)
                .collect(Collectors.toList());
    }

    // 공지사항 상세 조회 (조회수 증가 포함)
    @Transactional
    public NoticeDTO getNoticeById(Long id) {
        Notice notice = findNoticeOrThrow(id);
        notice.incrementViewCount();
        return NoticeDTO.fromEntity(notice);
    }

    // 공지사항 작성
    @Transactional
    public NoticeDTO createNotice(NoticeRequestDTO requestDTO, String email) {
        Member author = findMemberByEmailOrThrow(email);

        Notice notice = Notice.builder()
                .author(author)
                .title(requestDTO.getTitle())
                .content(requestDTO.getContent())
                .isImportant(requestDTO.getIsImportant() != null && requestDTO.getIsImportant())
                .build();

        return NoticeDTO.fromEntity(noticeRepository.save(notice));
    }

    // 공지사항 수정
    @Transactional
    public NoticeDTO updateNotice(Long id, NoticeRequestDTO requestDTO, String email) {
        // 수정 시 작성자 정보를 찾을 필요가 있다면 사용 (현재는 단순 관리자 확인용)
        findMemberByEmailOrThrow(email);

        Notice notice = findNoticeOrThrow(id);

        notice.setTitle(requestDTO.getTitle());
        notice.setContent(requestDTO.getContent());
        if (requestDTO.getIsImportant() != null) {
            notice.setIsImportant(requestDTO.getIsImportant());
        }

        return NoticeDTO.fromEntity(notice);
    }

    // 공지사항 삭제
    @Transactional
    public void deleteNotice(Long id, String email) {
        findMemberByEmailOrThrow(email);
        Notice notice = findNoticeOrThrow(id);
        noticeRepository.delete(notice);
    }

    // --- 공통 내부 유틸 메서드 ---

    private Notice findNoticeOrThrow(Long id) {
        return noticeRepository.findById(id)
                .orElseThrow(() -> new NoticeException("존재하지 않는 공지사항입니다.", HttpStatus.NOT_FOUND));
    }

    private Member findMemberByEmailOrThrow(String email) {
        return memberRepository.findByEmail(email)
                .orElseThrow(() -> new NoticeException("사용자 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }
}