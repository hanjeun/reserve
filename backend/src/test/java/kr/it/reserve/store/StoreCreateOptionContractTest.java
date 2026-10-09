package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class StoreCreateOptionContractTest {

    @Autowired EntityManager entityManager;
    @Autowired StoreService service;

    @ParameterizedTest
    @MethodSource("optionRequests")
    void registrationPersistsBookingChoicesAndReturnsTheSameOptions(
            Boolean requested, boolean expectedBookingOption, boolean expectedEmailOption) {
        Member owner = Member.builder().name("옵션 검증").email("options@example.invalid")
                .role(Role.BUSINESS).build();
        entityManager.persist(owner);
        StoreCreateRequest request = new StoreCreateRequest();
        request.setName("  옵션 검증 가게  ");
        request.setCategory("카페");
        request.setAddress("서울 검증 주소");
        request.setNoShowDeposit(3000);
        request.setAutoApprovalEnabled(requested);
        request.setAllowLatePayment(requested);
        request.setAllowDuplicateReservation(requested);
        request.setEmailNotificationEnabled(requested);

        var response = service.createStore(request, owner);
        entityManager.flush();
        entityManager.clear();
        Store saved = entityManager.find(Store.class, response.getId());

        assertThat(saved).isNotNull();
        assertThat(saved.getOwner().getId()).isEqualTo(owner.getId());
        assertThat(saved.getName()).isEqualTo("옵션 검증 가게");
        assertThat(saved.getAutoApprovalEnabled()).isEqualTo(expectedBookingOption);
        assertThat(saved.getAllowLatePayment()).isEqualTo(expectedBookingOption);
        assertThat(saved.getAllowDuplicateReservation()).isEqualTo(expectedBookingOption);
        assertThat(saved.getEmailNotificationEnabled()).isEqualTo(expectedEmailOption);
        assertThat(response.getAutoApprovalEnabled()).isEqualTo(saved.getAutoApprovalEnabled());
        assertThat(response.getAllowLatePayment()).isEqualTo(saved.getAllowLatePayment());
        assertThat(response.getAllowDuplicateReservation()).isEqualTo(saved.getAllowDuplicateReservation());
        assertThat(response.getEmailNotificationEnabled()).isEqualTo(saved.getEmailNotificationEnabled());
    }

    private static Stream<Arguments> optionRequests() {
        return Stream.of(
                Arguments.of(null, false, true),
                Arguments.of(false, false, false),
                Arguments.of(true, true, true));
    }
}
