package kr.it.reserve.promotion;

import kr.it.reserve.global.error.PromotionException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.service.PromotionService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 순수 서비스 관문 테스트다. DB 행 잠금·외부 API는 실행하지 않는다. */
@ExtendWith(MockitoExtension.class)
class PromotionMutationSafetyTest {

    @Mock private PromotionRepository promotionRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private StoreRepository storeRepository;
    @InjectMocks private PromotionService service;

    private Member author;
    private Store associatedStore;
    private Promotion promotion;
    private PromotionDto.PromotionRequest request;

    enum Mutation { CREATE, UPDATE, DELETE }
    enum StoreCondition { DELETED, SUSPENDED, BANNED }

    @BeforeEach
    void setUp() {
        author = Member.builder().id(1L).name("작성자").role(Role.BUSINESS).build();
        associatedStore = Store.builder().id(3L).owner(author).name("가게").build();
        promotion = Promotion.builder().id(7L).member(author).store(associatedStore)
                .title("before").content("original content").category(Promotion.PromotionCategory.CAFE)
                .imageUrl("original image").specialMenu("original menu").storyHistory("original story")
                .tags("original tags").createdAt(LocalDateTime.of(2026, 9, 1, 0, 0))
                .updatedAt(LocalDateTime.of(2026, 9, 1, 0, 0)).build();
        request = PromotionDto.PromotionRequest.builder().storeId(3L)
                .title("after").content("changed content").category("RESTAURANT")
                .imageUrl("changed image").specialMenu("changed menu").storyHistory("changed story")
                .tags("changed tags").build();
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void createLocksActiveMemberThenCurrentStoreBeforeSaving(Role role) {
        author.setRole(role);
        stubActiveMember(author);
        when(storeRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(associatedStore));
        when(promotionRepository.save(any(Promotion.class))).thenAnswer(invocation -> {
            Promotion created = invocation.getArgument(0);
            created.setCreatedAt(promotion.getCreatedAt());
            created.setUpdatedAt(promotion.getUpdatedAt());
            return created;
        });

        var response = service.createPromotion(author.getId(), request);

        var order = inOrder(memberRepository, storeRepository, promotionRepository);
        order.verify(memberRepository).findActiveByIdForUpdate(1L);
        order.verify(storeRepository).findByIdForUpdate(3L);
        order.verify(promotionRepository).save(any(Promotion.class));
        assertThat(response.getMemberId()).isEqualTo(1L);
        assertThat(response.getStoreId()).isEqualTo(3L);
    }

    @Test
    void updateLocksActiveMemberAndOriginalStoreBeforeChangingEveryEditableField() {
        stubExistingPromotion(author, associatedStore);
        // 수정 요청의 다른 가게 ID로 기존 홍보글의 소유권 검사를 우회하거나 연결을 바꾸지 않는다.
        request.setStoreId(999L);

        var response = service.updatePromotion(7L, 1L, request);

        verifyMutationLockOrder();
        assertThat(response.getTitle()).isEqualTo("after");
        assertThat(response.getContent()).isEqualTo("changed content");
        assertThat(response.getCategory()).isEqualTo("RESTAURANT");
        assertThat(response.getImageUrl()).isEqualTo("changed image");
        assertThat(response.getSpecialMenu()).isEqualTo("changed menu");
        assertThat(response.getStoryHistory()).isEqualTo("changed story");
        assertThat(response.getTags()).isEqualTo("changed tags");
        assertThat(promotion.getMember()).isSameAs(author);
        assertThat(promotion.getStore()).isSameAs(associatedStore);
        verify(storeRepository, never()).findByIdForUpdate(999L);
        verify(promotionRepository, never()).save(any(Promotion.class));
        verify(promotionRepository, never()).delete(any(Promotion.class));
    }

    @Test
    void deleteLocksActiveMemberThenOriginalStoreBeforeDeleting() {
        stubExistingPromotion(author, associatedStore);

        service.deletePromotion(7L, 1L);

        var order = inOrder(memberRepository, promotionRepository, storeRepository);
        order.verify(memberRepository).findActiveByIdForUpdate(1L);
        order.verify(promotionRepository).findById(7L);
        order.verify(storeRepository).findByIdForUpdate(3L);
        order.verify(promotionRepository).delete(promotion);
    }

    @ParameterizedTest
    @EnumSource(Mutation.class)
    void missingOrWithdrawnMemberStopsEveryMutationBeforeReadingStoreOrPromotion(Mutation mutation) {
        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.empty());

        assertRejected(mutation, 1L, HttpStatus.NOT_FOUND);

        verify(memberRepository).findActiveByIdForUpdate(1L);
        verifyNoInteractions(storeRepository, promotionRepository);
    }

    @ParameterizedTest
    @EnumSource(Mutation.class)
    void withdrawnMemberReturnedFromPersistenceContextStillFailsClosed(Mutation mutation) {
        author.softDelete();
        stubActiveMember(author);

        assertRejected(mutation, 1L, HttpStatus.NOT_FOUND);

        verifyNoInteractions(storeRepository, promotionRepository);
    }

    @Test
    void regularMemberStillCannotCreateAPromotionEvenForTheirOwnStore() {
        author.setRole(Role.USER);
        stubActiveMember(author);

        assertRejected(Mutation.CREATE, 1L, HttpStatus.FORBIDDEN);

        verifyNoInteractions(storeRepository, promotionRepository);
    }

    @Test
    void administratorCannotCreateForSomebodyElsesStore() {
        author.setRole(Role.ADMIN);
        stubMutation(Mutation.CREATE, Store.builder().id(3L)
                .owner(Member.builder().id(2L).role(Role.BUSINESS).build()).build());

        assertRejected(Mutation.CREATE, 1L, HttpStatus.FORBIDDEN);

        verify(promotionRepository, never()).save(any(Promotion.class));
    }

    @ParameterizedTest
    @MethodSource("suspendedMemberMutations")
    void currentMemberSanctionStopsEveryMutationBeforeOtherReads(Mutation mutation, MemberStatus status) {
        author.setStatus(status);
        stubActiveMember(author);

        assertRejected(mutation, 1L, HttpStatus.FORBIDDEN);

        verifyNoInteractions(storeRepository, promotionRepository);
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void formerOwnerCannotChangeOriginalPromotionEvenIfItsAssociatedStoreLooksOwned(Mutation mutation) {
        Store lockedCurrentStore = Store.builder().id(3L).name("가게")
                .owner(Member.builder().id(2L).role(Role.BUSINESS).build()).build();
        stubExistingPromotion(author, lockedCurrentStore);

        assertRejected(mutation, 1L, HttpStatus.FORBIDDEN);

        verifyMutationLockOrder();
        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void newOwnerDoesNotInheritTheOriginalAuthorsPermission(Mutation mutation) {
        Member newOwner = Member.builder().id(2L).role(Role.BUSINESS).build();
        associatedStore.setOwner(newOwner);
        stubActiveMember(newOwner);
        when(promotionRepository.findById(7L)).thenReturn(Optional.of(promotion));

        assertRejected(mutation, 2L, HttpStatus.FORBIDDEN);

        verifyNoInteractions(storeRepository);
        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void administratorCannotBypassOriginalAuthorRestriction(Mutation mutation) {
        Member admin = Member.builder().id(2L).role(Role.ADMIN).build();
        associatedStore.setOwner(admin);
        stubActiveMember(admin);
        when(promotionRepository.findById(7L)).thenReturn(Optional.of(promotion));

        assertRejected(mutation, 2L, HttpStatus.FORBIDDEN);

        verifyNoInteractions(storeRepository);
        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void administratorAuthorStillNeedsCurrentStoreOwnership(Mutation mutation) {
        author.setRole(Role.ADMIN);
        Store lockedCurrentStore = Store.builder().id(3L)
                .owner(Member.builder().id(2L).role(Role.BUSINESS).build()).build();
        stubExistingPromotion(author, lockedCurrentStore);

        assertRejected(mutation, 1L, HttpStatus.FORBIDDEN);

        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @MethodSource("unavailableStoreMutations")
    void currentStoreClosureOrSanctionStopsEveryMutation(Mutation mutation, StoreCondition condition) {
        Store lockedCurrentStore = Store.builder().id(3L).owner(author).build();
        switch (condition) {
            case DELETED -> lockedCurrentStore.softDelete();
            case SUSPENDED -> lockedCurrentStore.setStatus(StoreStatus.SUSPENDED);
            case BANNED -> lockedCurrentStore.setStatus(StoreStatus.BANNED);
        }
        stubMutation(mutation, lockedCurrentStore);

        assertRejected(mutation, 1L, HttpStatus.CONFLICT);

        assertUnchangedAndNotDeleted();
        verify(promotionRepository, never()).save(any(Promotion.class));
    }

    @ParameterizedTest
    @EnumSource(Mutation.class)
    void missingCurrentStoreStopsEveryMutation(Mutation mutation) {
        stubActiveMember(author);
        if (mutation != Mutation.CREATE) when(promotionRepository.findById(7L)).thenReturn(Optional.of(promotion));
        when(storeRepository.findByIdForUpdate(3L)).thenReturn(Optional.empty());

        assertRejected(mutation, 1L, HttpStatus.NOT_FOUND);

        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(Mutation.class)
    void absentCurrentOwnerFailsClosedRatherThanThrowingNullPointer(Mutation mutation) {
        stubMutation(mutation, Store.builder().id(3L).build());

        assertRejected(mutation, 1L, HttpStatus.FORBIDDEN);

        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void closureBulkDeleteOrMissingPromotionStopsAfterActiveMemberLock(Mutation mutation) {
        stubActiveMember(author);
        when(promotionRepository.findById(7L)).thenReturn(Optional.empty());

        assertRejected(mutation, 1L, HttpStatus.NOT_FOUND);

        verifyNoInteractions(storeRepository);
        assertUnchangedAndNotDeleted();
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void originalAuthorAndCurrentOwnerKeepsExistingMutationRuleAfterRoleChanges(Mutation mutation) {
        // 등록의 BUSINESS/ADMIN 제한을 수정·삭제에 새로 부여하지 않는다.
        author.setRole(Role.USER);
        stubExistingPromotion(author, associatedStore);

        invoke(mutation, 1L);

        verifyMutationLockOrder();
        if (mutation == Mutation.DELETE) verify(promotionRepository).delete(promotion);
        else assertThat(promotion.getTitle()).isEqualTo("after");
    }

    @ParameterizedTest
    @EnumSource(value = Mutation.class, names = {"UPDATE", "DELETE"})
    void expiredSanctionsKeepExistingIsSuspendedSemantics(Mutation mutation) {
        author.suspend(LocalDateTime.now().minusDays(1), "expired");
        associatedStore.suspend(LocalDateTime.now().minusDays(1), "expired");
        stubExistingPromotion(author, associatedStore);

        invoke(mutation, 1L);

        verifyMutationLockOrder();
        if (mutation == Mutation.DELETE) verify(promotionRepository).delete(promotion);
        else assertThat(promotion.getTitle()).isEqualTo("after");
    }

    private static Stream<Arguments> suspendedMemberMutations() {
        return Stream.of(Mutation.values()).flatMap(mutation ->
                Stream.of(MemberStatus.SUSPENDED, MemberStatus.BANNED)
                        .map(status -> Arguments.of(mutation, status)));
    }

    private static Stream<Arguments> unavailableStoreMutations() {
        return Stream.of(Mutation.values()).flatMap(mutation -> Stream.of(StoreCondition.values())
                .map(condition -> Arguments.of(mutation, condition)));
    }

    private void stubActiveMember(Member member) {
        when(memberRepository.findActiveByIdForUpdate(member.getId())).thenReturn(Optional.of(member));
    }

    private void stubExistingPromotion(Member member, Store lockedCurrentStore) {
        stubActiveMember(member);
        when(promotionRepository.findById(7L)).thenReturn(Optional.of(promotion));
        when(storeRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(lockedCurrentStore));
    }

    private void stubMutation(Mutation mutation, Store lockedCurrentStore) {
        stubActiveMember(author);
        if (mutation != Mutation.CREATE) when(promotionRepository.findById(7L)).thenReturn(Optional.of(promotion));
        when(storeRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(lockedCurrentStore));
    }

    private void invoke(Mutation mutation, Long memberId) {
        switch (mutation) {
            case CREATE -> service.createPromotion(memberId, request);
            case UPDATE -> service.updatePromotion(7L, memberId, request);
            case DELETE -> service.deletePromotion(7L, memberId);
        }
    }

    private void assertRejected(Mutation mutation, Long memberId, HttpStatus status) {
        assertThatThrownBy(() -> invoke(mutation, memberId))
                .isInstanceOfSatisfying(PromotionException.class,
                        exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }

    private void verifyMutationLockOrder() {
        var order = inOrder(memberRepository, promotionRepository, storeRepository);
        order.verify(memberRepository).findActiveByIdForUpdate(1L);
        order.verify(promotionRepository).findById(7L);
        order.verify(storeRepository).findByIdForUpdate(3L);
    }

    private void assertUnchangedAndNotDeleted() {
        assertThat(promotion.getTitle()).isEqualTo("before");
        assertThat(promotion.getContent()).isEqualTo("original content");
        assertThat(promotion.getCategory()).isEqualTo(Promotion.PromotionCategory.CAFE);
        assertThat(promotion.getImageUrl()).isEqualTo("original image");
        assertThat(promotion.getSpecialMenu()).isEqualTo("original menu");
        assertThat(promotion.getStoryHistory()).isEqualTo("original story");
        assertThat(promotion.getTags()).isEqualTo("original tags");
        verify(promotionRepository, never()).delete(any(Promotion.class));
    }
}
