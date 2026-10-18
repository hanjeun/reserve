package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.feed.repository.FeedPostRepository;
import kr.it.reserve.feed.repository.FeedProfileRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.FileException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedProfileAvatarBoundaryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-15T03:00:00");
    private static final String PREFIX = "users/7/feed/profiles";
    private static final String OLD = "local/users/7/feed/profiles/old.png";
    private static final String NEW = "local/users/7/feed/profiles/new.png";
    private static final String ACCOUNT = "https://cdn.example.test/local/users/7/profiles/account.png";
    @Mock FeedPolicy policy;
    @Mock FeedProfileRepository profiles;
    @Mock FeedPostRepository posts;
    @Mock MemberRepository members;
    @Mock FileStorageService storage;
    @Mock FileDeletionOutboxService fileDeletions;
    @InjectMocks FeedService feeds;

    @Test void omittedAvatarFieldsAreDistinctFromLegacyOptOut() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        var omitted = mapper.readValue("{\"nickname\":\"공개 이름\",\"bio\":\"\"}", FeedDto.ProfileRequest.class);
        var optedOut = mapper.readValue("{\"nickname\":\"공개 이름\",\"useAccountAvatar\":false}", FeedDto.ProfileRequest.class);
        assertThat(omitted.useAccountAvatar()).isNull();
        assertThat(omitted.avatarSource()).isNull();
        assertThat(optedOut.useAccountAvatar()).isFalse();
        assertThatThrownBy(() -> mapper.readValue("{\"nickname\":\"이름\",\"avatarSource\":\"https://other.test/photo.png\"}",
                FeedDto.ProfileRequest.class)).isInstanceOf(com.fasterxml.jackson.databind.JsonMappingException.class);
    }

    @Test void firstSaveDefaultsToAccountPhoto() {
        Member member = writer();
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.empty());
        when(storage.isManagedFileUnderPrefix(ACCOUNT, FileStoragePaths.userProfile(7L))).thenReturn(true);

        var result = feeds.updateProfile(7L, request(null));

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.ACCOUNT);
        assertThat(result.avatarUrl()).isEqualTo(ACCOUNT);
        assertThat(member.getProfileImage()).isEqualTo(ACCOUNT);
        verifyNoInteractions(fileDeletions);
    }

    @Test void editingExistingOptOutNeverPublishesAccountPhotoByDefault() {
        FeedProfile profile = configured(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));

        var result = feeds.updateProfile(7L, request(null));

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.NONE);
        assertThat(result.avatarUrl()).isNull();
        assertThat(profile.isUseAccountAvatar()).isFalse();
        verifyNoInteractions(storage, fileDeletions);
    }

    @Test void explicitlyFalseLegacyFirstSaveKeepsAccountPhotoPrivate() {
        writer(); when(profiles.findByMember_Id(7L)).thenReturn(Optional.empty());

        var result = feeds.updateProfile(7L, new FeedDto.ProfileRequest("공개 이름", "소개", false));

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.NONE);
        assertThat(result.avatarUrl()).isNull();
        verifyNoInteractions(storage, fileDeletions);
    }

    @Test void uploadRequiresConfiguredProfileBeforeAnyStorageWrite() {
        Member member = writer();
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(FeedProfile.mediaOwner(member, NOW)));

        assertThatThrownBy(() -> feeds.uploadProfileAvatar(7L, image())).isInstanceOf(FeedException.class);

        verify(profiles, never()).saveAndFlush(any());
        verifyNoInteractions(storage, fileDeletions);
    }

    @Test void customSourceRequiresAnExistingOwnedUpload() {
        FeedProfile profile = configured(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));

        assertThatThrownBy(() -> feeds.updateProfile(7L, request(FeedDto.AvatarSource.CUSTOM))).isInstanceOf(FeedException.class);

        verify(profiles, never()).saveAndFlush(any());
        verifyNoInteractions(storage, fileDeletions);
    }

    @Test void replacementSavesCustomImageThenQueuesOnlyPreviousCustomKey() {
        Member member = writer(); FeedProfile profile = custom(member);
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        MockMultipartFile image = image();
        when(storage.storeFile(image, PREFIX)).thenReturn(NEW);
        when(storage.isManagedFileUnderPrefix(OLD, PREFIX)).thenReturn(true);
        when(storage.isManagedFileUnderPrefix(NEW, PREFIX)).thenReturn(true);
        when(storage.getPublicUrl(NEW)).thenReturn("https://cdn.example.test/" + NEW);

        var result = feeds.uploadProfileAvatar(7L, image);

        var order = inOrder(members, storage, profiles, fileDeletions);
        order.verify(members).findActiveByIdForUpdate(7L);
        order.verify(storage).storeFile(image, PREFIX);
        order.verify(profiles).saveAndFlush(profile);
        order.verify(fileDeletions).enqueue(OLD, "FEED_PROFILE_IMAGE", 7L);
        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.CUSTOM);
        assertThat(result.avatarUrl()).isEqualTo("https://cdn.example.test/" + NEW);
        assertThat(member.getProfileImage()).isEqualTo(ACCOUNT);
        verify(storage, never()).deleteFile(any());
    }

    @Test void failedUploadKeepsPreviousAvatarAndNeverQueuesIt() {
        FeedProfile profile = custom(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        MockMultipartFile image = image();
        when(storage.storeFile(image, PREFIX)).thenThrow(FileException.uploadFailed());

        assertThatThrownBy(() -> feeds.uploadProfileAvatar(7L, image)).isInstanceOf(FileException.class);

        assertThat(profile.getCustomAvatarKey()).isEqualTo(OLD);
        assertThat(profile.getMember().getProfileImage()).isEqualTo(ACCOUNT);
        verify(profiles, never()).saveAndFlush(any());
        verifyNoInteractions(fileDeletions);
    }

    @Test void databaseFailureNeverQueuesThePreviouslyCommittedAvatar() {
        FeedProfile profile = custom(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        MockMultipartFile image = image();
        when(storage.storeFile(image, PREFIX)).thenReturn(NEW);
        when(profiles.saveAndFlush(profile)).thenThrow(new org.springframework.dao.DataIntegrityViolationException("fixture"));

        assertThatThrownBy(() -> feeds.uploadProfileAvatar(7L, image))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

        verifyNoInteractions(fileDeletions);
        verify(storage, never()).deleteFile(any());
        verify(storage, never()).deleteFileRequired(OLD);
    }

    @Test void legacyNotAccountFlagPreservesPreviouslyUploadedCustomAvatar() {
        FeedProfile profile = custom(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(storage.isManagedFileUnderPrefix(OLD, PREFIX)).thenReturn(true);

        var result = feeds.updateProfile(7L, new FeedDto.ProfileRequest("공개 이름", "소개 수정", false));

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.CUSTOM);
        assertThat(profile.getCustomAvatarKey()).isEqualTo(OLD);
        verifyNoInteractions(fileDeletions);
    }

    @Test void returningToAccountPhotoQueuesCustomImageWithoutDeletingAccountPhoto() {
        FeedProfile profile = custom(writer());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(storage.isManagedFileUnderPrefix(OLD, PREFIX)).thenReturn(true);
        when(storage.isManagedFileUnderPrefix(ACCOUNT, FileStoragePaths.userProfile(7L))).thenReturn(true);

        var result = feeds.updateProfile(7L, request(FeedDto.AvatarSource.ACCOUNT));

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.ACCOUNT);
        assertThat(result.avatarUrl()).isEqualTo(ACCOUNT);
        assertThat(profile.getCustomAvatarKey()).isNull();
        verify(fileDeletions).enqueue(OLD, "FEED_PROFILE_IMAGE", 7L);
        verify(fileDeletions, never()).enqueue(eq(ACCOUNT), any(), any());
    }

    @Test void removingAvatarOptsOutEvenWhenAccountHasPhoto() {
        FeedProfile profile = configured(writer()); profile.changeAvatar(true, null, NOW);
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));

        var result = feeds.deleteProfileAvatar(7L);

        assertThat(result.avatarSource()).isEqualTo(FeedDto.AvatarSource.NONE);
        assertThat(result.avatarUrl()).isNull();
        assertThat(profile.getMember().getProfileImage()).isEqualTo(ACCOUNT);
        verifyNoInteractions(storage, fileDeletions);
    }

    @Test void inconsistentStoredAvatarCanNeitherExposeNorDeleteAccountOrOtherMembersPhoto() {
        FeedProfile profile = configured(writer()); profile.changeAvatar(false, ACCOUNT, NOW);
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));

        assertThat(feeds.profileDto(profile).avatarUrl()).isNull();
        assertThatThrownBy(() -> feeds.updateProfile(7L, request(FeedDto.AvatarSource.CUSTOM))).isInstanceOf(FeedException.class);
        feeds.deleteProfileAvatar(7L);

        verifyNoInteractions(fileDeletions);
        verify(storage, never()).getPublicUrl(any());
    }

    @Test void withdrawalQueuesCustomAvatarAndClearsItsReferenceEvenWhenApiDisabled() {
        FeedProfile profile = custom(Member.builder().id(7L).termsAgreed(true).profileImage(ACCOUNT).build());
        when(profiles.findByMember_Id(7L)).thenReturn(Optional.of(profile));
        when(storage.isManagedFileUnderPrefix(OLD, PREFIX)).thenReturn(true);

        new FeedAccountCleanup(posts, profiles, storage, fileDeletions).withdraw(new MemberWithdrawn(7L));

        verify(fileDeletions).enqueue(OLD, "FEED_PROFILE_IMAGE", 7L);
        assertThat(profile.getCustomAvatarKey()).isNull();
        assertThat(profile.isUseAccountAvatar()).isFalse();
        assertThat(profile.isHidden()).isTrue();
        verifyNoInteractions(policy);
    }

    private Member writer() {
        Member member = Member.builder().id(7L).termsAgreed(true).profileImage(ACCOUNT).build();
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        return member;
    }
    private static FeedProfile configured(Member member) {
        FeedProfile profile = FeedProfile.create(member, NOW); profile.update("공개 이름", "공개 이름", "소개", false, NOW); return profile;
    }
    private static FeedProfile custom(Member member) {
        FeedProfile profile = configured(member); profile.changeAvatar(false, OLD, NOW); return profile;
    }
    private static FeedDto.ProfileRequest request(FeedDto.AvatarSource source) {
        return new FeedDto.ProfileRequest("공개 이름", "소개", null, source);
    }
    private static MockMultipartFile image() {
        return new MockMultipartFile("image", "profile.png", "image/png", new byte[]{1});
    }
}
