package kr.it.reserve.global.security;

import java.nio.charset.StandardCharsets;

/** 회원가입·재설정·변경이 공유하는 비밀번호 규칙의 단일 정본. */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 8;
    public static final int MAX_LENGTH = 64;
    public static final int MAX_BCRYPT_BYTES = 72;
    public static final String LENGTH_MESSAGE = "비밀번호는 8~64자로 입력해주세요.";
    public static final String COMPOSITION_MESSAGE = "비밀번호에 영문과 숫자를 포함해주세요.";
    public static final String BYTE_LENGTH_MESSAGE = "비밀번호가 너무 깁니다. 영문 기준 72자 이내로 입력해주세요.";
    public static final String MISMATCH_MESSAGE = "비밀번호가 일치하지 않습니다.";

    private PasswordPolicy() {
    }

    /** 위반 문구를 반환하고, 유효하면 {@code null}을 반환한다. */
    public static String violation(String password) {
        if (password == null || password.length() < MIN_LENGTH || password.length() > MAX_LENGTH) {
            return LENGTH_MESSAGE;
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BCRYPT_BYTES) {
            return BYTE_LENGTH_MESSAGE;
        }
        boolean hasAsciiLetter = password.chars()
                .anyMatch(value -> (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z'));
        boolean hasDigit = password.chars().anyMatch(value -> value >= '0' && value <= '9');
        return hasAsciiLetter && hasDigit ? null : COMPOSITION_MESSAGE;
    }

    public static boolean matches(String password, String confirmation) {
        return password != null && password.equals(confirmation);
    }
}
