package kr.it.reserve.audit;

import kr.it.reserve.audit.controller.TrashController;
import kr.it.reserve.audit.service.AuditLogService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;

import java.lang.reflect.Modifier;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 휴지통 데이터는 보존 기간 동안 복구만 허용하고, 영구 삭제는 만료 스케줄러만 수행한다.
 */
class TrashDeletionBoundaryTest {

    @Test
    @DisplayName("관리자 휴지통은 즉시 영구삭제 HTTP 경로를 제공하지 않는다")
    void trashControllerDoesNotExposeDeleteMapping() {
        boolean hasDeleteRoute = Arrays.stream(TrashController.class.getDeclaredMethods())
                .anyMatch(method -> method.isAnnotationPresent(DeleteMapping.class));

        assertThat(hasDeleteRoute).isFalse();
    }

    @Test
    @DisplayName("감사 서비스는 수동 영구삭제 진입점을 공개하지 않는다")
    void auditServiceDoesNotExposeManualHardDelete() {
        boolean hasPublicHardDelete = Arrays.stream(AuditLogService.class.getDeclaredMethods())
                .anyMatch(method -> method.getName().equals("hardDelete")
                        && Modifier.isPublic(method.getModifiers()));

        assertThat(hasPublicHardDelete).isFalse();
    }
}
