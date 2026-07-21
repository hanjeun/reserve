package kr.it.reserve.notice.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.NoticeException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.notice.dto.NoticeDTO;
import kr.it.reserve.notice.dto.NoticeRequestDTO;
import kr.it.reserve.notice.service.NoticeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notices")
@RequiredArgsConstructor
public class NoticeApiController {

    private final NoticeService noticeService;

    // 관리자 권한 검증 공통 로직
    private void validateAdmin() {
        Member member = SecurityUtil.getCurrentMember("인증 정보가 없습니다.");
        if (member.getRole() != Role.ADMIN) {
            throw new NoticeException("관리자만 접근 가능한 서비스입니다.", HttpStatus.FORBIDDEN);
        }
    }

    @GetMapping
    public ApiResponse<List<NoticeDTO>> getAllNotices() {
        return ApiResponse.success(noticeService.getAllNotices(), "공지사항 목록 조회 성공");
    }

    @GetMapping("/{id}")
    public ApiResponse<NoticeDTO> getNotice(@PathVariable Long id) {
        return ApiResponse.success(noticeService.getNoticeById(id), "공지사항 상세 조회 성공");
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<NoticeDTO> createNotice(@RequestBody NoticeRequestDTO requestDTO) {
        validateAdmin();
        Member member = SecurityUtil.getCurrentMember();
        NoticeDTO notice = noticeService.createNotice(requestDTO, member.getEmail());
        return ApiResponse.success(notice, "공지사항이 성공적으로 등록되었습니다.");
    }

    @PutMapping("/{id}")
    public ApiResponse<NoticeDTO> updateNotice(@PathVariable Long id, @RequestBody NoticeRequestDTO requestDTO) {
        validateAdmin();
        Member member = SecurityUtil.getCurrentMember();
        NoticeDTO notice = noticeService.updateNotice(id, requestDTO, member.getEmail());
        return ApiResponse.success(notice, "공지사항이 수정되었습니다.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteNotice(@PathVariable Long id) {
        validateAdmin();
        Member member = SecurityUtil.getCurrentMember();
        noticeService.deleteNotice(id, member.getEmail());
        return ApiResponse.success(null, "공지사항이 삭제되었습니다.");
    }
}