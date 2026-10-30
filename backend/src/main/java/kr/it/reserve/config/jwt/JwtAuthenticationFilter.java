package kr.it.reserve.config.jwt;

import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.member.entity.Member;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.Collections;

@Slf4j
@RequiredArgsConstructor
public class JwtAuthenticationFilter implements Filter {

    private final TokenProvider tokenProvider;
    private static final String COOKIE_NAME = "access_token";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;

        try {
            String token = resolveToken(httpRequest);

            if (token != null) {
                TokenProvider.VerifiedAuthentication verified = tokenProvider.verifyAuthentication(token);
                Member member = verified.member();
                String role = "ROLE_" + member.getRole().name();

                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        member,
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority(role))
                );
                authentication.setDetails(new SecurityUtil.OAuthAuthenticationDetails(
                        verified.oauthAuthenticatedAt(), verified.loginMethod(), verified.sessionId(), verified.persistent()));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        } catch (AuthException e) {
            log.warn("Authentication failed: errorType={}", e.getClass().getSimpleName());
        } catch (Exception e) {
            log.error("JWT filter internal error: errorType={}", e.getClass().getSimpleName());
        }

        chain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        // 1. Header 확인
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }

        // 2. Cookie 확인
        return CookieUtil.getCookie(request, COOKIE_NAME);
    }
}
