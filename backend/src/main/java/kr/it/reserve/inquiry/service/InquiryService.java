package kr.it.reserve.inquiry.service;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.inquiry.dto.InquiryDto;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InquiryService {

    private final InquiryRepository inquiryRepository;
    private final MemberRepository memberRepository;
    private final EmailService emailService;

    // 공통 페이징 생성 유틸
    private Pageable getPageable(int page, int size) {
        return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    public Page<InquiryDto.InquiryResponse> getMyInquiries(Long memberId, int page, int size) {
        return inquiryRepository.findByMemberIdOrderByCreatedAtDesc(memberId, getPageable(page, size))
                .map(InquiryDto.InquiryResponse::fromEntity);
    }

    public Page<InquiryDto.InquiryResponse> getAllInquiries(int page, int size) {
        return inquiryRepository.findAllByOrderByCreatedAtDesc(getPageable(page, size))
                .map(InquiryDto.InquiryResponse::fromEntity);
    }

    public InquiryDto.InquiryResponse getInquiry(Long inquiryId, Long memberId) {
        Inquiry inquiry = findById(inquiryId);
        if (inquiry.getMember() == null || !inquiry.getMember().getId().equals(memberId)) {
            throw new InquiryException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    public InquiryDto.InquiryResponse getInquiryForAdmin(Long inquiryId) {
        return InquiryDto.InquiryResponse.fromEntity(findById(inquiryId));
    }

    @Transactional
    public InquiryDto.InquiryResponse createInquiry(Long memberId, InquiryDto.InquiryRequest request) {
        Inquiry.InquiryCategory category;
        try {
            category = Inquiry.InquiryCategory.valueOf(request.getCategory());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InquiryException("올바르지 않은 문의 유형입니다.", HttpStatus.BAD_REQUEST);
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
            Member member = memberRepository.findById(memberId)
                    .orElseThrow(() -> new InquiryException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
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

        emailService.sendNewInquiryAlert(
                notifierName,
                notifierEmail,
                saved.getCategory().getDisplayName(),
                saved.getTitle(),
                saved.getContent()
        );

        return InquiryDto.InquiryResponse.fromEntity(saved);
    }

    @Transactional
    public void deleteInquiry(Long inquiryId, Long memberId) {
        Inquiry inquiry = findById(inquiryId);

        // 권한 및 상태 체크 (최소한의 방어)
        if (inquiry.getMember() == null || !inquiry.getMember().getId().equals(memberId)) throw new InquiryException("삭제 권한이 없습니다.", HttpStatus.FORBIDDEN);
        if (inquiry.getStatus() == Inquiry.InquiryStatus.ANSWERED) throw new InquiryException("답변 완료된 문의는 삭제 불가합니다.", HttpStatus.BAD_REQUEST);

        inquiryRepository.delete(inquiry);
    }

    @Transactional
    public InquiryDto.InquiryResponse answerInquiry(Long inquiryId, InquiryDto.AnswerRequest request) {
        Inquiry inquiry = findById(inquiryId);
        inquiry.answer(request.getAnswer());
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    @Transactional
    public void deleteInquiryAsAdmin(Long inquiryId) {
        inquiryRepository.delete(findById(inquiryId));
    }

    public Long getPendingInquiryCount(Long memberId) {
        return inquiryRepository.countByMemberIdAndStatus(memberId, Inquiry.InquiryStatus.PENDING);
    }

    public Long getTotalPendingInquiryCount() {
        return inquiryRepository.countByStatus(Inquiry.InquiryStatus.PENDING);
    }

    // 내부 조회용
    private Inquiry findById(Long id) {
        return inquiryRepository.findById(id)
                .orElseThrow(() -> new InquiryException("존재하지 않는 문의입니다.", HttpStatus.NOT_FOUND));
    }
}