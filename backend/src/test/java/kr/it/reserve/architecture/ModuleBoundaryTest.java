package kr.it.reserve.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.HashSet;
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
 * <p>양방향 쌍만으로는 A→B→C→A를 놓친다. 순환에 참여하는 모든 의존 방향도 고정한다.
 * 각 방향 A→B에 대해 B에서 A로 돌아오는 경로를 확인하므로 순환 길이·개수 제한이 없다.
 * 기존 방향이 사라지면 기준선에서도 제거해 다시 추가할 수 없게 한다.
 */
class ModuleBoundaryTest {

    private static final String ROOT = "kr.it.reserve.";
    private static Map<String, Set<String>> moduleDependencies;

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

    /** 2026-10-04 바이트코드 실측 65개 순환 방향(2개 모듈 순환 포함). 줄이기만 한다. */
    private static final Set<String> KNOWN_CYCLIC_DIRECTIONS = Set.of(
            "advertisement->audit",
            "advertisement->config",
            "advertisement->member",
            "advertisement->payment",
            "advertisement->reservation",
            "advertisement->store",
            "audit->advertisement",
            "audit->mailbox",
            "audit->member",
            "audit->payment",
            "audit->reservation",
            "audit->review",
            "audit->store",
            "business->audit",
            "business->config",
            "business->email",
            "business->member",
            "community->config",
            "community->member",
            "config->member",
            "email->member",
            "favorite->config",
            "favorite->member",
            "favorite->store",
            "lifecycle->advertisement",
            "lifecycle->payment",
            "lifecycle->reservation",
            "lifecycle->store",
            "mailbox->audit",
            "mailbox->member",
            "member->business",
            "member->community",
            "member->config",
            "member->email",
            "member->favorite",
            "member->lifecycle",
            "member->payment",
            "member->promotion",
            "member->reservation",
            "payment->advertisement",
            "payment->config",
            "payment->member",
            "payment->reservation",
            "payment->store",
            "promotion->config",
            "promotion->member",
            "promotion->store",
            "reservation->audit",
            "reservation->config",
            "reservation->email",
            "reservation->member",
            "reservation->payment",
            "reservation->store",
            "review->config",
            "review->member",
            "review->reservation",
            "review->store",
            "store->advertisement",
            "store->config",
            "store->favorite",
            "store->lifecycle",
            "store->member",
            "store->payment",
            "store->promotion",
            "store->reservation"
    );

    @BeforeAll
    static void inspectModuleDependencies() {
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
        moduleDependencies = edges;
    }

    @Test
    void noNewBidirectionalModuleDependencies() {
        Set<String> pairs = new TreeSet<>();
        moduleDependencies.forEach((a, targets) -> targets.forEach(b -> {
            if (a.compareTo(b) < 0 && moduleDependencies.getOrDefault(b, Set.of()).contains(a)) pairs.add(a + "⇄" + b);
        }));

        Set<String> added = new TreeSet<>(pairs);
        added.removeAll(KNOWN_BIDIRECTIONAL);
        Set<String> removed = new TreeSet<>(KNOWN_BIDIRECTIONAL);
        removed.removeAll(pairs);

        assertThat(added).as("새 양방향 모듈 의존(현재 전체 %d쌍: %s) — 한쪽 방향을 이벤트나 인터페이스로 끊으세요", pairs.size(), pairs).isEmpty();
        assertThat(removed).as("없어진 양방향 의존 — 기준선(KNOWN_BIDIRECTIONAL)에서도 지워 다시 생기지 않게 하세요").isEmpty();
    }

    @Test
    void noNewCyclicModuleDependencyDirections() {
        Set<String> actual = cyclicDirections(moduleDependencies);
        Set<String> added = new TreeSet<>(actual);
        added.removeAll(KNOWN_CYCLIC_DIRECTIONS);
        Set<String> removed = new TreeSet<>(KNOWN_CYCLIC_DIRECTIONS);
        removed.removeAll(actual);

        assertThat(added).as("새 순환 의존 방향 — 3개 이상 모듈을 거치는 순환도 허용하지 않습니다").isEmpty();
        assertThat(removed).as("없어진 순환 방향 — 기준선(KNOWN_CYCLIC_DIRECTIONS)에서도 제거하세요").isEmpty();
    }

    @Test
    void detectsLongCyclesAndIgnoresDependenciesOutsideCycles() {
        Map<String, Set<String>> graph = Map.of(
                "a", Set.of("b"), "b", Set.of("c"), "c", Set.of("a"),
                "entry", Set.of("a"), "leaf", Set.of());
        assertThat(cyclicDirections(graph)).containsExactly("a->b", "b->c", "c->a");
        assertThat(cyclicDirections(Map.of(
                "a", Set.of("b"), "b", Set.of("c"), "c", Set.of("d"), "d", Set.of("a"))))
                .containsExactly("a->b", "b->c", "c->d", "d->a");
        assertThat(cyclicDirections(Map.of("a", Set.of("b"), "b", Set.of("c")))).isEmpty();

        // 이미 순환하는 A⇄B에 C를 연결하는 새 방향도 놓치지 않는다.
        Set<String> extended = cyclicDirections(Map.of(
                "a", Set.of("b"), "b", Set.of("a", "c"), "c", Set.of("a")));
        extended.removeAll(Set.of("a->b", "b->a"));
        assertThat(extended).containsExactly("b->c", "c->a");
    }

    private static Set<String> cyclicDirections(Map<String, Set<String>> edges) {
        Set<String> directions = new TreeSet<>();
        edges.forEach((from, targets) -> targets.forEach(to -> {
            if (!from.equals(to) && reaches(edges, to, from)) directions.add(from + "->" + to);
        }));
        return directions;
    }

    private static boolean reaches(Map<String, Set<String>> edges, String start, String target) {
        var pending = new ArrayDeque<String>();
        var visited = new HashSet<String>();
        pending.add(start);
        while (!pending.isEmpty()) {
            String module = pending.removeFirst();
            if (module.equals(target)) return true;
            if (visited.add(module)) pending.addAll(edges.getOrDefault(module, Set.of()));
        }
        return false;
    }

    private static String moduleOf(JavaClass javaClass) {
        String name = javaClass.getPackageName();
        if (!name.startsWith(ROOT)) return null;
        String rest = name.substring(ROOT.length());
        int dot = rest.indexOf('.');
        return dot < 0 ? rest : rest.substring(0, dot);
    }
}
