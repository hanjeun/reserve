import { useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover } from 'antd';
import { ArrowRightOutlined, LoadingOutlined, SmileOutlined, StopOutlined } from '@ant-design/icons';
import ChatImagePicker from './ChatImagePicker';

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
    file, onFileChange, imageEnabled = false, onCancel }) {
    const input = useRef(null);
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
        if (value.length - (end - start) + emoji.length > 2000) return;
        onChange(`${value.slice(0, start)}${emoji}${value.slice(end)}`);
        setEmojiOpen(false);
        requestAnimationFrame(() => {
            if (usesTouchInput()) trigger.current?.focus();
            else input.current?.focus();
            input.current?.setSelectionRange(start + emoji.length, start + emoji.length);
        });
    };
    const picker = <div className="reserve-chat-emoji-picker" id={id} role="region" aria-label="이모지 선택"
        onKeyDown={event => {
            if (event.key === 'Escape') { setEmojiOpen(false); trigger.current?.focus(); }
        }}>
        <input ref={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="이모지 검색" aria-label="이모지 검색" />
        <div className="reserve-chat-emoji-grid">
            {emojis.map(([emoji, keywords]) => <button key={emoji} type="button" disabled={blocked}
                aria-label={`${keywords.split(' ')[0]} ${emoji}`} onClick={() => selectEmoji(emoji)}>{emoji}</button>)}
        </div>
        {emojis.length === 0 && <p role="status">검색 결과가 없습니다.</p>}
    </div>;
    return <div className="reserve-chat-composer reserve-messenger-composer">
        <textarea ref={input} value={value} onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                    event.preventDefault();
                    if (!blocked && (value.trim() || file)) onSend();
                }
            }} placeholder="메시지를 입력하세요" aria-label="메시지 입력" maxLength={2000} rows={2} disabled={disabled} />
        <div className="reserve-chat-composer-toolbar">
            <div className="reserve-chat-composer-tools">
                <ChatImagePicker file={file} onChange={onFileChange} enabled={imageEnabled} disabled={blocked} />
                <Popover trigger="click" placement="topLeft" content={picker} open={emojiOpen && !blocked}
                    onOpenChange={open => {
                        setEmojiOpen(open);
                        if (open) { setQuery(''); if (usesTouchInput()) input.current?.blur(); }
                    }}
                    afterOpenChange={open => { if (open && !usesTouchInput()) searchInput.current?.focus(); }}>
                    <button ref={trigger} type="button" className="reserve-chat-tool" aria-label="이모지 선택"
                        onKeyDown={event => { if (event.key === 'Escape' && emojiOpen) { event.stopPropagation(); setEmojiOpen(false); } }}
                        aria-expanded={emojiOpen && !blocked} aria-controls={emojiOpen && !blocked ? id : undefined} disabled={blocked}>
                        <SmileOutlined />
                    </button>
                </Popover>
            </div>
            <button type="button" className="reserve-chat-send reserve-messenger-send" onClick={sending && onCancel ? onCancel : onSend}
                disabled={disabled || (sending ? !onCancel : (!value.trim() && !file))} aria-label={sending && onCancel ? '전송 요청 중단' : sending ? '보내는 중' : '보내기'}
                aria-busy={sending || undefined}>
                {sending ? onCancel ? <StopOutlined /> : <LoadingOutlined /> : <ArrowRightOutlined />}
            </button>
        </div>
    </div>;
}

ChatComposer.propTypes = {
    value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, onSend: PropTypes.func.isRequired,
    sending: PropTypes.bool, disabled: PropTypes.bool, file: PropTypes.object,
    onFileChange: PropTypes.func.isRequired, imageEnabled: PropTypes.bool,
    onCancel: PropTypes.func,
};
