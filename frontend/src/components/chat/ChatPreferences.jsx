import { useId } from 'react';
import { FormSelect } from '../common';
import useChatPreferences, { CHAT_COLOR_OPTIONS } from '../../hooks/useChatPreferences';

export default function ChatPreferences() {
    const id = useId();
    const selectId = `${id}-select`;
    const { color, setColor } = useChatPreferences();
    return <div className="reserve-chat-preferences">
        <label id={id} htmlFor={selectId}>내 말풍선 색</label>
        <p>이 기기의 채팅에만 적용돼요. 앱의 포인트 색은 바뀌지 않아요.</p>
        <FormSelect id={selectId} aria-labelledby={id} value={color} onChange={setColor}
            options={CHAT_COLOR_OPTIONS.map(option => ({ value: option.value, label: <span className="reserve-chat-color-option">
                <span aria-hidden="true" style={{ background: option.background }} />{option.label}
            </span> }))} />
    </div>;
}
