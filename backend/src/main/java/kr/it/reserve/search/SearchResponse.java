package kr.it.reserve.search;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** 검색 미리보기에는 텍스트, 고정된 내부 경로, 검증된 공개 썸네일만 담는다. */
public record SearchResponse(String keyword, List<Group> groups) {
    public record Item(Long id, String type, String title, String description, String path,
                       @JsonInclude(JsonInclude.Include.NON_NULL) String publicId,
                       @JsonInclude(JsonInclude.Include.NON_NULL) String thumbnailUrl) {
        public Item(Long id, String type, String title, String description, String path) {
            this(id, type, title, description, path, null, null);
        }
        public Item(Long id, String type, String title, String description, String path, String publicId) {
            this(id, type, title, description, path, publicId, null);
        }
    }
    public record GroupError(int status, String message) { }
    public record Group(String key, String title, List<Item> items, GroupError error, boolean hasMore) {
        static Group empty(String key, String title) { return new Group(key, title, List.of(), null, false); }
    }
}
