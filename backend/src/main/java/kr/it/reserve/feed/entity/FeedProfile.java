package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "feed_profile", uniqueConstraints = {
    @UniqueConstraint(name = "uk_feed_profile_member", columnNames = "member_id"),
    @UniqueConstraint(name = "uk_feed_profile_public", columnNames = "public_id"),
    @UniqueConstraint(name = "uk_feed_profile_nickname", columnNames = "nickname_key")
})
@Getter @NoArgsConstructor
public class FeedProfile implements kr.it.reserve.promotion.entity.NewsPublication.PublicProfile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "profile_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "member_id", nullable = false) private Member member;
    @Column(name = "public_id", nullable = false, length = 36, updatable = false) private String publicId;
    @Column(nullable = false, length = 30) private String nickname;
    @Column(name = "nickname_key", nullable = false, length = 120) private String nicknameKey;
    @Column(length = 160) private String bio;
    @Column(name = "use_account_avatar", nullable = false) private boolean useAccountAvatar;
    @Column(name = "custom_avatar_key", length = 1024) private String customAvatarKey;
    @Column(nullable = false) private boolean hidden;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    public static FeedProfile create(Member member, LocalDateTime now) {
        FeedProfile profile = new FeedProfile();
        profile.member = member; profile.publicId = UUID.randomUUID().toString(); profile.createdAt = now;
        return profile;
    }
    /** 사진 소유권을 보존하는 내부 행. 닉네임을 설정하기 전에는 공개 프로필로 사용하지 않는다. */
    public static FeedProfile mediaOwner(Member member, LocalDateTime now) {
        FeedProfile profile = create(member, now);
        profile.update("", "private-media:" + profile.publicId, "", false, now);
        return profile;
    }
    public boolean isConfigured() { return nickname != null && !nickname.isBlank(); }
    public void update(String nickname, String key, String bio, boolean avatar, LocalDateTime now) {
        this.nickname = nickname; nicknameKey = key; this.bio = bio; useAccountAvatar = avatar; updatedAt = now;
    }
    public void changeAvatar(boolean accountAvatar, String customKey, LocalDateTime now) {
        if (accountAvatar && customKey != null) throw new IllegalArgumentException("Avatar sources are exclusive");
        useAccountAvatar = accountAvatar; customAvatarKey = customKey; updatedAt = now;
    }
    public void withdraw(LocalDateTime now) {
        hidden = true; nickname = "탈퇴한 회원"; nicknameKey = "withdrawn:" + publicId;
        bio = null; useAccountAvatar = false; customAvatarKey = null; updatedAt = now;
    }
}
