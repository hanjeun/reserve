package kr.it.reserve.inquiry.service;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.file.service.SupportMailPhotos;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.global.trash.ReceivedInquiryTrash;
import kr.it.reserve.inquiry.dto.InquiryDto;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.mailbox.service.AdminMailService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InquiryService {

    private final InquiryRepository inquiryRepository;
    private final MemberRepository memberRepository;
    private final EmailService emailService;
    private final AdminMailService adminMailService;
    private final ApplicationEventPublisher events;
    private final SupportMailPhotos mailPhotos;

    // 공통 페이징 생성 유틸
    private Pageable getPageable(int page, int size) {
        return PageRequests.bounded(page, size).withSort(Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    public Page<InquiryDto.InquiryResponse> getMyInquiries(Long memberId, int page, int size) {
        return inquiryRepository.findByMemberIdOrderByCreatedAtDesc(memberId, getPageable(page, size))
                .map(InquiryDto.InquiryResponse::fromEntity);
    }

    public Page<InquiryDto.InquiryResponse> getAllInquiries(int page, int size, String search) {
        Pageable pageable = getPageable(page, size);
        String keyword = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
        if (keyword.isEmpty()) {
            return inquiryRepository.findAllByOrderByCreatedAtDesc(pageable).map(InquiryDto.InquiryResponse::fromEntity);
        }
        if (keyword.length() > 100) {
            throw new InquiryException("검색어는 100자까지 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        String pattern = "%" + keyword.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return inquiryRepository.searchForAdmin(pattern, pageable).map(InquiryDto.InquiryResponse::fromEntity);
    }

    public InquiryDto.InquiryResponse getInquiry(Long inquiryId, Long memberId) {
        Inquiry inquiry = findById(inquiryId);
        if (inquiry.getMember() == null || !inquiry.getMember().getId().equals(memberId)) {
            throw new InquiryException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
        }
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    public InquiryDto.InquiryResponse getInquiryForAdmin(Long inquiryId) {
        return InquiryDto.InquiryResponse.fromEntity(findById(inquiryId));
    }

    public List<Long> getPhotoIds(Long inquiryId) {
        findById(inquiryId);
        return mailPhotos.inquiryIds(inquiryId);
    }

    public ResponseEntity<byte[]> getPhoto(Long inquiryId, Long photoId) {
        findById(inquiryId);
        return mailPhotos.inquiryPhoto(inquiryId, photoId);
    }

    @Transactional
    public void saveInbound(Inquiry inquiry, List<ValidatedImage> photos) {
        Inquiry saved = inquiryRepository.saveAndFlush(inquiry);
        mailPhotos.saveInquiry(saved.getId(), photos);
    }

    @Transactional
    public InquiryDto.InquiryResponse createInquiry(Long memberId, InquiryDto.InquiryRequest request, List<ValidatedImage> photos) {
        Inquiry.InquiryCategory category;
        try {
            category = Inquiry.InquiryCategory.valueOf(request.getCategory());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InquiryException("올바르지 않은 문의 유형이에요.", HttpStatus.BAD_REQUEST);
        }
        if (request.getTitle() == null || request.getTitle().isBlank()) {
            throw new InquiryException("제목을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (request.getContent() == null || request.getContent().isBlank()) {
            throw new InquiryException("내용을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        Inquiry.InquiryBuilder builder = Inquiry.builder()
                .category(category)
                .title(request.getTitle())
                .content(request.getContent())
                .status(Inquiry.InquiryStatus.PENDING);

        String notifierName;
        String notifierEmail;

        if (memberId != null) {
            Member member = memberRepository.findActiveByIdForUpdate(memberId)
                    .orElseThrow(() -> new InquiryException("회원을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
            builder.member(member);
            notifierName = member.getName();
            notifierEmail = member.getEmail();
        } else {
            if (request.getGuestName() == null || request.getGuestName().isBlank()) {
                throw new InquiryException("이름을 입력해주세요.", HttpStatus.BAD_REQUEST);
            }
            if (request.getGuestEmail() == null || request.getGuestEmail().isBlank()) {
                throw new InquiryException("이메일을 입력해주세요.", HttpStatus.BAD_REQUEST);
            }
            builder.guestName(request.getGuestName()).guestEmail(request.getGuestEmail());
            notifierName = request.getGuestName() + " (비회원)";
            notifierEmail = request.getGuestEmail();
        }

        Inquiry saved = inquiryRepository.save(builder.build());
        mailPhotos.saveInquiry(saved.getId(), photos);

        emailService.sendNewInquiryAlert(
                notifierName,
                notifierEmail,
                saved.getCategory().getDisplayName(),
                saved.getTitle(),
                saved.getContent(), photos
        );

        return InquiryDto.InquiryResponse.fromEntity(saved);
    }

    public String previewInquiry(Member member, InquiryDto.InquiryRequest request) {
        Inquiry.InquiryCategory category;
        try {
            category = Inquiry.InquiryCategory.valueOf(request.getCategory());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InquiryException("올바르지 않은 문의 유형이에요.", HttpStatus.BAD_REQUEST);
        }
        if (member == null && (request.getGuestName() == null || request.getGuestName().isBlank()
                || request.getGuestEmail() == null || request.getGuestEmail().isBlank())) {
            throw new InquiryException("이름과 회신 이메일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }
        return emailService.buildInquiryAlertContent(member == null ? request.getGuestName() + " (비회원)" : member.getName(),
                member == null ? request.getGuestEmail() : member.getEmail(), category.getDisplayName(),
                request.getTitle(), request.getContent());
    }

    @Transactional
    public void deleteInquiry(Long inquiryId, Long memberId) {
        Inquiry inquiry = findForUpdate(inquiryId);

        // 권한 및 상태 체크 (최소한의 방어)
        if (inquiry.getMember() == null || !inquiry.getMember().getId().equals(memberId)) throw new InquiryException("삭제 권한이 없어요.", HttpStatus.FORBIDDEN);
        if (inquiry.getStatus() == Inquiry.InquiryStatus.ANSWERED) throw new InquiryException("답변 완료된 문의는 삭제할 수 없어요.", HttpStatus.BAD_REQUEST);

        inquiryRepository.delete(inquiry);
    }

    @Transactional
    public InquiryDto.InquiryResponse answerInquiry(Long inquiryId, InquiryDto.AnswerRequest request) {
        Inquiry inquiry = findForUpdate(inquiryId);
        if (inquiry.isInboundEmail()) {
            throw new InquiryException("이메일 문의는 메일함에서 답변해주세요.", HttpStatus.BAD_REQUEST);
        }
        inquiry.answer(request.getAnswer());
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    @Transactional
    public InquiryDto.InquiryResponse replyToInquiry(Long adminId, Long inquiryId, InquiryDto.AnswerRequest request,
            List<ValidatedImage> photos) {
        Inquiry inquiry = findForUpdate(inquiryId);
        String answer = request.getAnswer().strip();
        if (inquiry.getStatus() == Inquiry.InquiryStatus.ANSWERED) {
            throw new InquiryException("이미 답변이 등록된 문의예요.", HttpStatus.CONFLICT);
        }
        String email = inquiry.getMember() == null ? inquiry.getGuestEmail() : inquiry.getMember().getEmail();
        if (email == null || email.isBlank()) {
            throw new InquiryException("회신할 이메일을 확인할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        adminMailService.sendInquiryReply(adminId, email, inquiry.replySubject(), answer, inquiry.isInboundEmail(),
                inquiry.getInboundMessageId(), photos);
        inquiry.answer(answer);
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    @Transactional
    public void deleteInquiryAsAdmin(Long inquiryId) {
        Inquiry inquiry = inquiryRepository.findByIdForUpdate(inquiryId).orElseThrow(InquiryService::notFound);
        if (inquiry.isDeleted()) return;
        inquiry.setDeletedAt(LocalDateTime.now(Clock.systemDefaultZone()));
        events.publishEvent(new ReceivedInquiryTrash.Moved(inquiryId, inquiry.getTitle()));
    }

    public Long getPendingInquiryCount(Long memberId) {
        return inquiryRepository.countByMemberIdAndStatusAndDeletedAtIsNull(memberId, Inquiry.InquiryStatus.PENDING);
    }

    public Long getTotalPendingInquiryCount() {
        return inquiryRepository.countByStatusAndDeletedAtIsNull(Inquiry.InquiryStatus.PENDING);
    }

    // 내부 조회용
    private Inquiry findById(Long id) {
        return inquiryRepository.findById(id)
                .filter(inquiry -> !inquiry.isDeleted()).orElseThrow(InquiryService::notFound);
    }

    private Inquiry findForUpdate(Long id) {
        return inquiryRepository.findByIdForUpdate(id)
                .filter(inquiry -> !inquiry.isDeleted()).orElseThrow(InquiryService::notFound);
    }

    private static InquiryException notFound() {
        return new InquiryException("존재하지 않는 문의예요.", HttpStatus.NOT_FOUND);
    }
}
