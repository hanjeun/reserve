# 🔧 정적 팩토리 메서드 완전 가이드

> 작성일: 2026-01-31  
> 목적: 모든 Exception 클래스에 정적 팩토리 메서드 추가 및 사용법 정리

---

## 📊 현재 상태 분석

### ✅ 완료된 Exception (정적 메서드 있음)
1. ✅ **MemberException** - `notFound()`, `conflict()`, `forbidden()`
2. ✅ **AuthException** - `unauthorized()`, `forbidden()`, `badRequest()`
3. ✅ **StoreException** - `notFound()`, `forbidden()`
4. ✅ **ReservationException** - `notFound()`, `forbidden()`
5. ✅ **PaymentException** - `notFound()`
6. ✅ **ReviewException** - `notFound()`, `forbidden()`
7. ✅ **EmailException** - `notFound()`, `expired()`
8. ✅ **FavoriteException** - `notFound()`

### ⏳ 추가 필요한 Exception
9. ⏳ **CommunityException** - 추가 필요
10. ⏳ **PromotionException** - 추가 필요
11. ⏳ **BizVerificationException** - 추가 필요
12. ⏳ **NoticeException** - 추가 필요
13. ⏳ **InquiryException** - 추가 필요

---

## 🎯 추가해야 할 정적 메서드

### 1. CommunityException
```java
package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class CommunityException extends BusinessException {
    
    public CommunityException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public CommunityException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static CommunityException postNotFound() {
        return new CommunityException("게시글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static CommunityException commentNotFound() {
        return new CommunityException("댓글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static CommunityException forbidden(String message) {
        return new CommunityException(message, HttpStatus.FORBIDDEN);
    }
}
```

### 2. PromotionException
```java
package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class PromotionException extends BusinessException {
    
    public PromotionException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public PromotionException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static PromotionException notFound() {
        return new PromotionException("홍보글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static PromotionException forbidden(String message) {
        return new PromotionException(message, HttpStatus.FORBIDDEN);
    }
}
```

### 3. BizVerificationException
```java
package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class BizVerificationException extends BusinessException {
    
    public BizVerificationException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public BizVerificationException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static BizVerificationException notFound() {
        return new BizVerificationException("사업자 인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
}
```

### 4. NoticeException
```java
package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class NoticeException extends BusinessException {
    
    public NoticeException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public NoticeException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static NoticeException notFound() {
        return new NoticeException("공지사항을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static NoticeException forbidden(String message) {
        return new NoticeException(message, HttpStatus.FORBIDDEN);
    }
}
```

### 5. InquiryException
```java
package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class InquiryException extends BusinessException {
    
    public InquiryException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public InquiryException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static InquiryException notFound() {
        return new InquiryException("문의를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static InquiryException forbidden(String message) {
        return new InquiryException(message, HttpStatus.FORBIDDEN);
    }
}
```

---

## 📝 Service 클래스별 적용 가이드

### 1. ReservationService (2곳)

**Before:**
```java
Store store = storeRepository.findById(storeId)
    .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Reservation reservation = reservationRepository.findById(id)
    .orElseThrow(() -> new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
// 도메인 분리 - Store는 StoreException 사용
Store store = storeRepository.findById(storeId)
    .orElseThrow(StoreException::notFound);

Reservation reservation = reservationRepository.findById(id)
    .orElseThrow(ReservationException::notFound);
```

### 2. ReviewService (2곳)

**Before:**
```java
Reservation reservation = reservationRepository.findById(request.getReservationId())
    .orElseThrow(() -> new ReviewException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Review review = reviewRepository.findById(id)
    .orElseThrow(() -> new ReviewException("리뷰를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Reservation reservation = reservationRepository.findById(request.getReservationId())
    .orElseThrow(ReservationException::notFound);  // 도메인 분리

Review review = reviewRepository.findById(id)
    .orElseThrow(ReviewException::notFound);
```

### 3. FavoriteService (2곳)

**Before:**
```java
Store store = storeRepository.findById(storeId)
    .orElseThrow(() -> new FavoriteException("해당 가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Store store = storeRepository.findById(storeId)
    .orElseThrow(StoreException::notFound);  // 도메인 분리
```

### 4. CommunityService (3곳)

**Before:**
```java
CommunityComment comment = communityCommentRepository.findById(commentId)
    .orElseThrow(() -> new CommunityException("댓글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

CommunityPost post = communityPostRepository.findById(postId)
    .orElseThrow(() -> new CommunityException("게시글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new CommunityException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
CommunityComment comment = communityCommentRepository.findById(commentId)
    .orElseThrow(CommunityException::commentNotFound);

CommunityPost post = communityPostRepository.findById(postId)
    .orElseThrow(CommunityException::postNotFound);

Member member = memberRepository.findById(memberId)
    .orElseThrow(MemberException::notFound);  // 도메인 분리
```

### 5. PromotionService (3곳)

**Before:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new PromotionException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Store store = storeRepository.findById(request.getStoreId())
    .orElseThrow(() -> new PromotionException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Promotion promotion = promotionRepository.findById(id)
    .orElseThrow(() -> new PromotionException("홍보글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(MemberException::notFound);  // 도메인 분리

Store store = storeRepository.findById(request.getStoreId())
    .orElseThrow(StoreException::notFound);  // 도메인 분리

Promotion promotion = promotionRepository.findById(id)
    .orElseThrow(PromotionException::notFound);
```

### 6. BusinessVerificationService (3곳)

**Before:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new BizVerificationException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

BusinessVerification verification = businessVerificationRepository.findByMemberId(memberId)
    .orElseThrow(() -> new BizVerificationException("신청 내역이 없습니다.", HttpStatus.NOT_FOUND));

BusinessVerification bv = businessVerificationRepository.findById(verificationId)
    .orElseThrow(() -> new BizVerificationException("해당 인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(MemberException::notFound);  // 도메인 분리

BusinessVerification verification = businessVerificationRepository.findByMemberId(memberId)
    .orElseThrow(BizVerificationException::notFound);

BusinessVerification bv = businessVerificationRepository.findById(verificationId)
    .orElseThrow(BizVerificationException::notFound);
```

### 7. NoticeService (2곳)

**Before:**
```java
Notice notice = noticeRepository.findById(id)
    .orElseThrow(() -> new NoticeException("존재하지 않는 공지사항입니다.", HttpStatus.NOT_FOUND));

Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new NoticeException("사용자 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Notice notice = noticeRepository.findById(id)
    .orElseThrow(NoticeException::notFound);

Member member = memberRepository.findById(memberId)
    .orElseThrow(MemberException::notFound);  // 도메인 분리
```

### 8. InquiryService (2곳)

**Before:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new InquiryException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Inquiry inquiry = inquiryRepository.findById(inquiryId)
    .orElseThrow(() -> new InquiryException("존재하지 않는 문의입니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Member member = memberRepository.findById(memberId)
    .orElseThrow(MemberException::notFound);  // 도메인 분리

Inquiry inquiry = inquiryRepository.findById(inquiryId)
    .orElseThrow(InquiryException::notFound);
```

### 9. EmailVerificationService (1곳)

**Before:**
```java
EmailVerification verification = emailVerificationRepository.findByEmailAndVerified(email, false)
    .orElseThrow(() -> new EmailException("인증 요청 내역을 찾을 수 없습니다. 다시 요청해주세요.", HttpStatus.NOT_FOUND));
```

**After:**
```java
EmailVerification verification = emailVerificationRepository.findByEmailAndVerified(email, false)
    .orElseThrow(EmailException::notFound);
```

### 10. PaymentApiController (1곳)

**Before:**
```java
Payment payment = paymentRepository.findByMerchantUid(merchantUid)
    .orElseThrow(() -> new PaymentException("결제 정보를 찾을 수 없습니다."));
```

**After:**
```java
Payment payment = paymentRepository.findByMerchantUid(merchantUid)
    .orElseThrow(PaymentException::notFound);
```

### 11. PaymentService (1곳 - 이미 수정했지만 누락된 것)

**Before:**
```java
Reservation reservation = reservationRepository.findById(reservationId)
    .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**After:**
```java
Reservation reservation = reservationRepository.findById(reservationId)
    .orElseThrow(ReservationException::notFound);  // 도메인 분리
```

---

## 🎯 도메인 분리 원칙

### ✅ DO (올바른 사용)
```java
// Member 조회 실패 → MemberException
Member member = memberRepository.findById(id)
    .orElseThrow(MemberException::notFound);

// Store 조회 실패 → StoreException
Store store = storeRepository.findById(id)
    .orElseThrow(StoreException::notFound);

// Reservation 조회 실패 → ReservationException
Reservation reservation = reservationRepository.findById(id)
    .orElseThrow(ReservationException::notFound);
```

### ❌ DON'T (잘못된 사용)
```java
// PaymentService에서 Member 조회 실패인데 PaymentException 사용 ❌
Member member = memberRepository.findById(id)
    .orElseThrow(() -> new PaymentException("회원을 찾을 수 없습니다.", ...));

// CommunityService에서 Member 조회 실패인데 CommunityException 사용 ❌
Member member = memberRepository.findById(id)
    .orElseThrow(() -> new CommunityException("회원을 찾을 수 없습니다.", ...));
```

---

## 📊 전체 적용 체크리스트

### Service 클래스별 적용 현황

- [x] **MemberService** - 완료 (2곳)
- [x] **StoreService** - 완료 (3곳)
- [x] **PaymentService** - 완료 (4곳)
- [ ] **ReservationService** - 미완료 (2곳)
- [ ] **ReviewService** - 미완료 (2곳)
- [ ] **FavoriteService** - 미완료 (2곳)
- [ ] **CommunityService** - 미완료 (3곳)
- [ ] **PromotionService** - 미완료 (3곳)
- [ ] **BusinessVerificationService** - 미완료 (3곳)
- [ ] **NoticeService** - 미완료 (2곳)
- [ ] **InquiryService** - 미완료 (2곳)
- [ ] **EmailVerificationService** - 미완료 (1곳)
- [ ] **PaymentApiController** - 미완료 (1곳)

### Exception 클래스별 정적 메서드 현황

- [x] MemberException - 3개 메서드
- [x] AuthException - 3개 메서드
- [x] StoreException - 2개 메서드
- [x] ReservationException - 2개 메서드
- [x] PaymentException - 1개 메서드
- [x] ReviewException - 2개 메서드
- [x] EmailException - 2개 메서드
- [x] FavoriteException - 1개 메서드
- [ ] CommunityException - 추가 필요
- [ ] PromotionException - 추가 필요
- [ ] BizVerificationException - 추가 필요
- [ ] NoticeException - 추가 필요
- [ ] InquiryException - 추가 필요

---

## 🚀 일괄 적용 스크립트 (참고용)

만약 모든 Service 클래스를 한 번에 수정하려면 다음 순서로 진행:

1. 나머지 5개 Exception 클래스에 정적 메서드 추가
2. 각 Service 클래스 수정 (도메인 분리 원칙 준수)
3. 테스트 실행
4. 커밋

---

**작성자**: Claude  
**완료 시간**: 2026-01-31  
**다음 작업**: 나머지 Exception 및 Service 클래스 일괄 적용