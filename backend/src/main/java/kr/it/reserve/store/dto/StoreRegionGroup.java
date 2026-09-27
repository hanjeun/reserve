package kr.it.reserve.store.dto;

import java.util.List;

/** 등록된 공개 가게 주소에서 만든 지역 선택 항목. 빈 지역은 제공하지 않는다. */
public record StoreRegionGroup(String name, long count, List<Area> areas) {
    public record Area(String name, long count) { }
}
