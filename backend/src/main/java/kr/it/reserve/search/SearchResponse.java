package kr.it.reserve.search;

import java.util.List;

/** Search previews contain text and fixed internal paths only, never domain entities or image credentials. */
public record SearchResponse(String keyword, List<Group> groups) {
    public record Item(Long id, String type, String title, String description, String path) { }
    public record GroupError(int status, String message) { }
    public record Group(String key, String title, List<Item> items, GroupError error, boolean hasMore) {
        static Group empty(String key, String title) { return new Group(key, title, List.of(), null, false); }
    }
}
