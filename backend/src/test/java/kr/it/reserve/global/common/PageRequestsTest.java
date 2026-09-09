package kr.it.reserve.global.common;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;
import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PageRequestsTest {
    @Test
    void rejectsOffsetsThatJpaCannotRepresent() {
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(BusinessException.class, () -> PageRequests.bounded(Integer.MAX_VALUE, 100)).getStatus());
    }

    @ParameterizedTest
    @CsvSource({"-1,0,0,1", "0,-50,0,1", "2,15,2,15", "1,101,1,100", "0,2147483647,0,100"})
    void clampsInvalidInputWithoutChangingNormalRequests(int page, int size, int expectedPage, int expectedSize) {
        var request = PageRequests.bounded(page, size);
        assertEquals(expectedPage, request.getPageNumber());
        assertEquals(expectedSize, request.getPageSize());
    }
}
