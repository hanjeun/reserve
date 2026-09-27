import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveBin } from './resolve-bin.mjs';

// Exactly the currently deployed v2.6.3 source, not the dirty preview or a floating main ref.
export const ROLLBACK_BASE = 'b478ae8d732afa1e35642d790bfc39972556f885';
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const git = resolveBin('git');
const replaceOnce = (text, before, after) => {
    if (text.split(before).length !== 2) throw new Error('Rollback base no longer matches the reviewed patch');
    return text.replace(before, after);
};

export function rollbackChanges() {
    const base = file => execFileSync(git, ['show', `${ROLLBACK_BASE}:${file}`],
        { cwd: repo, encoding: 'utf8', windowsHide: true }).replace(/\r\n/g, '\n');
    const edits = [];
    const edit = (file, transform) => { const before = base(file); edits.push({ file, before, after: transform(before) }); };
    edit('backend/src/main/java/kr/it/reserve/chat/entity/SenderRole.java', text => replaceOnce(text, '    ADMIN\n', '    ADMIN,\n    /** Read compatibility only: the rollback server cannot create store messages. */\n    OWNER\n'));
    edit('backend/src/main/java/kr/it/reserve/chat/entity/ChatMessage.java', text => replaceOnce(text, '    @CreatedDate\n',
        '    @Column(name = "image_key", length = 512)\n    private String imageKey;\n\n    @Column(name = "retracted_at")\n    private LocalDateTime retractedAt;\n\n    @CreatedDate\n'));
    edit('backend/src/main/java/kr/it/reserve/chat/dto/ChatMessageResponse.java', text => replaceOnce(text,
        '                .content(m.getContent())',
        '                // Never reveal retained originals or encrypted object keys after rollback.\n' +
        '                .content(m.getRetractedAt() != null ? "전송이 취소된 메시지입니다."\n' +
        '                        : m.getImageKey() != null && (m.getContent() == null || m.getContent().isBlank())\n' +
        '                        ? "사진 메시지입니다. 새 버전에서 확인해주세요." : m.getContent())'));
    edit('backend/src/main/java/kr/it/reserve/chat/repository/ChatRoomRepository.java', text => {
        text = replaceOnce(text, '              JOIN FETCH r.member\n', '              JOIN FETCH r.member\n             WHERE r.type = :type\n');
        text = replaceOnce(text, 'countQuery = "SELECT COUNT(r) FROM ChatRoom r"', 'countQuery = "SELECT COUNT(r) FROM ChatRoom r WHERE r.type = :type"');
        text = replaceOnce(text, 'findAllForAdmin(Pageable pageable)', 'findAllForAdmin(@Param("type") ChatRoom.RoomType type, Pageable pageable)');
        text = replaceOnce(text, 'WHERE r.adminUnread > 0"', 'WHERE r.adminUnread > 0 AND r.type = :type"');
        text = replaceOnce(text, 'countRoomsWaitingForAdmin()', 'countRoomsWaitingForAdmin(@Param("type") ChatRoom.RoomType type)');
        return replaceOnce(text, 'WHERE r.member.id = :memberId"', 'WHERE r.member.id = :memberId AND r.type = \'SUPPORT\'"');
    });
    edit('backend/src/main/java/kr/it/reserve/chat/service/ChatService.java', text => {
        text = replaceOnce(text, 'findAllForAdmin(pageable)', 'findAllForAdmin(ChatRoom.RoomType.SUPPORT, pageable)');
        text = replaceOnce(text, 'countRoomsWaitingForAdmin()', 'countRoomsWaitingForAdmin(ChatRoom.RoomType.SUPPORT)');
        text = replaceOnce(text, '    public List<ChatMessageResponse> getNewMessages(Long roomId, Long afterId) {\n',
            '    public List<ChatMessageResponse> getNewMessages(Long roomId, Long afterId) {\n        findRoom(roomId); // SUPPORT only, including administrator polling.\n');
        text = replaceOnce(text, 'return roomRepository.findById(roomId)\n', 'return roomRepository.findById(roomId)\n                .filter(room -> room.getType() == ChatRoom.RoomType.SUPPORT)\n');
        return replaceOnce(text, 'return roomRepository.findByIdForUpdate(roomId)\n', 'return roomRepository.findByIdForUpdate(roomId)\n                .filter(room -> room.getType() == ChatRoom.RoomType.SUPPORT)\n');
    });
    edits.push({ file: 'backend/src/test/java/kr/it/reserve/chat/ChatRollbackCompatibilityTest.java', before: null,
        after: readFileSync(new URL('../docs/technical/release-fixtures/v270-rollback/ChatRollbackCompatibilityTest.java', import.meta.url), 'utf8').replace(/\r\n/g, '\n') });
    return edits;
}

const lines = text => text.trimEnd().split('\n');
export function rollbackPatch(target, format = 'apply') {
    if (!isAbsolute(target)) throw new Error('Use an absolute isolated directory');
    const root = resolve(target).replace(/\\/g, '/');
    if (root === repo.replace(/\\/g, '/')) throw new Error('Do not replace the release candidate with rollback sources');
    const edits = rollbackChanges();
    if (format === 'git') return edits.map(({file,before,after}) => before === null
        ? `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines(after).length} @@\n${lines(after).map(line => '+'+line).join('\n')}\n`
        : `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${lines(before).length} +1,${lines(after).length} @@\n` +
        lines(before).map(line => '-'+line).join('\n')+'\n'+lines(after).map(line => '+'+line).join('\n')+'\n').join('');
    return '*** Begin Patch\n' + edits.map(({file,before,after}) =>
        (before === null ? `*** Add File: ${root}/${file}\n` : `*** Update File: ${root}/${file}\n@@\n`+lines(before).map(line => '-'+line).join('\n')+'\n')+
        lines(after).map(line => '+'+line).join('\n')+'\n').join('')+'*** End Patch\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [target, mode] = process.argv.slice(2);
    if (process.argv.length > 4 || !target || (mode && mode !== '--git-patch')) throw new Error('Usage: prepare-v270-rollback.mjs absolute-isolated-directory [--git-patch]');
    process.stdout.write(rollbackPatch(target, mode ? 'git' : 'apply'));
}
