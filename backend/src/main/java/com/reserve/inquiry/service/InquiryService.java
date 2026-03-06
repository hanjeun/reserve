package com.reserve.inquiry.service;

import com.reserve.global.error.InquiryException;
import com.reserve.inquiry.dto.InquiryDto;
import com.reserve.inquiry.entity.Inquiry;
import com.reserve.inquiry.repository.InquiryRepository;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
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
        if (!inquiry.getMember().getId().equals(memberId)) {
            throw new InquiryException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
        return InquiryDto.InquiryResponse.fromEntity(inquiry);
    }

    public InquiryDto.InquiryResponse getInquiryForAdmin(Long inquiryId) {
        return InquiryDto.InquiryResponse.fromEntity(findById(inquiryId));
    }

    @Transactional
    public InquiryDto.InquiryResponse createInquiry(Long memberId, InquiryDto.InquiryRequest request) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new InquiryException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        Inquiry inquiry = Inquiry.builder()
                .member(member)
                .category(Inquiry.InquiryCategory.valueOf(request.getCategory()))
                .title(request.getTitle())
                .content(request.getContent())
                .status(Inquiry.InquiryStatus.PENDING)
                .build();

        return InquiryDto.InquiryResponse.fromEntity(inquiryRepository.save(inquiry));
    }

    @Transactional
    public void deleteInquiry(Long inquiryId, Long memberId) {
        Inquiry inquiry = findById(inquiryId);

        // 권한 및 상태 체크 (최소한의 방어)
        if (!inquiry.getMember().getId().equals(memberId)) throw new InquiryException("삭제 권한이 없습니다.", HttpStatus.FORBIDDEN);
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