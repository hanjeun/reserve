import { useId, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover } from 'antd';
import { ArrowRightOutlined, SmileOutlined, StopOutlined } from '../common/icons';
import { SpinIndicator } from '../common/Loading';
import ChatImagePicker from './ChatImagePicker';
import Tooltip from '../common/Tooltip';
import { colors } from '../../styles/tokens';

const usesTouchInput = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

const EMOJI = [
    ['😀', '웃음 smile happy'], ['😊', '미소 smile'], ['😂', '웃음 눈물 laugh'], ['🥰', '사랑 love'],
    ['😍', '하트 사랑 heart love'], ['😎', '멋짐 cool'], ['🤔', '생각 thinking'], ['😅', '땀 sweat'],
    ['😭', '슬픔 눈물 cry'], ['😢', '슬픔 sad'], ['😮', '놀람 surprise'], ['😴', '잠 sleep'],
    ['👍', '좋아요 thumb up'], ['👎', '싫어요 thumb down'], ['👏', '박수 clap'], ['🙏', '감사 부탁 thanks'],
    ['👋', '인사 wave'], ['🙌', '만세 hooray'], ['👌', '확인 ok'], ['💪', '응원 힘 strength'],
    ['❤️', '하트 사랑 heart love'], ['💙', '파란 하트 blue heart'], ['✨', '반짝 sparkle'], ['🎉', '축하 party'],
    ['✅', '확인 완료 check'], ['☕', '커피 coffee'], ['🍀', '행운 clover'], ['🌸', '꽃 flower'],
];

/** 고객·사업자·관리자 입력의 IME/길이/도구/전송 규칙을 한 관문에 둔다. */
export default function ChatComposer({ value, onChange, onSend, sending = false, disabled = false,
    file, onFileChange, imageEnabled = false, imageLoading = false, onCancel,
    files, onFilesChange, onRemoveFile,
    maxLength = 2000, placeholder = '메시지를 입력하세요', inputLabel = '메시지 입력', sendText = '보내기',
    inputRef, attachmentControl, attachments, attachmentError, hasAttachments = Boolean(files?.length || file) }) {
    const input = useRef(null);
    useImperativeHandle(inputRef, () => input.current, []);
    const trigger = useRef(null);
    const searchInput = useRef(null);
    const id = useId();
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [query, setQuery] = useState('');
    const blocked = disabled || sending;
    const emojis = EMOJI.filter(([emoji, keywords]) => `${emoji} ${keywords}`.includes(query.trim().toLowerCase()));
    const selectEmoji = emoji => {
        const start = input.current?.selectionStart ?? value.length;
        const end = input.current?.selectionEnd ?? start;
        if (value.length - (end - start) + emoji.length > maxLength) return;
        onChange(`${value.slice(0, start)}${emoji}${value.slice(end)}`);
        setEmojiOpen(false);
        requestAnimationFrame(() => {
            if (usesTouchInput()) trigger.current?.focus();
            else input.current?.focus();
            input.current?.setSelectionRange(start + emoji.length, start + emoji.length);
        });
    };
    const closePickerOnEscape = event => {
        if (event.key === 'Escape') { setEmojiOpen(false); trigger.current?.focus(); }
    };
    // Escape는 포커스 가능한 검색·이모지 버튼에서 처리한다.
    const picker = <section className="reserve-chat-emoji-picker" id={id} aria-label="이모지 선택">
        <input ref={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)}
            onKeyDown={closePickerOnEscape}
            placeholder="이모지 검색" aria-label="이모지 검색" />
        <div className="reserve-chat-emoji-grid">
            {emojis.map(([emoji, keywords]) => <button key={emoji} type="button" disabled={blocked}
                aria-label={`${keywords.split(' ')[0]} ${emoji}`} onClick={() => selectEmoji(emoji)}
                onKeyDown={closePickerOnEscape}>{emoji}</button>)}
        </div>
        {emojis.length === 0 && <p><output>검색 결과가 없어요.</output></p>}
    </section>;
    // 전송 버튼: 보내는 중이면 (중단 가능 시) 중단 · 아니면 로딩, 평소에는 보내기.
    const canCancel = sending && Boolean(onCancel);
    let sendLabel = sendText;
    let sendIcon = <ArrowRightOutlined />;
    if (canCancel) {
        sendLabel = '전송 요청 중단';
        sendIcon = <StopOutlined />;
    } else if (sending) {
        sendLabel = '보내는 중';
        sendIcon = <span aria-hidden="true"><SpinIndicator /></span>;
    }
    const renderComposer = (control, previews) => <div className="reserve-chat-composer reserve-messenger-composer">
        <div className="reserve-chat-composer-input-area">
        <textarea ref={input} value={value} onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                    event.preventDefault();
                    if (!blocked && (value.trim() || hasAttachments)) onSend();
                }
            }} placeholder={placeholder} aria-label={inputLabel} maxLength={maxLength} rows={2} disabled={disabled} />
        <div className="reserve-chat-composer-attachments">
            {attachmentError && <span role="alert" style={{ color: colors.error.main, fontSize: 12 }}>{attachmentError}</span>}
            {previews}
        </div>
        </div>
        <div className="reserve-chat-composer-toolbar">
            <div className="reserve-chat-composer-tools">
                {control}
                <Popover trigger="click" placement="topLeft" content={picker} open={emojiOpen && !blocked}
                    onOpenChange={open => {
                        setEmojiOpen(open);
                        if (open) { setQuery(''); if (usesTouchInput()) input.current?.blur(); }
                    }}
                    afterOpenChange={open => { if (open && !usesTouchInput()) searchInput.current?.focus(); }}>
                    <Tooltip title="이모지 선택" disabled={emojiOpen}><button ref={trigger} type="button" className="reserve-chat-tool" aria-label="이모지 선택"
                        onKeyDown={event => { if (event.key === 'Escape' && emojiOpen) { event.stopPropagation(); setEmojiOpen(false); } }}
                        aria-expanded={emojiOpen && !blocked} aria-controls={emojiOpen && !blocked ? id : undefined} disabled={blocked}>
                        <SmileOutlined />
                    </button></Tooltip>
                </Popover>
            </div>
            <Tooltip title={sendLabel}><button type="button" className="reserve-chat-send reserve-messenger-send" onClick={sending && onCancel ? onCancel : onSend}
                disabled={disabled || (sending ? !onCancel : (!value.trim() && !hasAttachments))} aria-label={sendLabel}
                aria-busy={sending || undefined}>
                {sendIcon}
            </button></Tooltip>
        </div>
    </div>;
    if (typeof attachmentControl === 'function') {
        return attachmentControl((control, previews) => renderComposer(control, <>{previews}{attachments}</>));
    }
    if (attachmentControl != null) return renderComposer(attachmentControl, attachments);
    return <ChatImagePicker file={file} onChange={onFileChange} files={files} onFilesChange={onFilesChange} onRemoveFile={onRemoveFile}
        enabled={imageEnabled || imageLoading} disabled={blocked || imageLoading}
        renderContent={(control, previews) => renderComposer(control, attachments ?? previews)} />;
}

ChatComposer.propTypes = {
    value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, onSend: PropTypes.func.isRequired,
    sending: PropTypes.bool, disabled: PropTypes.bool, file: PropTypes.object,
    onFileChange: PropTypes.func, imageEnabled: PropTypes.bool, imageLoading: PropTypes.bool,
    onCancel: PropTypes.func, maxLength: PropTypes.number, placeholder: PropTypes.string, inputLabel: PropTypes.string,
    sendText: PropTypes.string, inputRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
    attachmentControl: PropTypes.oneOfType([PropTypes.node, PropTypes.func]), attachments: PropTypes.node,
    attachmentError: PropTypes.string, hasAttachments: PropTypes.bool,
    files: PropTypes.arrayOf(PropTypes.object), onFilesChange: PropTypes.func, onRemoveFile: PropTypes.func,
};
