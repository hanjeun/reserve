package kr.it.reserve.notice.controller;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.NoticeException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.notice.dto.NoticeDTO;
import kr.it.reserve.notice.dto.NoticeRequestDTO;
import kr.it.reserve.notice.dto.NoticeSummaryDTO;
import kr.it.reserve.notice.service.NoticeService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.IpExtractor;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notices")
@RequiredArgsConstructor
public class NoticeApiController {

    private final NoticeService noticeService;
    private final RateLimiter rateLimiter;

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

    @GetMapping("/highlights")
    public ApiResponse<List<NoticeSummaryDTO>> getHighlights(
            @RequestParam(defaultValue = "3") int limit) {
        return ApiResponse.success(noticeService.getHighlights(limit), "홈 공지 조회 성공");
    }

    @GetMapping("/{id}")
    public ApiResponse<NoticeDTO> getNotice(@PathVariable Long id) {
        return ApiResponse.success(noticeService.getNoticeById(id), "공지사항 상세 조회 성공");
    }

    /** 공개 표시 지표일 뿐이다. 제한 초과·없는 공지는 정보 노출 없는 no-op이다. */
    @PostMapping("/{id}/view")
    public ApiResponse<Void> recordView(@PathVariable Long id, HttpServletRequest request) {
        if (id > 0 && rateLimiter.tryConsume("notice-view:" + IpExtractor.extract(request), RateLimiter.Policy.AD_METRIC)) {
            noticeService.recordView(id);
        }
        return ApiResponse.success(null, "조회 처리 완료");
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
