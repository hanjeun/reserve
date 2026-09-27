package kr.it.reserve.chat.dto;

public record ChatImagePayload(String key, String contentType, int width, int height, int bytes) { }
