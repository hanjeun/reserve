package kr.it.reserve.audit;

import kr.it.reserve.audit.service.AdminSanctionService;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.global.error.StoreException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@SpringJUnitConfig(AdminSanctionAuthorizationTest.Config.class)
class AdminSanctionAuthorizationTest {
    @Configuration
    @EnableMethodSecurity
    @Import(AdminSanctionService.class)
    static class Config {
        @Bean MemberRepository members() { return mock(MemberRepository.class); }
        @Bean StoreRepository stores() { return mock(StoreRepository.class); }
        @Bean AuditLogService audit() { return mock(AuditLogService.class); }
    }
    @Autowired AdminSanctionService sanctions;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired AuditLogService audit;
    @BeforeEach void clearMocks() { clearInvocations(members, stores, audit); }

    @Test @WithMockUser(roles = "BUSINESS")
    void directServiceCallsCannotBypassAdministratorGate() {
        assertThatThrownBy(() -> sanctions.suspendMember(1L, 3, "reason")).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> sanctions.banStore(2L, "reason")).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(members, stores, audit);
    }

    @Test @WithMockUser(roles = "ADMIN")
    void administratorsReachExistingStoreValidation() {
        assertThatThrownBy(() -> sanctions.suspendStore(2L, 3, "reason")).isInstanceOf(StoreException.class);
        verify(stores).findByIdForUpdate(2L);
        verifyNoInteractions(audit);
    }
}
