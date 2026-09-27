package kr.it.reserve.advertisement.entity;

/**
 * 배너가 처음 나타날 때 쓰는 허용 모션.
 *
 * <p>클라이언트가 임의 CSS 이름을 저장하지 못하게 서버 enum을 정책 관문으로 둔다.</p>
 */
public enum BannerMotionPreset {
    SOFT_RISE,
    TILT_UP_3D
}
