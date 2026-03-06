# 🔍 코드 리팩토링 분석 보고서

> 작성일: 2026-01-31  
> 분석 대상: RESERVE 백엔드 프로젝트 - Custom Exception 리팩토링 후

---

## ✅ 잘 된 점 (Good Practices)

### 1. Custom Exception 계층 구조 ⭐⭐⭐⭐⭐
```
BusinessException (기본 클래스)
    ├── MemberException
    ├── StoreException
    ├── ReservationException
    ├── PaymentException
    ├── ReviewException
    ├── PromotionException
    ├── FavoriteException
    ├── EmailException
    ├── InquiryException
    ├── NoticeException
    ├── CommunityException
    ├── BizVerificationException
    ├── AuthException
    └── FileException
```

**장점:**
- 도메인별로 명확하게 분리된 예외 클래스
- `BusinessException`을 상속받아 일관된 구조
- `HttpStatus`를 포함하여 RESTful API 응답에 적합

### 2. GlobalExceptionHandler 구현 ⭐⭐⭐⭐⭐
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    protected ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        // 모든 Custom Exception을 한 곳에서 처리
    }
}
```

**장점:**
- 단일 진입점으로 모든 Custom Exception 처리
- 로그 남기기 (`log.warn`)
- 일관된 응답 포맷 (`ApiResponse`)

### 3. IllegalArgumentException 제거 완료 ✅
```bash
# 검색 결과: 0건
throw new IllegalArgumentException
```

**개선 완료:**
- 기존의 `IllegalArgumentException` 사용을 모두 Custom Exception으로 교체
- 더 명확한 예외 메시지와 적절한 HTTP 상태 코드 사용

### 4. 적절한 HTTP 상태 코드 사용 ⭐⭐⭐⭐
```java
// 404 NOT_FOUND
.orElseThrow(() -> new StoreException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

// 409 CONFLICT
throw new MemberException("이미 사용 중인 이메일입니다.", HttpStatus.CONFLICT);

// 403 FORBIDDEN
throw new ReservationException("본인 가게의 예약만 조회 가능합니다.", HttpStatus.FORBIDDEN);

// 400 BAD_REQUEST (기본값)
throw new ReservationException("대기 중인 예약만 수정할 수 있습니다.");
```

---

## ⚠️ 발견된 문제점 및 개선 권장사항

### 🔴 Critical Issues

#### 1. **EntityNotFoundException 핸들러가 사용되지 않음**

**위치:** `GlobalExceptionHandler.java:43`

```java
@ExceptionHandler(jakarta.persistence.EntityNotFoundException.class)
protected ResponseEntity<ApiResponse<Void>> handleEntityNotFound(jakarta.persistence.EntityNotFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ApiResponse.error(e.getMessage()));
}
```

**문제:**
- 프로젝트 전체에서 `EntityNotFoundException`을 던지는 곳이 없음
- 모든 `orElseThrow()`는 Custom Exception을 사용

**해결:**
```java
// 삭제 권장
// 또는 주석으로 "향후 JPA 사용 시를 위한 핸들러" 명시
```

#### 2. **FavoriteException이 사용되지 않음... 아닙니다! ✅**

재확인 결과 `FavoriteService.java`에서 사용 중:
```java
.orElseThrow(() -> new FavoriteException("해당 가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**정정:** FavoriteException은 정상적으로 사용 중입니다.

#### 3. **AccessDeniedException 처리 중복 가능성**

**위치:** `GlobalExceptionHandler.java:27`, `ReservationApiController.java:93`

```java
// GlobalExceptionHandler.java
@ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)

// ReservationApiController.java
throw new org.springframework.security.access.AccessDeniedException("사업자 권한이 없습니다.");
```

**문제:**
- Spring Security의 `AccessDeniedException`을 직접 던지는 것은 일관성 위배
- 다른 곳에서는 Custom Exception 사용하는데 여기만 예외

**해결:**
```java
// 수정 전
throw new org.springframework.security.access.AccessDeniedException("사업자 권한이 없습니다.");

// 수정 후
throw new ReservationException("사업자 권한이 없습니다.", HttpStatus.FORBIDDEN);
```

**적용 위치:**
- `ReservationApiController.java:93`
- 다른 컨트롤러에서도 동일 패턴 검색 필요

---

### 🟡 Medium Issues

#### 4. **Exception 메시지의 일관성 부족**

**예시:**
```java
// 👍 Good
new StoreException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND)
new MemberException("회원이 존재하지 않습니다.", HttpStatus.NOT_FOUND)

// 👎 Inconsistent
new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND)
new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND) // 결제인데 예약?
```

**개선 권장:**
```java
// 리소스명 통일
"가게를 찾을 수 없습니다"
"회원을 찾을 수 없습니다"
"예약을 찾을 수 없습니다"
"결제 정보를 찾을 수 없습니다" // "예약 정보" → "결제 정보"
```

#### 5. **Exception 생성자 오버로딩 미사용**

**현재:**
```java
public class MemberException extends BusinessException {
    public MemberException(String message) {
        super(message, HttpStatus.BAD_REQUEST); // 기본값
    }

    public MemberException(String message, HttpStatus status) {
        super(message, status);
    }
}
```

**사용 패턴:**
```java
// 대부분 HttpStatus를 명시적으로 지정
throw new MemberException("...", HttpStatus.NOT_FOUND);
throw new MemberException("...", HttpStatus.CONFLICT);
throw new MemberException("...", HttpStatus.FORBIDDEN);
throw new MemberException("...", HttpStatus.BAD_REQUEST); // 기본값인데도 명시
```

**개선 제안:**
```java
// 방법 1: 자주 사용하는 상태별 정적 팩토리 메서드 추가
public static MemberException notFound(String message) {
    return new MemberException(message, HttpStatus.NOT_FOUND);
}

public static MemberException conflict(String message) {
    return new MemberException(message, HttpStatus.CONFLICT);
}

// 사용
throw MemberException.notFound("회원을 찾을 수 없습니다");
throw MemberException.conflict("이미 사용 중인 이메일입니다");
```

**장점:**
- 가독성 향상
- 오타 방지 (HttpStatus.NOT_FOUND → notFound)
- IDE 자동완성 지원

#### 6. **PaymentException의 도메인 경계 모호**

**위치:** `PaymentService.java`

```java
// 결제 서비스인데 예약/회원 관련 예외 던짐
.orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
.orElseThrow(() -> new PaymentException("회원 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**문제:**
- 도메인 경계가 명확하지 않음
- Payment 서비스에서 Reservation이나 Member를 못 찾았을 때도 PaymentException?

**해결 방안:**

**옵션 1: 각 도메인의 Exception 사용**
```java
// Reservation 찾을 때
.orElseThrow(() -> new ReservationException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

// Member 찾을 때
.orElseThrow(() -> new MemberException("회원 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

// Payment 찾을 때만
.orElseThrow(() -> new PaymentException("결제 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

**옵션 2: 공통 NotFoundException 생성**
```java
public class ResourceNotFoundException extends BusinessException {
    public ResourceNotFoundException(String resourceName) {
        super(resourceName + "을(를) 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
}

// 사용
throw new ResourceNotFoundException("예약 정보");
throw new ResourceNotFoundException("회원");
throw new ResourceNotFoundException("결제 정보");
```

**권장:** 옵션 1 (도메인 명확성)

---

### 🟢 Minor Issues

#### 7. **예외 메시지의 존댓말 통일**

**현재 상태:**
```java
// 존댓말 O
"이미 사용 중인 이메일입니다."
"회원을 찾을 수 없습니다."

// 존댓말 X + 명령형
"이메일 인증이 필요합니다."  // "필요합니다" vs "필요해요"
"인증 코드를 입력해주세요."  // 명령형
```

**통일 권장:**
```java
// 패턴 1: 서술형 (현재 상태 설명)
"이미 사용 중인 이메일입니다"
"회원을 찾을 수 없습니다"
"이메일 인증이 필요합니다"

// 패턴 2: 명령형 (사용자 액션 요구)
"이메일 인증을 완료해주세요"
"인증 코드를 입력해주세요"
```

**권장:** 패턴 1 (서술형) - API 에러 메시지에 적합

#### 8. **로그 레벨 검토**

**현재:**
```java
@ExceptionHandler(BusinessException.class)
protected ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
    log.warn("BusinessException 발생 [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
    // ...
}
```

**문제:**
- 모든 BusinessException을 `WARN` 레벨로 처리
- 실제로는 404 NOT_FOUND 같은 정상적인 흐름도 포함

**개선:**
```java
@ExceptionHandler(BusinessException.class)
protected ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
    // 500대 에러는 ERROR, 400대는 WARN
    if (e.getStatus().is5xxServerError()) {
        log.error("BusinessException 발생 [{}]: {}", e.getClass().getSimpleName(), e.getMessage(), e);
    } else if (e.getStatus().value() >= 400) {
        log.warn("BusinessException 발생 [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
    } else {
        log.info("BusinessException 발생 [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
    }
    
    return ResponseEntity
            .status(e.getStatus())
            .body(ApiResponse.error(e.getMessage()));
}
```

---

## 📊 Exception 사용 현황 통계

### 사용 빈도 (상위 5개)
1. **ReservationException**: ~13회
2. **PaymentException**: ~12회
3. **BizVerificationException**: ~11회
4. **MemberException**: ~8회
5. **AuthException**: ~6회

### 미사용 Exception
- **FileException**: 정의되어 있으나 사용되지 않음

**권장:**
```java
// FileStorageService에 적용
throw new FileException("파일 업로드에 실패했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
throw new FileException("허용되지 않는 파일 형식입니다.", HttpStatus.BAD_REQUEST);
```

### 적게 사용되는 Exception
- **NoticeException**: 1회
- **CommunityException**: 1회
- **PromotionException**: 4회

**검토 필요:** 실제로 필요한지 확인

---

## 🎯 우선순위별 개선 작업

### Priority 1 (즉시 수정)
1. ✅ `AccessDeniedException` 직접 사용 → Custom Exception 변경
2. ✅ `EntityNotFoundException` 핸들러 제거 또는 주석 처리
3. ✅ PaymentException에서 다른 도메인 예외 분리

### Priority 2 (1주 내)
4. ✅ Exception 메시지 일관성 통일
5. ✅ 로그 레벨 개선 (HttpStatus 기반)
6. ✅ FileException 활용 (FileStorageService)

### Priority 3 (점진적)
7. ✅ 정적 팩토리 메서드 도입 검토
8. ✅ 예외 메시지 한글 통일 (존댓말 패턴)
9. ✅ 사용되지 않는 Exception 클래스 정리

---

## 💡 코드 개선 예시

### Before (문제 있는 코드)
```java
// ReservationApiController.java:93
if (!member.isBusiness() && !member.isAdmin()) {
    throw new org.springframework.security.access.AccessDeniedException("사업자 권한이 없습니다.");
}

// PaymentService.java
Reservation reservation = reservationRepository.findById(requestDto.getReservationId())
    .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new PaymentException("회원 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

### After (개선된 코드)
```java
// ReservationApiController.java:93
if (!member.isBusiness() && !member.isAdmin()) {
    throw new ReservationException("사업자 권한이 없습니다.", HttpStatus.FORBIDDEN);
}

// PaymentService.java
Reservation reservation = reservationRepository.findById(requestDto.getReservationId())
    .orElseThrow(() -> new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

Member member = memberRepository.findById(memberId)
    .orElseThrow(() -> new MemberException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
```

---

## 🔧 GlobalExceptionHandler 개선안

### 현재
```java
@ExceptionHandler(IllegalArgumentException.class)
protected ResponseEntity<ApiResponse<Void>> handleIllegalArgumentException(IllegalArgumentException e) {
    log.warn("IllegalArgumentException: {}", e.getMessage());
    return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(ApiResponse.error(e.getMessage()));
}
```

### 개선 (사용되지 않으므로 삭제 권장)
```java
// IllegalArgumentException 핸들러 삭제
// 이유: 프로젝트에서 더 이상 IllegalArgumentException을 던지지 않음
```

### EntityNotFoundException 핸들러

**Option 1: 삭제**
```java
// EntityNotFoundException 핸들러 삭제
// 이유: JPA EntityNotFoundException을 사용하지 않음
```

**Option 2: 주석으로 보관**
```java
/**
 * JPA EntityNotFoundException 처리 (현재 미사용)
 * 향후 JPA Native Query 사용 시를 대비한 핸들러
 */
// @ExceptionHandler(jakarta.persistence.EntityNotFoundException.class)
// protected ResponseEntity<ApiResponse<Void>> handleEntityNotFound(...) { }
```

---

## 📈 최종 평가

### 전체 점수: **92/100**

**채점 기준:**
- Custom Exception 구조: 20/20 ⭐⭐⭐⭐⭐
- GlobalExceptionHandler: 18/20 ⭐⭐⭐⭐
- 일관성: 17/20 ⭐⭐⭐⭐
- HTTP 상태 코드 활용: 19/20 ⭐⭐⭐⭐⭐
- 로깅: 15/20 ⭐⭐⭐
- 코드 정리: 3/0 (감점 -7점, 사용되지 않는 핸들러 존재)

### 주요 강점
✅ 체계적인 Custom Exception 계층  
✅ 도메인별 명확한 예외 분리  
✅ GlobalExceptionHandler를 통한 중앙 집중식 처리  
✅ IllegalArgumentException 제거 완료  

### 개선 필요
⚠️ 사용되지 않는 Exception 핸들러 정리  
⚠️ 도메인 경계를 넘는 Exception 사용 개선  
⚠️ 로그 레벨 세분화  
⚠️ 예외 메시지 일관성 향상  

---

## 🚀 다음 단계 제안

1. **Immediate Actions (오늘 ~ 내일)**
   - AccessDeniedException 직접 사용 제거
   - EntityNotFoundException 핸들러 제거
   - IllegalArgumentException 핸들러 제거

2. **Short Term (이번 주)**
   - PaymentService Exception 분리
   - FileException 활용 시작
   - 예외 메시지 통일 작업

3. **Long Term (다음 주 ~)**
   - 정적 팩토리 메서드 도입 검토
   - Exception 별 테스트 코드 작성
   - API 문서에 Exception 응답 예시 추가

---

**작성자**: Claude  
**검토 완료**: 2026-01-31  
**다음 검토 예정**: 리팩토링 완료 후