package kr.it.reserve.search;

import java.util.List;

/** 검색 미리보기에는 텍스트와 고정된 내부 경로만 담고 엔티티나 사진 자격정보를 포함하지 않는다. */
public record SearchResponse(String keyword, List<Group> groups) {
    public record Item(Long id, String type, String title, String description, String path) { }
    public record GroupError(int status, String message) { }
    public record Group(String key, String title, List<Item> items, GroupError error, boolean hasMore) {
        static Group empty(String key, String title) { return new Group(key, title, List.of(), null, false); }
    }
}
