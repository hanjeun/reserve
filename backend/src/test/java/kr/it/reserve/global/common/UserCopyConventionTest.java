package kr.it.reserve.global.common;

import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreeScanner;
import org.junit.jupiter.api.Test;

import javax.tools.ToolProvider;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Source literals enforce copy and logging conventions without touching stored user content. */
class UserCopyConventionTest {
    private static final Pattern FORMAL = Pattern.compile("[가-힣]*(?:니다|니까)(?![가-힣])");
    private static final Pattern THREAT = Pattern.compile("(?:고소|고발)(?:$|[^가-힣]|장|하|할|해|합|했|당|되|를)|처벌|법적\\s*(?:조치|대응)|(?:민사|형사)\\s*책임");
    private static final Pattern LOGGER = Pattern.compile("(?:log|logger)\\.(?:info|warn|error|debug|trace)");
    private static final Pattern KOREAN = Pattern.compile("[가-힣]");

    @Test
    void userMessagesUseFriendlyCopyAndServerLogsUseEnglish() throws Exception {
        Path sourceRoot = Path.of("src/main/java").toAbsolutePath().normalize();
        List<Path> sources;
        try (var paths = Files.walk(sourceRoot)) {
            sources = paths.filter(path -> path.toString().endsWith(".java")).sorted().toList();
        }
        assertThat(sources).isNotEmpty();
        var compiler = ToolProvider.getSystemJavaCompiler();
        assertThat(compiler).as("The source convention check requires the project's JDK").isNotNull();
        List<String> violations = new ArrayList<>();
        try (var manager = compiler.getStandardFileManager(null, Locale.ROOT, StandardCharsets.UTF_8)) {
            var inputs = manager.getJavaFileObjectsFromPaths(sources);
            var parser = (JavacTask) compiler.getTask(null, manager, null, List.of("-proc:none"), null, inputs);
            for (var unit : parser.parse()) {
                String file = sourceRoot.relativize(Path.of(unit.getSourceFile().toUri())).toString();
                new TreeScanner<Void, Void>() {
                    @Override
                    public Void visitLiteral(LiteralTree node, Void unused) {
                        if (node.getValue() instanceof String text) {
                            if (FORMAL.matcher(text).find()) violations.add(file + ": formal user message");
                            if (THREAT.matcher(text).find()) violations.add(file + ": threatening user message");
                        }
                        return super.visitLiteral(node, unused);
                    }

                    @Override
                    public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
                        if (LOGGER.matcher(node.getMethodSelect().toString()).matches() && !node.getArguments().isEmpty()) {
                            new TreeScanner<Void, Void>() {
                                @Override
                                public Void visitLiteral(LiteralTree literal, Void context) {
                                    if (literal.getValue() instanceof String text && KOREAN.matcher(text).find()) {
                                        violations.add(file + ": Korean server log");
                                    }
                                    return super.visitLiteral(literal, context);
                                }
                            }.scan(node.getArguments().getFirst(), null);
                        }
                        return super.visitMethodInvocation(node, unused);
                    }
                }.scan(unit, null);
            }
        }
        assertThat(violations).isEmpty();
    }
}
