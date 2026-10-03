package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatIntroRequest;
import kr.it.reserve.chat.dto.ChatIntroResponse;
import kr.it.reserve.chat.entity.ChatIntro;
import kr.it.reserve.chat.repository.ChatIntroRepository;
import kr.it.reserve.chat.service.ChatIntroService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatIntroServiceTest {

    @Mock ChatIntroRepository introRepository;
    @Mock StoreRepository storeRepository;
    @Mock kr.it.reserve.file.service.FileStorageService fileStorageService;
    @Mock kr.it.reserve.file.service.FileDeletionOutboxService fileDeletionOutboxService;
    @InjectMocks ChatIntroService introService;

    @Test
    void supportFallsBackToTheFourDefaultQuestionsWithAnswers() {
        when(introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)).thenReturn(Optional.empty());

        ChatIntroResponse intro = introService.getSupportIntro();

        assertThat(intro.configured()).isFalse();
        assertThat(intro.items()).extracting(ChatIntroResponse.Item::question)
                .containsExactly("예약을 확인하고 싶어요", "예약 변경·취소가 궁금해요", "가게 등록·이용 문의", "기타 문의");
        assertThat(intro.items()).allSatisfy(item -> assertThat(item.answer()).isNotBlank());
    }

    @Test
    void ownerSavesTrimmedQuestionsAndAnswersInOrder() {
        Member owner = business(8L);
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));
        when(introRepository.findByScopeKey("STORE:31")).thenReturn(Optional.empty());
        when(introRepository.save(any(ChatIntro.class))).thenAnswer(call -> call.getArgument(0));

        ChatIntroResponse saved = introService.updateStoreIntro(owner, 31L, new ChatIntroRequest("  9월 30일은\n  임시 휴무예요  ", null, null, null, List.of(
                new ChatIntroRequest.Item("  주차 \n 되나요? ", "  건물 뒤편에\r\n2대 가능해요  "),
                new ChatIntroRequest.Item("반려동물 동반", "소형견만 가능해요"))));

        assertThat(saved.configured()).isTrue();
        assertThat(saved.notice()).isEqualTo("9월 30일은 임시 휴무예요");
        assertThat(saved.items()).containsExactly(
                new ChatIntroResponse.Item("주차 되나요?", "건물 뒤편에\n2대 가능해요"),
                new ChatIntroResponse.Item("반려동물 동반", "소형견만 가능해요"));
        assertThat(saved.updatedAt()).isNotNull();
    }

    @Test
    void blankNoticeAndEmptyListClearTheIntro() {
        Member owner = business(8L);
        ChatIntro existing = ChatIntro.forStore(31L);
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));
        when(introRepository.findByScopeKey("STORE:31")).thenReturn(Optional.of(existing));

        ChatIntroResponse saved = introService.updateStoreIntro(owner, 31L, new ChatIntroRequest("   ", null, null, null, null));

        assertThat(saved.notice()).isNull();
        assertThat(saved.items()).isEmpty();
        verify(introRepository, never()).save(any());
    }

    @Test
    void anotherBusinessCannotEditTheStore() {
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, business(8L))));

        Member otherOwner = business(9L);
        ChatIntroRequest edit = request(1);
        assertThatThrownBy(() -> introService.updateStoreIntro(otherOwner, 31L, edit))
                .isInstanceOf(ChatException.class)
                .satisfies(error -> assertThat(((ChatException) error).getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(introRepository, never()).save(any());
    }

    @Test
    void aDemotedFormerOwnerCannotEditEvenWithTheOldOwnership() {
        Member former = Member.builder().id(8L).name("회원8").email("m8@example.com").role(Role.USER).build();
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, former)));

        ChatIntroRequest edit = request(1);
        assertThatThrownBy(() -> introService.updateStoreIntro(former, 31L, edit))
                .isInstanceOf(ChatException.class);
    }

    @Test
    void deletedStoresAreNotFoundForReadingAndWriting() {
        Store deleted = store(31L, business(8L));
        deleted.softDelete();
        when(storeRepository.findById(31L)).thenReturn(Optional.of(deleted));

        assertThatThrownBy(() -> introService.getStoreIntro(31L))
                .isInstanceOf(ChatException.class)
                .satisfies(error -> assertThat(((ChatException) error).getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        Member owner = business(8L);
        ChatIntroRequest edit = request(1);
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, edit))
                .isInstanceOf(ChatException.class);
    }

    @Test
    void rejectsMoreThanFiveItemsDuplicateQuestionsAndBlankAnswers() {
        Member owner = business(8L);
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));

        ChatIntroRequest excessiveItems = request(6);
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, excessiveItems))
                .hasMessageContaining("5개까지");
        ChatIntroRequest duplicateQuestions = new ChatIntroRequest(null, null, null, null, List.of(
                new ChatIntroRequest.Item("주차", "가능"), new ChatIntroRequest.Item(" 주차 ", "불가")));
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, duplicateQuestions))
                .hasMessageContaining("같은 질문");
        ChatIntroRequest blankAnswer = new ChatIntroRequest(null, null, null, null, List.of(
                new ChatIntroRequest.Item("주차", "   ")));
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, blankAnswer))
                .hasMessageContaining("답변을 입력");
        ChatIntroRequest longQuestion = new ChatIntroRequest(null, null, null, null, List.of(
                new ChatIntroRequest.Item("질".repeat(41), "답")));
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, longQuestion))
                .hasMessageContaining("40자");
        ChatIntroRequest longNotice = new ChatIntroRequest("공".repeat(101), null, null, null, null);
        assertThatThrownBy(() -> introService.updateStoreIntro(owner, 31L, longNotice))
                .hasMessageContaining("100자");
        verify(introRepository, never()).save(any());
    }

    @Test
    void onlyAdminsSaveTheSupportIntro() {
        Member nonAdmin = business(8L);
        ChatIntroRequest edit = request(1);
        assertThatThrownBy(() -> introService.updateSupportIntro(nonAdmin, edit))
                .isInstanceOf(ChatException.class);

        Member admin = Member.builder().id(1L).name("관리자").email("admin@example.com").role(Role.ADMIN).build();
        when(introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)).thenReturn(Optional.empty());
        when(introRepository.save(any(ChatIntro.class))).thenAnswer(call -> call.getArgument(0));

        ChatIntroResponse saved = introService.updateSupportIntro(admin, request(2));

        assertThat(saved.configured()).isTrue();
        assertThat(saved.items()).hasSize(2).allSatisfy(item -> assertThat(item.answer()).isNotBlank());
    }

    @Test
    void storesCannotChangeTheirChatIdentityButCanWriteAGreeting() {
        Member owner = business(8L);
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, owner)));
        when(introRepository.findByScopeKey("STORE:31")).thenReturn(Optional.empty());
        when(introRepository.save(any(ChatIntro.class))).thenAnswer(call -> call.getArgument(0));

        ChatIntroResponse saved = introService.updateStoreIntro(owner, 31L,
                new ChatIntroRequest(null, "  어서 오세요\r\n\n\n\n편하게 물어보세요  ", "RESERVE 고객지원", "https://cdn/x.png", null));

        assertThat(saved.greeting()).isEqualTo("어서 오세요\n\n편하게 물어보세요");
        assertThat(saved.displayName()).isNull();
        assertThat(saved.avatarUrl()).isNull();
    }

    @Test
    void supportAvatarMustBeAnUploadedFileAndTheOldOneIsQueuedForDeletion() {
        Member admin = Member.builder().id(1L).name("관리자").email("admin@example.com").role(Role.ADMIN).build();
        ChatIntro existing = ChatIntro.forSupport();
        existing.replace(null, null, null, "https://cdn/system/chat/support/old.png", java.util.List.of(), 1L);
        when(introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)).thenReturn(Optional.of(existing));
        when(fileStorageService.isManagedFileUnderPrefix("https://evil.example/x.png", "system/chat/support")).thenReturn(false);
        when(fileStorageService.isManagedFileUnderPrefix("https://cdn/system/chat/support/new.png", "system/chat/support")).thenReturn(true);

        assertThatThrownBy(() -> introService.updateSupportIntro(admin,
                new ChatIntroRequest(null, null, null, "https://evil.example/x.png", null)))
                .hasMessageContaining("올린 사진");

        ChatIntroResponse saved = introService.updateSupportIntro(admin,
                new ChatIntroRequest(null, null, "  리저브   도우미 ", "https://cdn/system/chat/support/new.png", null));
        assertThat(saved.displayName()).isEqualTo("리저브 도우미");
        assertThat(saved.avatarUrl()).isEqualTo("https://cdn/system/chat/support/new.png");
        verify(fileDeletionOutboxService).enqueue("https://cdn/system/chat/support/old.png", "CHAT_INTRO_AVATAR", null);
    }

    @Test
    void defaultsFillTheGreetingAndSupportIdentity() {
        when(introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)).thenReturn(Optional.empty());
        ChatIntroResponse support = introService.getSupportIntro();
        assertThat(support.greeting()).contains("{이름}").contains("관리자가 확인");
        assertThat(support.displayName()).isEqualTo("RESERVE 고객지원");
    }

    @Test
    void storeWithoutSettingsHasAnEmptyIntro() {
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(31L, business(8L))));
        when(introRepository.findByScopeKey("STORE:31")).thenReturn(Optional.empty());

        ChatIntroResponse intro = introService.getStoreIntro(31L);

        assertThat(intro.configured()).isFalse();
        assertThat(intro.items()).isEqualTo(Collections.emptyList());
    }

    private static ChatIntroRequest request(int count) {
        return new ChatIntroRequest("안녕하세요", null, null, null, java.util.stream.IntStream.rangeClosed(1, count)
                .mapToObj(index -> new ChatIntroRequest.Item("질문" + index, "답변" + index))
                .toList());
    }

    private static Member business(Long id) {
        return Member.builder().id(id).name("사업자" + id).email("business" + id + "@example.com")
                .role(Role.BUSINESS).build();
    }

    private static Store store(Long id, Member owner) {
        return Store.builder().id(id).owner(owner).name("가게" + id).status(StoreStatus.ACTIVE).build();
    }
}
