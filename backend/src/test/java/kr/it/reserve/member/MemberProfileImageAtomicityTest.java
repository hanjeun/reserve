package kr.it.reserve.member;

import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberProfileImageAtomicityTest {

    @Mock private MemberRepository memberRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private FileDeletionOutboxService fileDeletionOutboxService;

    @InjectMocks
    private MemberService memberService;

    @Test
    @DisplayName("프로필 교체는 새 파일과 DB를 먼저 저장하고 기존 파일은 outbox로 넘긴다")
    void replacesProfileWithoutDeletingOldFileInline() {
        Member member = Member.builder()
                .id(7L)
                .name("회원")
                .email("member@example.com")
                .profileImage("https://cdn.example.test/old.png")
                .build();
        MockMultipartFile image = new MockMultipartFile(
                "image", "new.png", "image/png", new byte[]{1});
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(fileStorageService.storeFile(eq(image), any(String.class))).thenReturn("users/7/new.png");
        when(fileStorageService.getPublicUrl("users/7/new.png"))
                .thenReturn("https://cdn.example.test/users/7/new.png");
        when(memberRepository.save(member)).thenReturn(member);

        memberService.updateProfileImage(7L, image);

        InOrder order = inOrder(fileStorageService, memberRepository, fileDeletionOutboxService);
        order.verify(fileStorageService).storeFile(eq(image), any(String.class));
        order.verify(memberRepository).save(member);
        order.verify(fileDeletionOutboxService).enqueue(
                "https://cdn.example.test/old.png", "MEMBER_PROFILE_IMAGE", 7L);
        verify(fileStorageService, never()).deleteFile("https://cdn.example.test/old.png");
        assertThat(member.getProfileImage())
                .isEqualTo("https://cdn.example.test/users/7/new.png");
    }
}
