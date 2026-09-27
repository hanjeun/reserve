package kr.it.reserve.chat.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 채팅 첫 안내 설정 — 공지사항·인사말·(고객지원) 표시 이름·사진·자동 문답 (2026-09-23 신설, 09-24 채팅 관리로 확장).
 *
 * <p>고객지원 한 벌(scope_key = {@code SUPPORT})과 가게마다 한 벌(scope_key = {@code STORE:가게ID})을
 * 같은 모양으로 저장한다. 손님 화면·사장님 설정·관리자 설정이 모두 같은 컴포넌트를 쓰기 때문이다.
 *
 * <p>scope_key 를 따로 두는 이유 — store_id 를 NULL 로 고객지원을 표시하면 MySQL 의 UNIQUE 는
 * NULL 을 여러 개 허용해서 "고객지원 설정이 두 벌" 생길 수 있다. 문자열 키 하나로 유일성을 DB 가 보장한다.
 */
@Entity
@Table(name = "chat_intro",
        uniqueConstraints = @UniqueConstraint(name = "uk_chat_intro_scope", columnNames = "scope_key"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatIntro {

    public static final String SUPPORT_SCOPE = "SUPPORT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "scope_key", length = 40, nullable = false, updatable = false)
    private String scopeKey;

    /** 가게 안내일 때만 채운다. 고객지원은 NULL. */
    @Column(name = "store_id", updatable = false)
    private Long storeId;

    /**
     * 대화창 맨 위 확성기 줄의 공지사항. 비어 있으면 화면이 "안녕하세요. {이름}입니다." 를 보인다.
     * (2026-09-24 인사말 → 공지사항. 배포 전이라 컬럼을 새 이름으로 바꿨다 — 로컬 DB 에 남은 greeting 컬럼은 쓰지 않는다.)
     */
    @Column(name = "notice", length = 100)
    private String notice;

    /** 인사말 본문. {이름} 은 손님 이름으로 바뀐다. 비어 있으면 화면이 범위별 기본 문구를 쓴다. */
    @Column(name = "greeting", length = 200)
    private String greeting;

    /** 표시 이름·사진 — 고객지원만 쓴다. 가게는 가게 이름·대표 사진을 따른다(사칭 방지). */
    @Column(name = "display_name", length = 30)
    private String displayName;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    /** 최대 5개라 즉시 읽는다. 순서는 sort_order 로 보존한다. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "chat_intro_item", joinColumns = @JoinColumn(name = "chat_intro_id"))
    @OrderColumn(name = "sort_order")
    private List<ChatIntroItem> items = new ArrayList<>();

    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    /**
     * 수정 시각은 직접 기록한다 — 문답 목록만 바뀌면 엔티티 자체 컬럼은 그대로라
     * JPA 감사(@LastModifiedDate)가 갱신을 감지하지 못한다.
     */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    private ChatIntro(String scopeKey, Long storeId) {
        this.scopeKey = scopeKey;
        this.storeId = storeId;
    }

    public static ChatIntro forSupport() {
        return new ChatIntro(SUPPORT_SCOPE, null);
    }

    public static ChatIntro forStore(Long storeId) {
        return new ChatIntro(storeScope(storeId), storeId);
    }

    public static String storeScope(Long storeId) {
        return "STORE:" + storeId;
    }

    /** 설정은 항상 통째로 바꾼다. 부분 수정 API 를 두지 않아 순서·개수 규칙이 한 곳에서만 검사된다. */
    public void replace(String notice, String greeting, String displayName, String avatarUrl,
                        List<ChatIntroItem> items, Long memberId) {
        this.notice = notice;
        this.greeting = greeting;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
        this.items.clear();
        this.items.addAll(items);
        this.updatedByMemberId = memberId;
        this.updatedAt = LocalDateTime.now();
    }
}
