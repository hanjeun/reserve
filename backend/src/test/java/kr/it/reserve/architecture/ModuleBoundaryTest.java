package kr.it.reserve.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 모듈 경계 래칫 — 모듈러 모놀리스 전환 0단계 (docs/technical/modularization-plan.md, 2026-09-24).
 *
 * <p>{@code kr.it.reserve} 바로 아래 패키지(member·store·payment…)를 모듈로 보고, <b>서로를 의존하는 모듈 쌍</b>(A⇄B)을 센다.
 * 지금 있는 쌍은 {@link #KNOWN_BIDIRECTIONAL} 기준선에 두고,
 * <ul>
 *   <li>새 쌍이 생기면 실패 — 한쪽 방향을 이벤트나 인터페이스로 끊어야 한다.</li>
 *   <li>기준선의 쌍이 없어졌는데 목록에 남아 있어도 실패 — 목록에서 지워 다시 생기지 못하게 한다(한 방향으로만 좋아진다).</li>
 * </ul>
 * ArchUnit 의 순환 탐지(freeze)는 기본 100개에서 잘려 기준선이 흔들리므로, 계획서의 지표(양방향 쌍)를 직접 센다.
 */
class ModuleBoundaryTest {

    private static final String ROOT = "kr.it.reserve.";

    /** 기준선 — 줄이기만 한다. 1단계(탈퇴·폐업 조율 서비스)가 끝나면 여기서 지운다. */
    private static final Set<String> KNOWN_BIDIRECTIONAL = Set.of(
            // 2026-09-24 실측 19쌍. 회원 탈퇴(member⇄*)·가게 폐업(store⇄*)·감사 로그 정리(audit⇄*)가 대부분이다.
            "advertisement⇄audit",
            "advertisement⇄payment",
            "advertisement⇄store",
            "audit⇄mailbox",
            "audit⇄reservation",
            "business⇄member",
            "community⇄member",
            "config⇄member",
            "email⇄member",
            "favorite⇄member",
            "favorite⇄store",
            "lifecycle⇄store",
            "member⇄payment",
            "member⇄promotion",
            "member⇄reservation",
            "payment⇄reservation",
            "payment⇄store",
            "promotion⇄store",
            "reservation⇄store"
    );

    @Test
    void noNewBidirectionalModuleDependencies() {
        JavaClasses classes = new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages("kr.it.reserve");

        Map<String, Set<String>> edges = new TreeMap<>();
        for (JavaClass source : classes) {
            String from = moduleOf(source);
            if (from == null) continue;
            for (Dependency dependency : source.getDirectDependenciesFromSelf()) {
                String to = moduleOf(dependency.getTargetClass());
                if (to != null && !to.equals(from)) edges.computeIfAbsent(from, key -> new TreeSet<>()).add(to);
            }
        }

        Set<String> pairs = new TreeSet<>();
        edges.forEach((a, targets) -> targets.forEach(b -> {
            if (a.compareTo(b) < 0 && edges.getOrDefault(b, Set.of()).contains(a)) pairs.add(a + "⇄" + b);
        }));

        Set<String> added = new TreeSet<>(pairs);
        added.removeAll(KNOWN_BIDIRECTIONAL);
        Set<String> removed = new TreeSet<>(KNOWN_BIDIRECTIONAL);
        removed.removeAll(pairs);

        assertThat(added).as("새 양방향 모듈 의존(현재 전체 %d쌍: %s) — 한쪽 방향을 이벤트나 인터페이스로 끊으세요", pairs.size(), pairs).isEmpty();
        assertThat(removed).as("없어진 양방향 의존 — 기준선(KNOWN_BIDIRECTIONAL)에서도 지워 다시 생기지 않게 하세요").isEmpty();
    }

    private static String moduleOf(JavaClass javaClass) {
        String name = javaClass.getPackageName();
        if (!name.startsWith(ROOT)) return null;
        String rest = name.substring(ROOT.length());
        int dot = rest.indexOf('.');
        return dot < 0 ? rest : rest.substring(0, dot);
    }
}
