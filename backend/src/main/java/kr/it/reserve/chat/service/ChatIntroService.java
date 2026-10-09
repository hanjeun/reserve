package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatIntroRequest;
import kr.it.reserve.chat.dto.ChatIntroResponse;
import kr.it.reserve.chat.entity.ChatIntro;
import kr.it.reserve.chat.entity.ChatIntroItem;
import kr.it.reserve.chat.repository.ChatIntroRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 채팅 첫 안내(공지사항 + 자동 문답) — 고객지원은 관리자가, 가게는 사장님이 설정한다 (2026-09-23).
 *
 * <p>자동 답변은 손님 화면에서만 보이는 안내다. 서버 메시지로 저장하지 않으므로
 * 사장님·관리자의 받은 문의함이나 읽지 않음 수에 영향을 주지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatIntroService {

    public static final int MAX_ITEMS = 5;
    public static final int MAX_NOTICE = 100;
    public static final int MAX_GREETING = 200;
    public static final int MAX_DISPLAY_NAME = 30;
    /** 고객지원 채팅 사진 보관 위치. 저장할 때 이 아래의 관리 파일인지 검사한다. */
    static final String SUPPORT_AVATAR_PREFIX = FileStoragePaths.supportAvatar();
    public static final int MAX_QUESTION = 40;
    public static final int MAX_ANSWER = 300;

    private final ChatIntroRepository introRepository;
    private final StoreRepository storeRepository;
    private final FileStorageService fileStorageService;
    private final FileDeletionOutboxService fileDeletionOutboxService;

    public ChatIntroResponse getSupportIntro() {
        return introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)
                .map(ChatIntroResponse::from)
                .orElseGet(ChatIntroResponse::supportDefault);
    }

    public ChatIntroResponse getStoreIntro(Long storeId) {
        findExistingStore(storeId);
        return introRepository.findByScopeKey(ChatIntro.storeScope(storeId))
                .map(ChatIntroResponse::from)
                .orElseGet(ChatIntroResponse::empty);
    }

    /** 사장님 본인 가게만 바꿀 수 있다. 사업자 역할이 아니면 과거 소유 관계가 남아 있어도 거절한다. */
    @Transactional
    public ChatIntroResponse updateStoreIntro(Member owner, Long storeId, ChatIntroRequest request) {
        Store store = findExistingStore(storeId);
        boolean ownsStore = owner != null && owner.isBusiness()
                && store.getOwner() != null && store.getOwner().getId().equals(owner.getId());
        if (!ownsStore) {
            throw new ChatException("내 가게의 자동 응답만 바꿀 수 있어요.", HttpStatus.FORBIDDEN);
        }
        // 입력을 먼저 검증한다 — 틀린 요청이 빈 설정 행부터 만들지 않게.
        String notice = normalizeNotice(request.notice());
        String greeting = normalizeGreeting(request.greeting());
        List<ChatIntroItem> items = normalizeItems(request.items());
        ChatIntro intro = introRepository.findByScopeKey(ChatIntro.storeScope(storeId))
                .orElseGet(() -> introRepository.save(ChatIntro.forStore(storeId)));
        // 가게는 표시 이름·사진을 바꿀 수 없다 — 가게 이름·대표 사진을 따른다(고객지원 사칭 방지).
        intro.replace(notice, greeting, null, null, items, owner.getId());
        return ChatIntroResponse.from(intro);
    }

    /** 관리자 권한은 컨트롤러(@PreAuthorize)와 SecurityConfig(/api/admin/**)가 이중으로 막는다. */
    @Transactional
    public ChatIntroResponse updateSupportIntro(Member admin, ChatIntroRequest request) {
        if (admin == null || !admin.isAdmin()) {
            throw new ChatException("관리자만 고객지원 자동 응답을 바꿀 수 있어요.", HttpStatus.FORBIDDEN);
        }
        String notice = normalizeNotice(request.notice());
        String greeting = normalizeGreeting(request.greeting());
        String displayName = normalizeDisplayName(request.displayName());
        String avatarUrl = normalizeSupportAvatar(request.avatarUrl());
        List<ChatIntroItem> items = normalizeItems(request.items());
        ChatIntro intro = introRepository.findByScopeKey(ChatIntro.SUPPORT_SCOPE)
                .orElseGet(() -> introRepository.save(ChatIntro.forSupport()));
        String previousAvatar = intro.getAvatarUrl();
        intro.replace(notice, greeting, displayName, avatarUrl, items, admin.getId());
        // 바뀐 사진의 옛 파일은 커밋 뒤 지운다(삭제 대기열).
        if (previousAvatar != null && !previousAvatar.equals(avatarUrl)) {
            fileDeletionOutboxService.enqueue(previousAvatar, "CHAT_INTRO_AVATAR", intro.getId());
        }
        return ChatIntroResponse.from(intro);
    }

    /** 고객지원 채팅 사진 올리기 — 저장은 따로(PUT)다. 이미지 검사는 storeFile 이 한다. */
    @Transactional
    public String uploadSupportAvatar(Member admin, MultipartFile image) {
        if (admin == null || !admin.isAdmin()) {
            throw new ChatException("관리자만 고객지원 사진을 바꿀 수 있어요.", HttpStatus.FORBIDDEN);
        }
        if (image == null || image.isEmpty()) throw new ChatException("사진을 선택해주세요.");
        String key = fileStorageService.storeFile(image, SUPPORT_AVATAR_PREFIX);
        return fileStorageService.getPublicUrl(key);
    }

    private Store findExistingStore(Long storeId) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ChatException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        if (store.isDeleted()) {
            throw new ChatException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND);
        }
        return store;
    }

    /** 인사말은 여러 줄을 허용한다(빈 줄 = 문단). 세 줄 이상 빈 줄은 두 줄로 줄인다. 비우면 기본 문구. */
    static String normalizeGreeting(String greeting) {
        if (greeting == null) return null;
        String value = greeting.replace("\r\n", "\n").replaceAll("\n{3,}", "\n\n").strip();
        if (value.isEmpty()) return null;
        if (value.length() > MAX_GREETING) {
            throw new ChatException("인사말은 " + MAX_GREETING + "자까지 입력할 수 있어요.");
        }
        return value;
    }

    static String normalizeDisplayName(String displayName) {
        if (displayName == null) return null;
        String value = displayName.replaceAll("\\s+", " ").strip();
        if (value.isEmpty()) return null;
        if (value.length() > MAX_DISPLAY_NAME) {
            throw new ChatException("표시 이름은 " + MAX_DISPLAY_NAME + "자까지 입력할 수 있어요.");
        }
        return value;
    }

    /** 고객지원 사진은 우리가 올린 파일(support/chat 아래)만 받는다. 비우면 기본 R 로고. */
    private String normalizeSupportAvatar(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) return null;
        String value = avatarUrl.strip();
        if (!fileStorageService.isManagedFileUnderPrefix(value, SUPPORT_AVATAR_PREFIX)) {
            throw new ChatException("올린 사진만 쓸 수 있어요. 사진을 다시 올려주세요.");
        }
        return value;
    }

    /** 공지사항은 확성기 줄 한 줄 안내라 줄바꿈·연속 공백을 한 칸으로 합친다. */
    static String normalizeNotice(String notice) {
        if (notice == null) return null;
        String value = notice.replaceAll("\\s+", " ").strip();
        if (value.isEmpty()) return null;
        if (value.length() > MAX_NOTICE) {
            throw new ChatException("공지사항은 " + MAX_NOTICE + "자까지 입력할 수 있어요.");
        }
        return value;
    }

    /**
     * 칸마다 앞뒤 공백을 지우고, 질문은 한 줄로 만든다. 답변은 줄바꿈을 살린다.
     * 같은 질문이 두 번 있으면 손님 화면에서 버튼이 겹치므로 거절한다(대소문자·공백 무시).
     */
    static List<ChatIntroItem> normalizeItems(List<ChatIntroRequest.Item> items) {
        if (items == null || items.isEmpty()) return List.of();
        if (items.size() > MAX_ITEMS) {
            throw new ChatException("자주 묻는 질문은 " + MAX_ITEMS + "개까지 등록할 수 있어요.");
        }
        List<ChatIntroItem> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (ChatIntroRequest.Item item : items) {
            if (item == null) throw new ChatException("질문과 답변을 입력해주세요.");
            String question = item.question() == null ? "" : item.question().replaceAll("\\s+", " ").strip();
            String answer = item.answer() == null ? "" : item.answer().replace("\r\n", "\n").strip();
            validateItemText(question, answer);
            if (!seen.add(question.toLowerCase(Locale.ROOT))) {
                throw new ChatException("같은 질문이 두 번 들어 있어요.");
            }
            result.add(new ChatIntroItem(question, answer));
        }
        return List.copyOf(result);
    }

    private static void validateItemText(String question, String answer) {
        if (question.isEmpty()) throw new ChatException("질문을 입력해주세요.");
        if (answer.isEmpty()) throw new ChatException("답변을 입력해주세요.");
        if (question.length() > MAX_QUESTION) {
            throw new ChatException("질문은 " + MAX_QUESTION + "자까지 입력할 수 있어요.");
        }
        if (answer.length() > MAX_ANSWER) {
            throw new ChatException("답변은 " + MAX_ANSWER + "자까지 입력할 수 있어요.");
        }
    }
}
