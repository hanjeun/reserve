import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.jar.JarFile;

/** 운영 설정·Spring·DB 없이 실제 JAR의 공개 범위와 리뷰 작성 이력 계약을 검사해요. */
public final class VerifyReleaseCompatibility {
    private static final String CAPABILITY = "review-profile-once-v1";
    private static final String ROOT = "kr.it.reserve.";
    private static final long MAX_BYTES = 512L * 1024 * 1024;
    private final ClassLoader loader;

    private VerifyReleaseCompatibility(ClassLoader loader) { this.loader = loader; }

    public static void main(String[] args) {
        String boundary = "input";
        try {
            if (args.length != 1) throw new IllegalArgumentException("Expected one release JAR");
            Path release = Path.of(args[0]).toRealPath();
            if (!Files.isRegularFile(release) || Files.size(release) > MAX_BYTES) throw new IOException("Invalid JAR");
            Path temporary = Files.createTempDirectory("reserve-release-contract-");
            try {
                List<URL> urls = dependencies(release, temporary);
                // 테스트나 도구의 클래스 경로가 구버전 JAR의 누락된 구현을 대신하지 못하게 해요.
                try (var classes = new URLClassLoader(urls.toArray(URL[]::new), ClassLoader.getPlatformClassLoader())) {
                    var verifier = new VerifyReleaseCompatibility(classes);
                    boundary = "mapping";
                    verifier.mappingContract();
                    boundary = "author-privacy";
                    verifier.authorPrivacy();
                    boundary = "profile-visibility";
                    verifier.profileVisibility();
                    boundary = "single-visit";
                    verifier.singleVisit();
                }
            } finally {
                try (var paths = Files.walk(temporary)) {
                    for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
                }
            }
            try (var input = Files.newInputStream(release)) {
                var digest = MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
                System.out.println("PASS: " + CAPABILITY + " jar_sha256=" + HexFormat.of().formatHex(digest.digest()));
            }
        } catch (Exception | LinkageError failure) {
            // 리플렉션 예외에도 합성 입력이나 외부 값이 담길 수 있어 원문은 출력하지 않아요.
            System.err.println("FAIL: " + CAPABILITY + " boundary=" + boundary + " (" + failure.getClass().getSimpleName() + ")");
            System.exit(1);
        }
    }

    private static List<URL> dependencies(Path release, Path temporary) throws Exception {
        List<URL> urls = new ArrayList<>();
        urls.add(URI.create("jar:" + release.toUri().toURL() + "!/BOOT-INF/classes/").toURL());
        long extracted = 0;
        int libraries = 0;
        try (var jar = new JarFile(release.toFile())) {
            var entries = jar.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                if (!entry.getName().matches("BOOT-INF/lib/[^/]+\\.jar")) continue;
                if (++libraries > 512 || entry.getSize() < 0 || entry.getSize() > MAX_BYTES - extracted) {
                    throw new IOException("Dependency budget exceeded");
                }
                Path library = temporary.resolve(libraries + ".jar");
                try (var input = jar.getInputStream(entry); var output = Files.newOutputStream(library)) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (count > MAX_BYTES - extracted) throw new IOException("Dependency budget exceeded");
                        extracted += count;
                        output.write(buffer, 0, count);
                    }
                }
                urls.add(library.toUri().toURL());
            }
        }
        return urls;
    }

    private void mappingContract() throws Exception {
        column("review.entity.Review", "authorAlias", String.class, "author_alias", true, 30);
        column("reservation.entity.Reservation", "reviewWritten", boolean.class, "review_written", false, null);
        Class<?> visibility = type("feed.entity.FeedProfile$Visibility");
        check(List.of(visibility.getEnumConstants()).stream().map(Object::toString).toList()
                .equals(List.of("PUBLIC", "MEMBERS", "PRIVATE")));
        column("feed.entity.FeedProfile", "visibility", visibility, "profile_visibility", true, 16);
        Method consume = type("reservation.repository.ReservationRepository").getMethod("consumeReviewVisit", Long.class);
        check(consume.getReturnType() == int.class);
        check(query(consume).equals("UPDATERESERVATIONRSETR.REVIEWWRITTEN=TRUEWHERER.ID=:IDANDR.REVIEWWRITTEN=FALSE"));
        check(annotation(consume, "org.springframework.data.jpa.repository.Modifying") != null);
        Method reviewable = method(type("reservation.repository.ReservationRepository"), "findReviewableVisits");
        check(query(reviewable).contains("R.REVIEWWRITTEN=FALSE"));
        Method published = method(type("review.repository.ReviewRepository"), "findPublishedProfileReviews");
        check(query(published).contains("R.AUTHORALIASISNULL"));
    }

    private void authorPrivacy() throws Exception {
        Object member = member(11L);
        Object store = model("store.entity.Store", "id", 12L, "name", "Example store");
        Object reservation = model("reservation.entity.Reservation", "id", 13L);
        Object review = model("review.entity.Review", "id", 14L, "member", member, "store", store,
                "reservation", reservation, "rating", 5, "title", "Example", "content", "Example review");
        Class<?> author = type("review.dto.PublicReviewAuthor");
        Object profile = proxy(author, (method, values) -> switch (method.getName()) {
            case "nickname" -> "Public visitor";
            case "publicId" -> "00000000-0000-0000-0000-000000000011";
            case "avatarUrl" -> "/example-avatar";
            default -> unexpected();
        });
        Class<?> summary = type("review.dto.ReviewInteractionResponse$Summary");
        Method from = type("review.dto.ReviewResponse").getMethod("fromEntity", review.getClass(), author, boolean.class, summary);
        set(review, "authorAlias", "Anonymous visitor");
        for (boolean mine : List.of(false, true)) {
            Object response = from.invoke(null, review, profile, mine, summary.getField("EMPTY").get(null));
            check("Anonymous visitor".equals(call(response, "getMemberName")));
            check(call(response, "getAuthorPublicId") == null && call(response, "getAuthorAvatarUrl") == null);
            check(mine || call(response, "getMemberId") == null && call(response, "getReservationId") == null);
        }
        set(review, "authorAlias", null);
        Object response = from.invoke(null, review, profile, false, summary.getField("EMPTY").get(null));
        check("Public visitor".equals(call(response, "getMemberName")));
        check(call(response, "getAuthorPublicId") != null && call(response, "getAuthorAvatarUrl") != null);
        Object privateResponse = from.invoke(null, review, null, false, summary.getField("EMPTY").get(null));
        check(call(privateResponse, "getAuthorPublicId") == null && call(privateResponse, "getAuthorAvatarUrl") == null);
        check(!call(member, "getName").equals(call(privateResponse, "getMemberName")));
    }

    private void profileVisibility() throws Exception {
        Object member = member(21L);
        Object otherMember = member(23L);
        Object profile = model("feed.entity.FeedProfile", "id", 22L, "member", member,
                "publicId", "00000000-0000-0000-0000-000000000021", "nickname", "Public visitor", "nicknameKey", "public visitor");
        Object emptyPage = type("org.springframework.data.domain.Page").getMethod("empty").invoke(null);
        Map<String, Object> dependencies = new LinkedHashMap<>();
        dependencies.put(ROOT + "feed.FeedPolicy", type("feed.FeedPolicy").getConstructor(boolean.class).newInstance(true));
        dependencies.put(ROOT + "feed.repository.FeedProfileRepository", proxy(type("feed.repository.FeedProfileRepository"), (method, values) -> switch (method.getName()) {
            case "findByMember_IdIn" -> List.of(profile);
            case "findByPublicId" -> Optional.of(profile);
            default -> unexpected();
        }));
        dependencies.put(ROOT + "member.repository.MemberRepository", proxy(type("member.repository.MemberRepository"), (method, values) -> {
            check(method.getName().equals("findByIdAndDeletedAtIsNull"));
            return Optional.of(values[0].equals(21L) ? member : otherMember);
        }));
        for (String repository : List.of("feed.repository.FeedPostRepository", "feed.repository.FeedCommentRepository", "feed.service.ProfileReviewReader")) {
            dependencies.put(ROOT + repository, proxy(type(repository), (method, values) -> emptyPage));
        }
        Object feeds = construct(type("feed.service.FeedService"), dependencies);
        Method authors = feeds.getClass().getMethod("reviewAuthors", Collection.class, member.getClass());
        String address = (String) call(profile, "getPublicId");
        for (String scope : List.of("PRIVATE", "MEMBERS", "PUBLIC")) {
            set(profile, "visibility", enumValue("feed.entity.FeedProfile$Visibility", scope));
            check(((Map<?, ?>) authors.invoke(feeds, List.of(21L), null)).isEmpty() == !scope.equals("PUBLIC"));
            check(((Map<?, ?>) authors.invoke(feeds, List.of(21L), otherMember)).isEmpty() == scope.equals("PRIVATE"));
            for (String activity : List.of("authorPosts", "authorComments", "authorReviews")) {
                Method read = feeds.getClass().getMethod(activity, String.class, int.class, int.class, Long.class);
                if (scope.equals("PRIVATE")) expectStatus(() -> read.invoke(feeds, address, 0, 12, null), "feed.FeedException", 404);
                else if (scope.equals("MEMBERS")) expectStatus(() -> read.invoke(feeds, address, 0, 12, null), "feed.FeedException", 403);
                else check(read.invoke(feeds, address, 0, 12, null) != null);
                if (scope.equals("PRIVATE")) expectStatus(() -> read.invoke(feeds, address, 0, 12, 23L), "feed.FeedException", 404);
                else check(read.invoke(feeds, address, 0, 12, 23L) != null);
                check(read.invoke(feeds, address, 0, 12, 21L) != null);
            }
        }
    }

    private void singleVisit() throws Exception {
        Object member = member(31L);
        Object store = model("store.entity.Store", "id", 32L, "name", "Example store");
        Object reservation = model("reservation.entity.Reservation", "id", 33L, "member", member, "store", store,
                "status", enumValue("reservation.entity.Reservation$ReservationStatus", "COMPLETED"));
        AtomicBoolean consumed = new AtomicBoolean();
        AtomicReference<Object> saved = new AtomicReference<>();
        Object reservations = proxy(type("reservation.repository.ReservationRepository"), (method, values) -> switch (method.getName()) {
            case "consumeReviewVisit" -> consumed.compareAndSet(false, true) ? 1 : 0;
            case "findById", "findByIdForPaymentUpdate" -> Optional.of(reservation);
            default -> unexpected();
        });
        Object scope = proxy(type("review.repository.ReviewRepository$MutationScope"), (method, values) ->
                method.getName().equals("getStoreId") ? 32L : method.getName().equals("getReservationId") ? 33L : unexpected());
        Object reviews = proxy(type("review.repository.ReviewRepository"), (method, values) -> switch (method.getName()) {
            case "existsByReservationId" -> saved.get() != null;
            case "saveAndFlush" -> { set(values[0], "id", 34L); saved.set(values[0]); yield values[0]; }
            case "findMutationScope" -> Optional.of(scope);
            case "findForUpdate" -> Optional.ofNullable(saved.get());
            case "delete" -> { saved.set(null); yield null; }
            default -> unexpected();
        });
        Object stores = proxy(type("store.repository.StoreRepository"), (method, values) -> switch (method.getName()) {
            case "findByIdForUpdate" -> Optional.of(store);
            case "updateReviewRating" -> 1;
            default -> unexpected();
        });
        Object members = proxy(type("member.repository.MemberRepository"), (method, values) -> {
            check(method.getName().equals("findByIdForPaymentUpdate")); return Optional.of(member);
        });
        Map<String, Object> dependencies = new LinkedHashMap<>();
        for (Object dependency : List.of(reservations, reviews, stores, members)) dependencies.put(dependency.getClass().getInterfaces()[0].getName(), dependency);
        Object mutations = construct(type("review.service.ReviewMutationGuard"), dependencies);
        set(mutations, "entityManager", proxy(type("jakarta.persistence.EntityManager"), (method, values) -> switch (method.getName()) {
            case "flush", "detach", "refresh" -> null;
            case "getReference" -> values[0] == member.getClass() ? member : values[0] == store.getClass() ? store : reservation;
            default -> unexpected();
        }));
        dependencies.put(mutations.getClass().getName(), mutations);
        dependencies.put(ROOT + "review.service.ReviewPhotos", construct(type("review.service.ReviewPhotos"), Map.of()));
        dependencies.put(ROOT + "review.service.ReviewAuthorReader", proxy(type("review.service.ReviewAuthorReader"), (method, values) -> Map.of()));
        Object service = construct(type("review.service.ReviewService"), dependencies);
        Object request = model("review.dto.ReviewCreateRequest", "reservationId", 33L, "rating", 5,
                "title", "Example", "content", "Example review", "authorAlias", "Anonymous visitor");
        Method create = service.getClass().getMethod("createReview", request.getClass(), member.getClass(), List.class);
        create.invoke(service, request, member, List.of());
        check(consumed.get() && Boolean.TRUE.equals(call(reservation, "isReviewWritten")) && saved.get() != null);
        service.getClass().getMethod("deleteReview", Long.class, member.getClass()).invoke(service, 34L, member);
        check(saved.get() == null && Boolean.TRUE.equals(call(reservation, "isReviewWritten")));
        check(Boolean.FALSE.equals(service.getClass().getMethod("canWriteReview", Long.class, member.getClass()).invoke(service, 33L, member)));
        expectStatus(() -> create.invoke(service, request, member, List.of()), "global.error.ReviewException", 409);
        // 과거 관리 객체의 값이 false여도 현재 DB 값을 소비하는 관문은 다시 통과할 수 없어야 해요.
        set(reservation, "reviewWritten", false);
        expectStatus(() -> mutations.getClass().getMethod("consumeVisit", reservation.getClass()).invoke(mutations, reservation), "global.error.ReviewException", 409);
    }

    private Object member(long id) throws Exception {
        return model("member.entity.Member", "id", id, "name", "Private account name", "termsAgreed", true);
    }

    private Class<?> type(String name) throws ClassNotFoundException {
        String fullName = name.startsWith("kr.") || name.startsWith("org.") || name.startsWith("jakarta.") ? name : ROOT + name;
        Class<?> result = Class.forName(fullName, false, loader);
        check(result.getClassLoader() == loader);
        return result;
    }

    private Object enumValue(String name, String value) throws Exception {
        for (Object candidate : type(name).getEnumConstants()) if (candidate.toString().equals(value)) return candidate;
        throw new IllegalStateException("Missing enum value");
    }

    private Object model(String name, Object... fields) throws Exception {
        Constructor<?> constructor = type(name).getDeclaredConstructor();
        constructor.setAccessible(true);
        Object model = constructor.newInstance();
        for (int i = 0; i < fields.length; i += 2) set(model, (String) fields[i], fields[i + 1]);
        return model;
    }

    private static void set(Object model, String name, Object value) throws ReflectiveOperationException {
        Field field = model.getClass().getDeclaredField(name);
        field.setAccessible(true); field.set(model, value);
    }

    private static Object call(Object target, String name) throws ReflectiveOperationException { return target.getClass().getMethod(name).invoke(target); }

    private void column(String owner, String name, Class<?> valueType, String column, boolean nullable, Integer length) throws Exception {
        Field field = type(owner).getDeclaredField(name);
        check(field.getType() == valueType);
        Annotation mapping = annotation(field, "jakarta.persistence.Column");
        check(mapping != null && column.equals(call(mapping, "name")) && Boolean.valueOf(nullable).equals(call(mapping, "nullable")));
        if (length != null) check(length.equals(call(mapping, "length")));
    }

    private static Annotation annotation(java.lang.reflect.AnnotatedElement element, String name) {
        for (Annotation annotation : element.getDeclaredAnnotations()) if (annotation.annotationType().getName().equals(name)) return annotation;
        return null;
    }

    private static String query(Method method) throws Exception {
        Annotation query = annotation(method, "org.springframework.data.jpa.repository.Query");
        check(query != null);
        return ((String) call(query, "value")).replaceAll("\\s+", "").toUpperCase(java.util.Locale.ROOT);
    }

    private static Method method(Class<?> owner, String name) {
        return List.of(owner.getMethods()).stream().filter(method -> method.getName().equals(name)).findFirst().orElseThrow();
    }

    private Object proxy(Class<?> contract, CheckedFunction handler) {
        return Proxy.newProxyInstance(loader, new Class<?>[]{contract}, (proxy, method, values) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) {
                case "toString" -> "synthetic-contract-proxy";
                case "hashCode" -> System.identityHashCode(proxy);
                case "equals" -> proxy == values[0];
                default -> unexpected();
            };
            return handler.apply(method, values);
        });
    }

    private static Object construct(Class<?> type, Map<String, Object> values) throws Exception {
        Constructor<?> constructor = List.of(type.getConstructors()).stream().max(Comparator.comparingInt(Constructor::getParameterCount)).orElseThrow();
        return constructor.newInstance(List.of(constructor.getParameterTypes()).stream().map(parameter -> values.get(parameter.getName())).toArray());
    }

    private void expectStatus(CheckedAction action, String exception, int status) throws Exception {
        try { action.run(); } catch (InvocationTargetException failure) {
            Throwable cause = failure.getCause();
            check(type(exception).isInstance(cause));
            check(Integer.valueOf(status).equals(call(call(cause, "getStatus"), "value")));
            return;
        }
        throw new IllegalStateException("Missing policy rejection");
    }

    private static Object unexpected() { throw new IllegalStateException("Unexpected external interaction"); }
    private static void check(boolean condition) { if (!condition) throw new IllegalStateException("Release contract differs"); }
    @FunctionalInterface private interface CheckedFunction { Object apply(Method method, Object[] values) throws Exception; }
    @FunctionalInterface private interface CheckedAction { void run() throws Exception; }
}
