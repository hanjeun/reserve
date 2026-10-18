package kr.it.reserve.promotion.dto;

/** 소식·SNS에서 공유하는 공개 사진 응답. 저장 경로·작성자 내부 ID는 포함하지 않는다. */
public interface NewsImage {
    Long id();
    String url();
    int width();
    int height();
}
