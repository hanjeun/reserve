package kr.it.reserve.inquiry.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.file.service.SupportMailPhotos;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.inquiry.dto.InquiryDto;
import kr.it.reserve.inquiry.service.InquiryService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/inquiries")
public class InquiryApiController {
    @PostMapping(value = "/preview", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<Map<String, String>> preview(
            @AuthenticationPrincipal Member member,
            @Valid @RequestBody InquiryDto.InquiryRequest request, HttpServletRequest httpRequest) {
        if (!rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.MAIL_PREVIEW)) {
            throw new InquiryException("미리보기 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return ApiResponse.success(Map.of("html", inquiryService.previewInquiry(member, request)), "메일 미리보기예요.");
    }

    private final InquiryService inquiryService;
    private final RateLimiter rateLimiter;

    // 관리자 권한 체크 공통 로직
    private Long validateAdmin() {
        Member member = SecurityUtil.getCurrentMember("인증 정보가 없어요.");
        if (member.getRole() != Role.ADMIN) {
            throw new InquiryException("관리자 권한이 필요한 서비스예요.", HttpStatus.FORBIDDEN);
        }
        return member.getId();
    }

    // 내 문의 목록 조회
    @GetMapping("/my")
    public ApiResponse<Page<InquiryDto.InquiryResponse>> getMyInquiries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        Page<InquiryDto.InquiryResponse> inquiries = inquiryService.getMyInquiries(memberId, page, size);
        return ApiResponse.success(inquiries, "내 문의 목록 조회 성공");
    }

    // 전체 문의 목록 조회 (관리자용)
    @GetMapping("/admin/all")
    public ApiResponse<Page<InquiryDto.InquiryResponse>> getAllInquiries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search) {
        validateAdmin();
        Page<InquiryDto.InquiryResponse> inquiries = inquiryService.getAllInquiries(page, size, search);
        return ApiResponse.success(inquiries, "전체 문의 목록 조회 성공");
    }

    // 문의 상세 조회 (사용자 본인)
    @GetMapping("/{inquiryId}")
    public ApiResponse<InquiryDto.InquiryResponse> getInquiry(@PathVariable Long inquiryId) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        InquiryDto.InquiryResponse inquiry = inquiryService.getInquiry(inquiryId, memberId);
        return ApiResponse.success(inquiry, "문의 상세 조회 성공");
    }

    // 문의 상세 조회 (관리자용)
    @GetMapping("/admin/{inquiryId}")
    public ApiResponse<InquiryDto.InquiryResponse> getInquiryForAdmin(@PathVariable Long inquiryId) {
        validateAdmin();
        InquiryDto.InquiryResponse inquiry = inquiryService.getInquiryForAdmin(inquiryId);
        return ApiResponse.success(inquiry, "관리자용 상세 조회 성공");
    }

    @GetMapping("/admin/{inquiryId}/photos")
    public ApiResponse<List<Long>> getPhotos(@PathVariable Long inquiryId) {
        validateAdmin();
        return ApiResponse.success(inquiryService.getPhotoIds(inquiryId), "첨부 사진을 불러왔어요.");
    }

    @GetMapping("/admin/{inquiryId}/photos/{photoId}")
    public ResponseEntity<byte[]> getPhoto(@PathVariable Long inquiryId, @PathVariable Long photoId) {
        validateAdmin();
        return inquiryService.getPhoto(inquiryId, photoId);
    }

    /** 비회원 문의는 연락처를 검증한다. 저장·알림 메일 요청량을 제한하고 거부 시 429를 반환한다. */
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<InquiryDto.InquiryResponse>> createInquiry(
            @Valid @RequestBody InquiryDto.InquiryRequest request,
            HttpServletRequest httpRequest) {
        return createInquiry(request, List.of(), httpRequest);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<InquiryDto.InquiryResponse>> createInquiryWithPhotos(
            @Valid @RequestPart("request") InquiryDto.InquiryRequest request,
            @RequestPart(value = "photos", required = false) List<MultipartFile> photos,
            HttpServletRequest httpRequest) {
        return createInquiry(request, photos, httpRequest);
    }

    private ResponseEntity<ApiResponse<InquiryDto.InquiryResponse>> createInquiry(
            InquiryDto.InquiryRequest request, List<MultipartFile> photos, HttpServletRequest httpRequest) {
        Long memberId = SecurityUtil.isLoggedIn() ? SecurityUtil.getCurrentMemberId() : null;
        if ((memberId != null && !rateLimiter.tryConsume(memberId.toString(), RateLimiter.Policy.INQUIRY_MEMBER_CREATE))
                || !rateLimiter.tryConsume(IpExtractor.extract(httpRequest), RateLimiter.Policy.INQUIRY_CREATE)) {
            return ResponseEntity.status(429)
                    .body(ApiResponse.error("문의가 너무 많아요. 잠시 후 다시 시도해주세요."));
        }
        InquiryDto.InquiryResponse response = inquiryService.createInquiry(memberId, request, SupportMailPhotos.validateUploads(photos));
        return ResponseEntity.ok(ApiResponse.success(response, "문의가 성공적으로 등록됐어요."));
    }

    // 문의 삭제 (사용자 본인)
    @DeleteMapping("/{inquiryId}")
    public ApiResponse<Void> deleteInquiry(@PathVariable Long inquiryId) {
        Long memberId = SecurityUtil.getCurrentMemberId();
        inquiryService.deleteInquiry(inquiryId, memberId);
        return ApiResponse.success(null, "문의가 삭제됐어요.");
    }

    // 답변 작성 (관리자 전용)
    @PostMapping("/{inquiryId}/answer")
    public ApiResponse<InquiryDto.InquiryResponse> answerInquiry(
            @PathVariable Long inquiryId,
            @Valid @RequestBody InquiryDto.AnswerRequest request) {
        validateAdmin();
        InquiryDto.InquiryResponse response = inquiryService.answerInquiry(inquiryId, request);
        return ApiResponse.success(response, "문의 답변이 등록됐어요.");
    }

    @PostMapping(value = "/admin/{inquiryId}/reply", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<InquiryDto.InquiryResponse> replyToInquiry(
            @PathVariable Long inquiryId, @Valid @RequestBody InquiryDto.AnswerRequest request) {
        return replyToInquiry(inquiryId, request, List.of());
    }

    @PostMapping(value = "/admin/{inquiryId}/reply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<InquiryDto.InquiryResponse> replyToInquiryWithPhotos(
            @PathVariable Long inquiryId, @Valid @RequestPart("request") InquiryDto.AnswerRequest request,
            @RequestPart(value = "photos", required = false) List<MultipartFile> photos) {
        return replyToInquiry(inquiryId, request, photos);
    }

    private ApiResponse<InquiryDto.InquiryResponse> replyToInquiry(
            Long inquiryId, InquiryDto.AnswerRequest request, List<MultipartFile> photos) {
        Long adminId = validateAdmin();
        InquiryDto.InquiryResponse response = inquiryService.replyToInquiry(adminId, inquiryId, request,
                SupportMailPhotos.validateUploads(photos));
        return ApiResponse.success(response, "문의 답변 메일을 보냈어요.");
    }

    // 문의 삭제 (관리자용)
    @DeleteMapping("/admin/{inquiryId}")
    public ApiResponse<Void> deleteInquiryAsAdmin(@PathVariable Long inquiryId) {
        validateAdmin();
        inquiryService.deleteInquiryAsAdmin(inquiryId);
        return ApiResponse.success(null, "휴지통으로 옮겼어요.");
    }

    // 미답변 문의 개수 (내 것)
    @GetMapping("/pending-count")
    public ApiResponse<Long> getPendingCount() {
        Long memberId = SecurityUtil.getCurrentMemberId();
        Long count = inquiryService.getPendingInquiryCount(memberId);
        return ApiResponse.success(count, "내 미답변 문의 개수 조회 성공");
    }
}
