package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatIntro;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 채팅 첫 안내.
 *
 * @param configured 저장된 설정이 있는지. false 면 기본 안내다.
 * @param items      answer 가 null 인 항목은 "자동 답변 없음" — 누르면 질문이 입력칸에 채워진다
 *                   (관리자가 답변을 쓰기 전 고객지원 기본 질문).
 */
public record ChatIntroResponse(boolean configured, String notice, String greeting, String displayName, String avatarUrl,
                                List<Item> items, LocalDateTime updatedAt) {

    public static final String SUPPORT_DISPLAY_NAME = "RESERVE 고객지원";
    /** {이름} 은 화면에서 손님 이름(모르면 "회원")으로 바뀐다. 빈 줄은 문단 구분이다. */
    public static final String DEFAULT_SUPPORT_GREETING = "안녕하세요, {이름}님 🙂\n반갑습니다.\n\n궁금한 내용을 남겨주시면\n관리자가 확인 후 답변드릴게요.";
    public static final String DEFAULT_STORE_GREETING = "안녕하세요, {이름}님 🙂\n반갑습니다.\n\n궁금한 내용을 남겨주시면\n사장님이 확인 후 답변드릴게요.";

    /**
     * 관리자가 아직 설정하지 않았을 때의 고객지원 기본 문답(2026-09-24). 관리자 화면에 그대로 채워져 고칠 수 있다.
     * 답변은 실제 동작과 맞춘다 — 결제된 예약은 변경 불가(ReservationService·useStoreDetailActions),
     * 환불은 가게 환불 기준, 사업자 인증 승인 후 가게 등록.
     */
    static final List<Item> DEFAULT_SUPPORT_ITEMS = List.of(
            new Item("예약을 확인하고 싶어요",
                    "로그인 후 오른쪽 위 프로필 메뉴의 '내 예약'에서 예약 상태와 방문 일시, 체크인 QR을 확인할 수 있어요."),
            new Item("예약 변경·취소가 궁금해요",
                    "'내 예약'에서 예약을 골라 변경하거나 취소할 수 있어요. 예약금을 결제한 예약은 변경할 수 없어 취소 후 다시 예약해 주세요. 환불 금액은 가게의 환불 기준(방문일까지 남은 기간)에 따라 달라져요."),
            new Item("가게 등록·이용 문의",
                    "가게를 등록하려면 사업자 인증이 필요해요. 마이페이지에서 사업자등록증을 제출하고 승인되면 가게를 등록할 수 있어요."),
            new Item("기타 문의",
                    "궁금한 내용을 아래 입력칸에 자세히 남겨주세요. 관리자가 확인 후 이 대화방으로 답변드릴게요.")
    );

    public record Item(String question, String answer) {
    }

    public static ChatIntroResponse from(ChatIntro intro) {
        boolean support = intro.getStoreId() == null;
        return new ChatIntroResponse(
                true,
                intro.getNotice(),
                intro.getGreeting() != null ? intro.getGreeting() : (support ? DEFAULT_SUPPORT_GREETING : DEFAULT_STORE_GREETING),
                support ? (intro.getDisplayName() != null ? intro.getDisplayName() : SUPPORT_DISPLAY_NAME) : null,
                support ? intro.getAvatarUrl() : null,
                intro.getItems().stream().map(item -> new Item(item.getQuestion(), item.getAnswer())).toList(),
                intro.getUpdatedAt());
    }

    public static ChatIntroResponse supportDefault() {
        return new ChatIntroResponse(false, null, DEFAULT_SUPPORT_GREETING, SUPPORT_DISPLAY_NAME, null, DEFAULT_SUPPORT_ITEMS, null);
    }

    /** 가게는 표시 이름·사진을 가게 정보에서 가져오므로 null 이다. */
    public static ChatIntroResponse empty() {
        return new ChatIntroResponse(false, null, DEFAULT_STORE_GREETING, null, null, List.of(), null);
    }
}
