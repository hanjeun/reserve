package kr.it.reserve.member;

import kr.it.reserve.member.dto.LocationUpdateRequest;
import kr.it.reserve.member.dto.MemberUpdateRequest;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberProfilePartialUpdateTest {
    @Mock MemberRepository repository;
    @InjectMocks MemberService service;

    private Member storedMember() {
        Member member = Member.builder().id(7L).name("기존 이름").locationAddress("기존 주소")
                .locationZipCode("12345").locationAddressDetail("기존 상세주소").build();
        when(repository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(repository.save(member)).thenReturn(member);
        return member;
    }

    @Test void notificationOnlyUpdatePreservesTheStoredName() {
        Member member = storedMember();
        service.updateMember(7L, new MemberUpdateRequest(null, false));
        assertThat(member.getName()).isEqualTo("기존 이름");
        assertThat(member.isEmailNotificationEnabled()).isFalse();
    }

    @Test void coordinateOnlyUpdatePreservesEveryStoredAddressField() {
        Member member = storedMember();
        var request = new LocationUpdateRequest();
        request.setLatitude(0.0);
        request.setLongitude(0.0);
        request.setAddress("");
        request.setZipCode(" ");
        service.updateLocation(7L, request);
        assertThat(member.getLatitude()).isZero();
        assertThat(member.getLongitude()).isZero();
        assertThat(member.getLocationAddress()).isEqualTo("기존 주소");
        assertThat(member.getLocationZipCode()).isEqualTo("12345");
        assertThat(member.getLocationAddressDetail()).isEqualTo("기존 상세주소");
    }
}
