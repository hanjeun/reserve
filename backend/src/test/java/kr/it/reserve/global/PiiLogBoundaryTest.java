package kr.it.reserve.global;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운영 로그에 직접 식별자와 외부 응답 원문이 다시 들어오지 않도록 로깅 호출을 검사한다.
 * 감사 로그 DB의 제한된 관리자 기록은 별도 보존 정책 대상이므로 이 검사 범위가 아니다.
 */
class PiiLogBoundaryTest {

    private static final Pattern LOG_CALL = Pattern.compile(
            "log\\.(?:trace|debug|info|warn|error)\\s*\\((.*?)\\);",
            Pattern.DOTALL);
    private static final Pattern DIRECT_IDENTIFIER_ARGUMENT = Pattern.compile(
            ",\\s*(?:email|toEmail|ownerEmail|memberEmail|ip|ipAddress|clientIp|query|search|address|title|reason|failReason|failureReason|providerId|originalFilename)\\s*(?:,|\\))",
            Pattern.DOTALL);

    private static final List<String> FORBIDDEN_EXPRESSIONS = List.of(
            ".getEmail()",
            "userInfo.getName()",
            "userInfo.getProviderId()",
            ".getOriginalFilename()",
            ".getResponseBodyAsString()",
            "request.getToEmail()",
            ".failureReason()",
            ".getReason()",
            ".getMessage()"
    );

    @Test
    @DisplayName("애플리케이션 로그는 이메일·IP·주소·원본 파일명·외부 오류 원문을 직접 기록하지 않는다")
    void applicationLogsDoNotContainDirectPiiExpressions() throws IOException {
        Path sourceRoot = resolveSourceRoot();
        List<String> violations = new ArrayList<>();

        try (Stream<Path> paths = Files.walk(sourceRoot)) {
            for (Path path : paths.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(path);
                Matcher calls = LOG_CALL.matcher(source);
                while (calls.find()) {
                    String call = calls.group();
                    boolean hasForbiddenExpression = FORBIDDEN_EXPRESSIONS.stream().anyMatch(call::contains);
                    boolean hasDirectIdentifier = DIRECT_IDENTIFIER_ARGUMENT.matcher(call).find();
                    if (hasForbiddenExpression || hasDirectIdentifier) {
                        violations.add(sourceRoot.relativize(path) + ": " + call.replaceAll("\\s+", " "));
                    }
                }
            }
        }

        assertThat(violations)
                .as("직접 식별자나 외부 오류 원문을 기록하는 로그 호출")
                .isEmpty();
    }

    private Path resolveSourceRoot() {
        Path backendWorkingDirectory = Path.of("src", "main", "java");
        if (Files.isDirectory(backendWorkingDirectory)) {
            return backendWorkingDirectory;
        }
        Path repositoryWorkingDirectory = Path.of("backend", "src", "main", "java");
        assertThat(repositoryWorkingDirectory).isDirectory();
        return repositoryWorkingDirectory;
    }
}
