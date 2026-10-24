package kr.it.reserve.member.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.service.LoginMethodService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/member/login-methods")
public class LoginMethodController {
    // 변경은 authVersion으로 기존 세션을 폐기한다. 늦은 응답이 다른 계정의 새 쿠키를 지우지 않는다.
    private final LoginMethodService methods;
    private final RateLimiter limiter;
    private final kr.it.reserve.member.service.MemberService memberService;

    public record OAuthRequest(@NotNull AuthProvider provider, @Size(max = 64) String currentPassword, boolean reauthenticate) { }
    public record EmailRequest(@NotBlank @Email @Size(max = 254) String email) { }
    public record PasswordRequest(@NotBlank @Size(max = 36) String challengeId,
            @NotBlank @Size(max = 6) String code, @NotBlank @Size(max = 64) String password,
            @NotBlank @Size(max = 64) String confirmation) { }
    public record UnlinkRequest(@NotBlank @Size(max = 64) String currentPassword) { }

    @GetMapping
    public ApiResponse<LoginMethodService.Status> status() {
        return ApiResponse.success(methods.status(SecurityUtil.getCurrentMember(), SecurityUtil.getOAuthAuthenticationAt()), "로그인 방법 조회 성공");
    }

    @PostMapping("/oauth")
    public ApiResponse<Map<String, String>> oauth(@Valid @RequestBody OAuthRequest body, HttpServletRequest request) {
        Member member = limited(request, RateLimiter.Policy.LOGIN_METHOD_CHANGE);
        return ApiResponse.success(Map.of("authorizationUrl", methods.beginOAuth(member, body.provider(), body.currentPassword(),
                body.reauthenticate(), request)), "본인 확인을 시작해요.");
    }

    @PostMapping("/password/code")
    public ApiResponse<LoginMethodService.EmailChallenge> code(@Valid @RequestBody EmailRequest body, HttpServletRequest request) {
        Member member = limited(request, RateLimiter.Policy.LOGIN_METHOD_EMAIL);
        return ApiResponse.success(methods.sendPasswordCode(member, SecurityUtil.getOAuthAuthenticationAt(), body.email()), "인증 코드를 발송했어요.");
    }

    @PostMapping("/password")
    public ApiResponse<Void> password(@Valid @RequestBody PasswordRequest body, HttpServletRequest request) {
        Member member = limited(request, RateLimiter.Policy.LOGIN_METHOD_VERIFY);
        methods.setPassword(member, SecurityUtil.getOAuthAuthenticationAt(), body.challengeId(), body.code(), body.password(), body.confirmation());
        return ApiResponse.success(null, "이메일 로그인을 설정했어요. 다시 로그인해주세요.");
    }

    @DeleteMapping("/password")
    public ApiResponse<Void> removePassword(HttpServletRequest request) {
        Member member = limited(request, RateLimiter.Policy.LOGIN_METHOD_CHANGE);
        methods.removePassword(member, SecurityUtil.getOAuthAuthenticationAt());
        return ApiResponse.success(null, "이메일 로그인을 해제했어요. 소셜 계정으로 다시 로그인해주세요.");
    }

    @PutMapping("/password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody kr.it.reserve.member.dto.PasswordChangeRequest body,
            HttpServletRequest request) {
        Member member = limited(request, RateLimiter.Policy.LOGIN_METHOD_CHANGE);
        memberService.changePassword(member.getId(), body);
        return ApiResponse.success(null, "비밀번호가 변경됐어요. 다시 로그인해주세요.");
    }

    @DeleteMapping("/social")
    public ApiResponse<Void> unlink(@Valid @RequestBody UnlinkRequest body, HttpServletRequest request) {
        methods.unlinkSocial(limited(request, RateLimiter.Policy.LOGIN_METHOD_CHANGE), body.currentPassword());
        return ApiResponse.success(null, "소셜 로그인 연결을 해제했어요. 이메일로 다시 로그인해주세요.");
    }

    private Member limited(HttpServletRequest request, RateLimiter.Policy policy) {
        Member member = SecurityUtil.getCurrentMember();
        if (!member.getId().toString().equals(request.getHeader("X-Reserve-Member-Id")))
            throw new MemberException("로그인 상태가 변경됐어요. 새로고침 후 다시 시도해주세요.", HttpStatus.CONFLICT);
        if (!limiter.tryConsume("login-method:ip:" + IpExtractor.extract(request), policy)
                || !limiter.tryConsume("login-method:member:" + member.getId(), policy))
            throw new MemberException("시도가 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        return member;
    }
}
