package kr.it.reserve.chat.entity;

/**
 * 메시지를 누가 보냈나.
 *
 * <p>{@code Member.Role}(USER/BUSINESS/ADMIN)을 그대로 쓰지 않는 이유 —
 * 그건 <b>계정의 권한</b>이고 이건 <b>대화에서의 위치</b>다. 같은 관리자 계정이
 * 2단계에서 가게 주인 자격으로 말할 수도 있다. 두 축을 한 enum 으로 묶으면 그때 갈라야 한다.
 */
public enum SenderRole {
    /** 방 주인(손님). */
    MEMBER,
    /** 운영자. */
    ADMIN
}
