import { useId } from 'react';
import { FormSelect } from '../common';
import useChatPreferences, { CHAT_COLOR_OPTIONS } from '../../hooks/useChatPreferences';

export default function ChatPreferences() {
    const id = useId();
    const { color, setColor } = useChatPreferences();
    return <div className="reserve-chat-preferences">
        <label id={id}>내 말풍선 색</label>
        <p>이 기기에 적용됩니다. 채팅 설정과 마이페이지가 함께 바뀝니다.</p>
        <FormSelect aria-labelledby={id} value={color} onChange={setColor}
            options={CHAT_COLOR_OPTIONS.map(option => ({ value: option.value, label: <span className="reserve-chat-color-option">
                <span aria-hidden="true" style={{ background: option.background }} />{option.label}
            </span> }))} />
    </div>;
}
