package kr.it.reserve.global.trash;

public interface ReceivedInquiryTrash {
    String TYPE = "RECEIVED_INQUIRY";

    void restore(Long id);

    void purge(Long id);

    record Moved(Long id, String title) { }
}
