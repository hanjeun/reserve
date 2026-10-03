package kr.it.reserve.store;

import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.controller.StoreApiController;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreEditAuthorizationContractTest {
    private enum Operation { READ_EDIT, UPDATE, AUTO_APPROVAL }

    @Mock StoreRepository stores;
    @Mock FileStorageService files;
    @Mock FileDeletionOutboxService deletions;
    @InjectMocks StoreService service;

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @EnumSource(Operation.class)
    void unauthenticatedEditOperationsStopBeforeCallingTheStoreService(Operation operation) {
        SecurityContextHolder.clearContext();
        StoreService blocked = mock(StoreService.class);
        StoreApiController controller = new StoreApiController(blocked);

        assertThatThrownBy(() -> request(controller, operation))
                .isInstanceOf(MemberException.class)
                .hasMessage("가게 수정을 위해 로그인이 필요합니다.");
        verifyNoInteractions(blocked);
    }

    @ParameterizedTest
    @EnumSource(Operation.class)
    void anotherOwnerCannotReadOrChangeStoreSettings(Operation operation) {
        Member owner = Member.builder().id(8L).role(Role.BUSINESS).build();
        Member stranger = Member.builder().id(9L).role(Role.BUSINESS).build();
        Store store = Store.builder().id(31L).owner(owner).name("원래 가게")
                .status(StoreStatus.ACTIVE).autoApprovalEnabled(false).build();
        if (operation == Operation.UPDATE) when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        else when(stores.findById(31L)).thenReturn(Optional.of(store));

        assertThatThrownBy(() -> request(service, operation, stranger))
                .isInstanceOfSatisfying(StoreException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(HttpStatus.FORBIDDEN))
                .hasMessage("가게를 수정할 권한이 없습니다.");
        assertThat(store.getName()).isEqualTo("원래 가게");
        assertThat(store.getAutoApprovalEnabled()).isFalse();
        if (operation == Operation.UPDATE) verify(stores).findByIdForUpdate(31L);
        else verify(stores).findById(31L);
        verifyNoMoreInteractions(stores);
        verifyNoInteractions(files, deletions);
    }

    private static void request(StoreApiController controller, Operation operation) {
        switch (operation) {
            case READ_EDIT -> controller.getStoreForEdit(31L);
            case UPDATE -> controller.updateStore(31L, updateRequest());
            case AUTO_APPROVAL -> controller.toggleAutoApproval(31L, true);
        }
    }

    private static void request(StoreService service, Operation operation, Member member) {
        switch (operation) {
            case READ_EDIT -> service.getStoreForEdit(31L, member);
            case UPDATE -> service.updateStore(31L, updateRequest(), member);
            case AUTO_APPROVAL -> service.toggleAutoApproval(31L, true, member);
        }
    }

    private static StoreUpdateRequest updateRequest() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setName("변경 시도");
        return request;
    }
}
