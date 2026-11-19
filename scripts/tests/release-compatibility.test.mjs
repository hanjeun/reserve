import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'reserve-release-contract-test-'));
const verifier = fileURLToPath(new URL('../../backend/tools/VerifyReleaseCompatibility.java', import.meta.url));
const environment = { ...process.env, JAVA_TOOL_OPTIONS: '', _JAVA_OPTIONS: '', JDK_JAVA_OPTIONS: '' };
const sources = new Map();
function source(name, body) {
    const split = name.lastIndexOf('.');
    sources.set(name.replaceAll('.', '/') + '.java', `package ${name.slice(0, split)};\n${body}\n`);
}
function execute(command, args, expected = 0) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 45000, env: environment });
    assert.ifError(result.error);
    if (expected !== null) assert.equal(result.status, expected, result.stdout + result.stderr);
    return result;
}
function javaFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? javaFiles(join(directory, entry.name)) : entry.name.endsWith('.java') ? [join(directory, entry.name)] : []);
}

source('jakarta.persistence.Column', 'import java.lang.annotation.*; @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.FIELD) public @interface Column { String name(); boolean nullable() default true; int length() default 255; }');
source('jakarta.persistence.EntityManager', 'public interface EntityManager { void flush(); void detach(Object value); void refresh(Object value, Object lock); Object getReference(Class<?> type, Object id); }');
source('org.springframework.data.jpa.repository.Query', 'import java.lang.annotation.*; @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) public @interface Query { String value(); }');
source('org.springframework.data.jpa.repository.Modifying', 'import java.lang.annotation.*; @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) public @interface Modifying {}');
source('org.springframework.data.domain.Page', 'public final class Page { public static Page empty() { return new Page(); } }');
source('org.springframework.http.HttpStatus', 'public enum HttpStatus { NOT_FOUND(404), FORBIDDEN(403), CONFLICT(409); private final int code; HttpStatus(int code) {this.code=code;} public int value(){return code;} }');
source('kr.it.reserve.member.entity.Member', 'public class Member { public Long id; public String name; public boolean termsAgreed; public Long getId(){return id;} public String getName(){return name;} }');
source('kr.it.reserve.store.entity.Store', 'public class Store { public Long id; public String name; public Long getId(){return id;} public String getName(){return name;} }');
source('kr.it.reserve.reservation.entity.Reservation', `import jakarta.persistence.Column; import kr.it.reserve.member.entity.Member; import kr.it.reserve.store.entity.Store;
public class Reservation { public enum ReservationStatus { COMPLETED } public Long id; public Member member; public Store store; public ReservationStatus status;
@Column(name="review_written",nullable=false) public boolean reviewWritten; public boolean isReviewWritten(){return reviewWritten;} public void setReviewWritten(boolean value){reviewWritten=value;} }`);
source('kr.it.reserve.review.entity.Review', `import jakarta.persistence.Column; import kr.it.reserve.member.entity.Member; import kr.it.reserve.store.entity.Store; import kr.it.reserve.reservation.entity.Reservation;
public class Review { public Long id; public Member member; public Store store; public Reservation reservation; public Integer rating; public String title; public String content;
@Column(name="author_alias",length=30) public String authorAlias; public String getAuthorAlias(){return authorAlias;} }`);
source('kr.it.reserve.feed.entity.FeedProfile', `import jakarta.persistence.Column; import kr.it.reserve.member.entity.Member;
public class FeedProfile { public enum Visibility { PUBLIC, MEMBERS, PRIVATE } public Long id; public Member member; public String publicId; public String nickname; public String nicknameKey;
@Column(name="profile_visibility",length=16) public Visibility visibility; public String getPublicId(){return publicId;} }`);
source('kr.it.reserve.reservation.repository.ReservationRepository', `import java.util.Optional; import kr.it.reserve.reservation.entity.Reservation; import org.springframework.data.jpa.repository.*;
public interface ReservationRepository {
@Modifying @Query("UPDATE Reservation r SET r.reviewWritten = true WHERE r.id = :id AND r.reviewWritten = false") int consumeReviewVisit(Long id);
@Query("SELECT r FROM Reservation r WHERE r.reviewWritten = false") Object findReviewableVisits();
Optional<Reservation> findById(Long id); Optional<Reservation> findByIdForPaymentUpdate(Long id); }`);
source('kr.it.reserve.review.repository.ReviewRepository', `import java.util.Optional; import kr.it.reserve.review.entity.Review; import org.springframework.data.jpa.repository.Query;
public interface ReviewRepository { interface MutationScope {Long getStoreId(); Long getReservationId();}
@Query("SELECT r FROM Review r WHERE r.authorAlias IS NULL") Object findPublishedProfileReviews();
boolean existsByReservationId(Long id); Review saveAndFlush(Review review); Optional<Review> findForUpdate(Long id); Optional<MutationScope> findMutationScope(Long id); void delete(Review review); }`);
source('kr.it.reserve.store.repository.StoreRepository', 'import java.util.Optional; import kr.it.reserve.store.entity.Store; public interface StoreRepository {Optional<Store> findByIdForUpdate(Long id); int updateReviewRating(Long id);}');
source('kr.it.reserve.member.repository.MemberRepository', 'import java.util.Optional; import kr.it.reserve.member.entity.Member; public interface MemberRepository {Optional<Member> findByIdAndDeletedAtIsNull(Long id); Optional<Member> findByIdForPaymentUpdate(Long id);}');
source('kr.it.reserve.feed.repository.FeedProfileRepository', 'import java.util.*; import kr.it.reserve.feed.entity.FeedProfile; public interface FeedProfileRepository {List<FeedProfile> findByMember_IdIn(Collection<Long> ids); Optional<FeedProfile> findByPublicId(String id);}');
source('kr.it.reserve.feed.repository.FeedPostRepository', 'import org.springframework.data.domain.Page; public interface FeedPostRepository {Page findAll();}');
source('kr.it.reserve.feed.repository.FeedCommentRepository', 'import org.springframework.data.domain.Page; public interface FeedCommentRepository {Page publishedByProfile();}');
source('kr.it.reserve.feed.service.ProfileReviewReader', 'import org.springframework.data.domain.Page; public interface ProfileReviewReader {Page findPublished();}');
source('kr.it.reserve.review.dto.PublicReviewAuthor', 'public interface PublicReviewAuthor {String nickname(); String publicId(); String avatarUrl();}');
source('kr.it.reserve.review.dto.ReviewInteractionResponse', 'public final class ReviewInteractionResponse {public record Summary() { public static final Summary EMPTY=new Summary(); }}');
source('kr.it.reserve.review.dto.ReviewCreateRequest', 'public class ReviewCreateRequest {public Long reservationId; public Integer rating; public String title; public String content; public String authorAlias;}');
source('kr.it.reserve.review.dto.ReviewResponse', `import kr.it.reserve.review.entity.Review;
public class ReviewResponse {private String memberName; private String authorPublicId; private String authorAvatarUrl; private Long memberId; private Long reservationId;
public static ReviewResponse fromEntity(Review review,PublicReviewAuthor author,boolean mine,ReviewInteractionResponse.Summary summary){
ReviewResponse result=new ReviewResponse(); result.memberName=review.authorAlias!=null?review.authorAlias:author==null?"Visitor":author.nickname();
result.authorPublicId=review.authorAlias!=null||author==null?null:author.publicId(); result.authorAvatarUrl=review.authorAlias!=null||author==null?null:author.avatarUrl();
result.memberId=mine?review.member.id:null; result.reservationId=mine?review.reservation.id:null; return result;}
public String getMemberName(){return memberName;} public String getAuthorPublicId(){return authorPublicId;} public String getAuthorAvatarUrl(){return authorAvatarUrl;}
public Long getMemberId(){return memberId;} public Long getReservationId(){return reservationId;} }`);
source('kr.it.reserve.feed.FeedPolicy', 'public final class FeedPolicy {public FeedPolicy(boolean enabled){if(!enabled)throw new IllegalStateException();}}');
for (const name of ['kr.it.reserve.feed.FeedException', 'kr.it.reserve.global.error.ReviewException']) {
    source(name, `import org.springframework.http.HttpStatus; public class ${name.split('.').at(-1)} extends RuntimeException {private final HttpStatus status; public ${name.split('.').at(-1)}(HttpStatus status){this.status=status;} public HttpStatus getStatus(){return status;} }`);
}
source('kr.it.reserve.feed.service.FeedService', `import java.util.*; import kr.it.reserve.feed.*; import kr.it.reserve.feed.entity.FeedProfile; import kr.it.reserve.feed.repository.*; import kr.it.reserve.member.entity.Member; import kr.it.reserve.member.repository.MemberRepository; import org.springframework.data.domain.Page; import org.springframework.http.HttpStatus;
public class FeedService {private final FeedProfileRepository profiles; private final FeedPostRepository posts; private final FeedCommentRepository comments; private final ProfileReviewReader reviews;
public FeedService(FeedPolicy policy,FeedProfileRepository profiles,FeedPostRepository posts,FeedCommentRepository comments,ProfileReviewReader reviews,MemberRepository members){this.profiles=profiles;this.posts=posts;this.comments=comments;this.reviews=reviews;}
public Map<Long,Object> reviewAuthors(Collection<Long> ids,Member viewer){FeedProfile p=profiles.findByMember_IdIn(ids).getFirst();return p.visibility==FeedProfile.Visibility.PUBLIC||p.visibility==FeedProfile.Visibility.MEMBERS&&viewer!=null?Map.of(p.member.id,p):Map.of();}
private void scope(String id,Long viewer){FeedProfile p=profiles.findByPublicId(id).orElseThrow();if(!Objects.equals(viewer,p.member.id)){if(p.visibility==FeedProfile.Visibility.PRIVATE)throw new FeedException(HttpStatus.NOT_FOUND);if(p.visibility==FeedProfile.Visibility.MEMBERS&&viewer==null)throw new FeedException(HttpStatus.FORBIDDEN);}}
public Page authorPosts(String id,int page,int size,Long viewer){scope(id,viewer);return posts.findAll();}
public Page authorComments(String id,int page,int size,Long viewer){scope(id,viewer);return comments.publishedByProfile();}
public Page authorReviews(String id,int page,int size,Long viewer){scope(id,viewer);return reviews.findPublished();} }`);
source('kr.it.reserve.review.service.ReviewAuthorReader', 'import java.util.*; import kr.it.reserve.member.entity.Member; import kr.it.reserve.review.dto.PublicReviewAuthor; public interface ReviewAuthorReader {Map<Long,PublicReviewAuthor> reviewAuthors(Collection<Long> ids,Member viewer);}');
source('kr.it.reserve.review.service.ReviewPhotos', 'public class ReviewPhotos {}');
source('kr.it.reserve.review.service.ReviewInteractions', 'public class ReviewInteractions {}');
source('kr.it.reserve.review.service.ReviewMutationGuard', `import kr.it.reserve.review.repository.ReviewRepository; import kr.it.reserve.reservation.repository.ReservationRepository; import kr.it.reserve.store.repository.StoreRepository; import kr.it.reserve.member.repository.MemberRepository; import kr.it.reserve.reservation.entity.Reservation; import kr.it.reserve.global.error.ReviewException; import org.springframework.http.HttpStatus;
public class ReviewMutationGuard {private final ReservationRepository reservations; private jakarta.persistence.EntityManager entityManager;
public ReviewMutationGuard(ReviewRepository reviews,ReservationRepository reservations,StoreRepository stores,MemberRepository members){this.reservations=reservations;}
public void consumeVisit(Reservation reservation){if(reservations.consumeReviewVisit(reservation.id)!=1)throw new ReviewException(HttpStatus.CONFLICT);reservation.setReviewWritten(true);} }`);
source('kr.it.reserve.review.service.ReviewService', `import java.util.*; import kr.it.reserve.review.repository.ReviewRepository; import kr.it.reserve.reservation.repository.ReservationRepository; import kr.it.reserve.review.dto.ReviewCreateRequest; import kr.it.reserve.review.entity.Review; import kr.it.reserve.member.entity.Member; import kr.it.reserve.global.error.ReviewException; import org.springframework.http.HttpStatus;
public class ReviewService {private final ReviewRepository reviews; private final ReservationRepository reservations; private final ReviewMutationGuard mutations;
public ReviewService(ReviewRepository reviews,ReservationRepository reservations,ReviewMutationGuard mutations,ReviewPhotos photos,ReviewAuthorReader authors,ReviewInteractions interactions){this.reviews=reviews;this.reservations=reservations;this.mutations=mutations;}
public Object createReview(ReviewCreateRequest request,Member member,List<?> files){var reservation=reservations.findById(request.reservationId).orElseThrow();if(reservation.reviewWritten||reviews.existsByReservationId(reservation.id))throw new ReviewException(HttpStatus.CONFLICT);mutations.consumeVisit(reservation);Review review=new Review();review.reservation=reservation;return reviews.saveAndFlush(review);}
public void deleteReview(Long id,Member member){Review review=reviews.findForUpdate(id).orElseThrow();review.reservation.setReviewWritten(true);reviews.delete(review);}
public boolean canWriteReview(Long id,Member member){return !reservations.findById(id).orElseThrow().reviewWritten&&!reviews.existsByReservationId(id);} }`);

let validJar;
function jarFromClasses(name, classes) {
    const stage = join(root, name, 'stage');
    const destination = join(stage, 'BOOT-INF/classes');
    mkdirSync(destination, { recursive: true });
    cpSync(classes, destination, { recursive: true });
    const jar = join(root, name + '.jar');
    execute('jar', ['--create', '--file', jar, '-C', stage, '.']);
    return jar;
}
function variant(name, filename, replace) {
    const classes = join(root, name, 'classes');
    cpSync(join(root, 'valid/classes'), classes, { recursive: true });
    const sourcePath = join(root, name, 'source', filename);
    mkdirSync(dirname(sourcePath), { recursive: true });
    const original = sources.get(filename);
    const changed = replace(original);
    assert.notEqual(changed, original);
    writeFileSync(sourcePath, changed);
    execute('javac', ['--release', '21', '-cp', classes, '-d', classes, sourcePath]);
    return jarFromClasses(name, classes);
}
function verify(jar, contaminated = false) {
    const classpath = [join(root, 'verifier'), ...(contaminated ? [join(root, 'valid/classes')] : [])].join(process.platform === 'win32' ? ';' : ':');
    return execute('java', ['-Xmx96m', '-Djava.io.tmpdir=' + root, '-cp', classpath, 'VerifyReleaseCompatibility', jar], null);
}
before(() => {
    mkdirSync(join(root, 'verifier'));
    execute('javac', ['--release', '21', '-d', join(root, 'verifier'), verifier]);
    const sourceRoot = join(root, 'valid/source');
    for (const [filename, text] of sources) {
        const target = join(sourceRoot, filename); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text);
    }
    const classes = join(root, 'valid/classes'); mkdirSync(classes, { recursive: true });
    execute('javac', ['--release', '21', '-d', classes, ...javaFiles(sourceRoot)]);
    validJar = jarFromClasses('valid', classes);
});
after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('reserve-release-contract-test-'));
    rmSync(root, { recursive: true, force: true });
});

test('the actual JAR passes metadata and executable privacy, visibility and consumption probes', () => {
    const result = verify(validJar);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^PASS: review-profile-once-v1 jar_sha256=[a-f0-9]{64}\r?\n$/);
    assert.equal(readdirSync(root).some(name => name.startsWith('reserve-release-contract-')), false);
});
test('a representative v2.16.6 JAR fails even when compatible classes exist in the parent classpath', () => {
    const classes = join(root, 'legacy/classes'); mkdirSync(classes, { recursive: true });
    const original = join(root, 'legacy/Review.java');
    writeFileSync(original, 'package kr.it.reserve.review.entity; public class Review {public String memberName;}');
    execute('javac', ['--release', '21', '-d', classes, original]);
    const result = verify(jarFromClasses('legacy', classes), true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FAIL: review-profile-once-v1/);
    assert.doesNotMatch(result.stdout, /PASS:/);
});
for (const [name, filename, replace] of [
    ['an alias that still exposes a profile', 'kr/it/reserve/review/dto/ReviewResponse.java', text => text.replace('result.authorPublicId=review.authorAlias!=null||author==null?null:author.publicId()', 'result.authorPublicId=author==null?null:author.publicId()')],
    ['a private profile that remains readable', 'kr/it/reserve/feed/service/FeedService.java', text => text.replace('if(p.visibility==FeedProfile.Visibility.PRIVATE)throw new FeedException(HttpStatus.NOT_FOUND);', '')],
    ['a private profile exposed to other logged-in members', 'kr/it/reserve/feed/service/FeedService.java', text => text.replace('if(p.visibility==FeedProfile.Visibility.PRIVATE)throw', 'if(p.visibility==FeedProfile.Visibility.PRIVATE&&viewer==null)throw')],
    ['a review that is writable again after deletion', 'kr/it/reserve/review/service/ReviewService.java', text => text.replace('return !reservations.findById(id).orElseThrow().reviewWritten&&', 'return ')],
    ['a consumer that ignores a failed current-state update', 'kr/it/reserve/review/service/ReviewMutationGuard.java', text => text.replace('if(reservations.consumeReviewVisit(reservation.id)!=1)throw new ReviewException(HttpStatus.CONFLICT);', 'reservations.consumeReviewVisit(reservation.id);')],
    ['an unconditional review-written update', 'kr/it/reserve/reservation/repository/ReservationRepository.java', text => text.replace(' AND r.reviewWritten = false', '')],
]) test(`the same fields and methods cannot hide ${name}`, () => {
    const result = verify(variant(name.replaceAll(' ', '-'), filename, replace));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /FAIL: review-profile-once-v1/);
    assert.doesNotMatch(result.stdout + result.stderr, /Anonymous visitor|Private account name|Public visitor|PASS:/);
    assert.equal(readdirSync(root).some(entry => entry.startsWith('reserve-release-contract-')), false);
});
test('missing or malformed JARs fail without printing input paths or parser details', () => {
    const invalid = join(root, 'private-path-not-for-output.jar'); writeFileSync(invalid, 'invalid archive');
    for (const jar of [invalid, join(root, 'missing-private-path.jar')]) {
        const result = verify(jar);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout + result.stderr, /private-path|invalid archive|PASS:/);
    }
});
test('image verification refuses mutable references and propagates a failed recovery probe with isolation intact', () => {
    const wrapper = readFileSync(new URL('../check-release-compatibility-image.sh', import.meta.url), 'utf8');
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
    const image = 'sha256:' + 'a'.repeat(64);
    const recovery = 'sha256:' + 'b'.repeat(64);
    const run = (args, fail = '') => spawnSync(bash, ['-c', `docker() {
      [[ "$*" == *'--network none'* && "$*" == *'--read-only'* && "$*" == *'--entrypoint java'* && "$*" == *'VerifyReleaseCompatibility /app.jar'* ]] || return 91
      [[ "$*" != *"$TASK_FAIL_IMAGE"* || -z "$TASK_FAIL_IMAGE" ]] || return 42
    }
${wrapper}`, '_', ...args], { encoding: 'utf8', timeout: 5000, env: { ...environment, TASK_FAIL_IMAGE: fail } });
    assert.equal(run([image, recovery]).status, 0);
    assert.equal(run([image, recovery], recovery).status, 42);
    for (const args of [[], ['mutable:latest'], ['false'], ['true', image], [image, 'broken']]) {
        const result = run(args); assert.ifError(result.error); assert.notEqual(result.status, 0);
    }
    assert.ok(!existsSync(join(root, 'application-started')));
});
