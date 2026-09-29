import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, FormField, FormInput, FormTextArea, SegmentedControl } from '../common';
import useFormErrors from '../../hooks/useFormErrors';
import ChatIntroPreview from './ChatIntroPreview';
import MessengerAvatar from './MessengerAvatar';
import { DEFAULT_STORE_GREETING, DEFAULT_SUPPORT_GREETING, SUPPORT_DISPLAY_NAME } from '../../constants/chatIntro';

const LIMITS = Object.freeze({ items: 5, notice: 100, greeting: 200, displayName: 30, question: 40, answer: 300 });
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const MOBILE_PANES = [
    { value: 'edit', label: '설정' },
    { value: 'preview', label: '미리보기' },
];

// 편집 중인 항목의 React key. 서로 겹치지만 않으면 되므로 모듈 순번을 쓴다(렌더 중 ref 접근 금지 규칙).
let draftSeq = 0;
const nextId = () => { draftSeq += 1; return draftSeq; };
const toDraftItems = (items) => (items || []).map(item => ({ id: nextId(), question: item.question || '', answer: item.answer || '' }));

const draftOf = (intro) => ({
    notice: intro?.notice || '',
    greeting: intro?.greeting || '',
    displayName: intro?.displayName || '',
    avatarUrl: intro?.avatarUrl || '',
});
// 서버와 같은 정리 규칙. 표시 이름·사진은 바꿀 수 있는 곳(고객지원)에서만 보낸다.
const bodyOf = (draft, items, identityEditable) => ({
    notice: draft.notice.replace(/\s+/g, ' ').trim() || null,
    greeting: draft.greeting.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null,
    displayName: identityEditable ? (draft.displayName.replace(/\s+/g, ' ').trim() || null) : null,
    avatarUrl: identityEditable ? (draft.avatarUrl || null) : null,
    items: items.map(item => ({ question: item.question.replace(/\s+/g, ' ').trim(), answer: item.answer.trim() })),
});

/**
 * 채팅 관리 편집기 — 사업자 패널(가게별)과 관리자 패널(고객지원)이 같은 화면을 쓴다 (2026-09-24 채팅 관리로 확장).
 *
 * <p>프로필 · 공지사항 · 인사말 · 자주 묻는 질문을 고치고, 오른쪽(모바일은 `설정 | 미리보기` 전환)에서
 * 손님이 보는 대화창 그대로 확인한다. 가게는 표시 이름·사진을 가게 정보에서 가져온다 — 채팅에서 따로 바꾸면
 * "RESERVE 고객지원" 같은 사칭이 가능해져서다. 칸 오류는 칸 아래에 바로 보인다(useFormErrors — 토스트 금지).
 */
export default function ChatIntroEditor({ intro, onSave, onUploadAvatar, saving = false, kind = 'store', identity, noticeHelp }) {
    const isStore = kind === 'store';
    const identityEditable = !isStore;
    const defaultGreeting = isStore ? DEFAULT_STORE_GREETING : DEFAULT_SUPPORT_GREETING;
    const [draft, setDraft] = useState(() => draftOf(intro));
    const [items, setItems] = useState(() => toDraftItems(intro?.items));
    const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(bodyOf(draftOf(intro), toDraftItems(intro?.items), identityEditable)));
    const [mobilePane, setMobilePane] = useState('edit');
    const [previewRound, setPreviewRound] = useState(0);
    const [avatarState, setAvatarState] = useState({ uploading: false, error: null });
    const fileInputRef = useRef(null);
    const { errors, validate, clearError, resetErrors } = useFormErrors();

    const body = bodyOf(draft, items, identityEditable);
    const dirty = JSON.stringify(body) !== savedSnapshot;
    // 질문·답변이 둘 다 있는 항목만 손님에게 보인다. 미리보기도 같은 기준이다.
    const previewItems = body.items.filter(item => item.question && item.answer);
    const full = items.length >= LIMITS.items;
    const shownName = isStore ? identity?.name : (body.displayName || SUPPORT_DISPLAY_NAME);
    const shownImage = isStore ? identity?.imageSrc : (draft.avatarUrl || undefined);

    const setField = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
    const updateItem = (id, field, value) => setItems(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
    const addItem = () => { if (!full) setItems(prev => [...prev, { id: nextId(), question: '', answer: '' }]); };
    const removeItem = (id) => { setItems(prev => prev.filter(item => item.id !== id)); resetErrors(); };
    const apply = (next) => {
        const nextDraft = draftOf(next);
        const nextItems = toDraftItems(next?.items);
        setDraft(nextDraft);
        setItems(nextItems);
        setSavedSnapshot(JSON.stringify(bodyOf(nextDraft, nextItems, identityEditable)));
        setAvatarState({ uploading: false, error: null });
        resetErrors();
    };
    const revert = () => apply(JSON.parse(savedSnapshot));

    const pickAvatar = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setAvatarState({ uploading: false, error: '사진 파일만 올릴 수 있어요.' }); return; }
        if (file.size > AVATAR_MAX_BYTES) { setAvatarState({ uploading: false, error: '사진은 5MB까지 올릴 수 있어요.' }); return; }
        setAvatarState({ uploading: true, error: null });
        try {
            const url = await onUploadAvatar(file);
            setField('avatarUrl', url);
            setAvatarState({ uploading: false, error: null });
        } catch {
            setAvatarState({ uploading: false, error: '사진을 올리지 못했어요. 잠시 후 다시 시도해주세요.' });
        }
    };

    const handleSave = async () => {
        const passed = validate((e) => {
            const seen = new Set();
            body.items.forEach((item, index) => {
                const id = items[index].id;
                const key = item.question.toLowerCase();
                if (!item.question) e[`question-${id}`] = '질문을 입력해주세요.';
                else if (seen.has(key)) e[`question-${id}`] = '같은 질문이 이미 있어요.';
                if (!item.answer) e[`answer-${id}`] = '답변을 입력해주세요.';
                seen.add(key);
            });
        });
        if (!passed) { setMobilePane('edit'); return; }
        let saved;
        try {
            saved = await onSave(body);
        } catch {
            // 실패 안내는 호출부(저장 요청)가 한다. 입력은 그대로 둬서 다시 저장할 수 있게 한다.
            return;
        }
        apply(saved && Array.isArray(saved.items) ? saved : { ...body, items: body.items });
    };

    return (
        <div className={'reserve-chat-intro-editor' + (mobilePane === 'preview' ? ' is-preview-pane' : '')}>
            <div className="reserve-chat-intro-switch">
                <SegmentedControl options={MOBILE_PANES} value={mobilePane} onChange={setMobilePane} />
            </div>

            <div className="reserve-chat-intro-settings">
                <section className="reserve-chat-intro-card">
                    <div className="reserve-chat-intro-card-head">
                        <h3>프로필</h3>
                        <p>{isStore
                            ? '대화창 위쪽과 대화 목록에는 가게 이름과 대표 사진이 보여요. 바꾸려면 가게 정보 수정에서 바꿔 주세요. 다른 곳을 사칭하지 못하게 채팅에서는 따로 바꿀 수 없어요.'
                            : '대화창 위쪽, 대화 목록, 답변 말풍선에 보이는 이름과 사진이에요.'}</p>
                    </div>
                    <div className="reserve-chat-intro-identity">
                        <MessengerAvatar variant={isStore ? 'store' : 'brand'} imageSrc={shownImage || undefined}
                            className="reserve-chat-intro-identity-avatar" />
                        {identityEditable ? (
                            <div className="reserve-chat-intro-identity-fields">
                                <FormField label="표시 이름">
                                    <FormInput value={draft.displayName} onChange={event => setField('displayName', event.target.value)}
                                        maxLength={LIMITS.displayName} showCount placeholder={SUPPORT_DISPLAY_NAME} aria-label="표시 이름" />
                                </FormField>
                                <div className="reserve-chat-intro-identity-actions">
                                    <Button variant="outline" size="sm" loading={avatarState.uploading}
                                        onClick={() => fileInputRef.current?.click()}>사진 바꾸기</Button>
                                    {draft.avatarUrl && (
                                        <Button variant="ghost-sm" size="sm" onClick={() => setField('avatarUrl', '')}>기본 사진으로</Button>
                                    )}
                                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={pickAvatar} aria-label="고객지원 사진 파일" />
                                </div>
                                {avatarState.error && <p className="reserve-chat-intro-error" role="alert">{avatarState.error}</p>}
                            </div>
                        ) : (
                            <div className="reserve-chat-intro-identity-readonly">
                                <strong>{identity?.name || '가게'}</strong>
                                <span>가게 문의</span>
                            </div>
                        )}
                    </div>
                </section>

                <section className="reserve-chat-intro-card">
                    <div className="reserve-chat-intro-card-head">
                        <h3>공지사항</h3>
                        <p>{noticeHelp}</p>
                    </div>
                    <FormInput value={draft.notice} onChange={event => setField('notice', event.target.value)}
                        maxLength={LIMITS.notice} showCount placeholder="예: 9월 30일은 임시 휴무입니다." aria-label="공지사항" />
                </section>

                <section className="reserve-chat-intro-card">
                    <div className="reserve-chat-intro-card-head">
                        <div className="reserve-chat-intro-title-row">
                            <h3>인사말</h3>
                            <Button variant="ghost-sm" size="sm" onClick={() => setField('greeting', defaultGreeting)}
                                disabled={draft.greeting === defaultGreeting}>기본 문구로</Button>
                        </div>
                        <p>공지사항 아래에 보이는 인사예요. {'{이름}'}은 손님 이름으로 바뀌고(모르면 &apos;회원&apos;), 빈 줄로 문단을 나눠요. 비우면 기본 문구가 보여요.</p>
                    </div>
                    <FormTextArea value={draft.greeting} onChange={event => setField('greeting', event.target.value)}
                        maxLength={LIMITS.greeting} showCount rows={5} aria-label="인사말" />
                </section>

                <section className="reserve-chat-intro-card">
                    <div className="reserve-chat-intro-card-head">
                        <div className="reserve-chat-intro-title-row">
                            <h3>자주 묻는 질문 <span className="reserve-chat-intro-count">{items.length} / {LIMITS.items}</span></h3>
                            <Button variant="ghost-sm-primary" size="sm" icon={<PlusOutlined />} onClick={addItem} disabled={full}>질문 추가</Button>
                        </div>
                        <p>손님이 질문을 누르면 답변이 바로 보여요. 손님 화면에만 보이는 안내라 문의함에는 쌓이지 않아요.</p>
                    </div>
                    {items.length === 0 ? (
                        <div className="reserve-chat-intro-empty">
                            <p>아직 등록한 질문이 없어요.<br />주차, 영업시간처럼 자주 받는 질문을 추가해 보세요.</p>
                        </div>
                    ) : (
                        <ol className="reserve-chat-intro-items">
                            {items.map((item, index) => (
                                <li key={item.id} className="reserve-chat-intro-item">
                                    <div className="reserve-chat-intro-item-head">
                                        <span className="reserve-chat-intro-item-index">질문 {index + 1}</span>
                                        <button type="button" className="reserve-chat-icon-button"
                                            aria-label={`질문 ${index + 1} 삭제`} onClick={() => removeItem(item.id)}>
                                            <DeleteOutlined aria-hidden="true" />
                                        </button>
                                    </div>
                                    <FormField label="질문" error={errors[`question-${item.id}`]}>
                                        <FormInput value={item.question}
                                            onChange={event => { updateItem(item.id, 'question', event.target.value); clearError(`question-${item.id}`); }}
                                            maxLength={LIMITS.question} showCount placeholder="예: 주차할 수 있나요?" aria-label={`질문 ${index + 1}`} />
                                    </FormField>
                                    <FormField label="답변" error={errors[`answer-${item.id}`]}>
                                        <FormTextArea value={item.answer}
                                            onChange={event => { updateItem(item.id, 'answer', event.target.value); clearError(`answer-${item.id}`); }}
                                            maxLength={LIMITS.answer} showCount rows={3}
                                            placeholder="예: 건물 뒤편 전용 주차장에 2대까지 주차할 수 있어요." aria-label={`답변 ${index + 1}`} />
                                    </FormField>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <div className="reserve-chat-intro-actions">
                    <span className="reserve-chat-intro-dirty" aria-live="polite">{dirty ? '저장하지 않은 변경이 있어요' : ''}</span>
                    {/* 공통 폼 모달 푸터와 같은 한 쌍: 보조 outline · 주 primary, 둘 다 sm(36px) */}
                    <Button variant="outline" size="sm" onClick={revert} disabled={!dirty || saving}>되돌리기</Button>
                    <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>저장하기</Button>
                </div>
            </div>

            <section className="reserve-chat-intro-preview" aria-label="미리보기">
                <div className="reserve-chat-intro-preview-head">
                    <div className="reserve-chat-intro-title-row">
                        <strong>미리보기</strong>
                        <Button variant="ghost-sm" size="sm" icon={<ReloadOutlined />} onClick={() => setPreviewRound(round => round + 1)}>처음부터</Button>
                    </div>
                    <p>손님이 처음 문의할 때 보이는 화면이에요. 질문을 눌러 보세요.</p>
                </div>
                <ChatIntroPreview
                    key={previewRound + ':' + JSON.stringify(previewItems)}
                    kind={kind}
                    name={shownName}
                    imageSrc={shownImage}
                    userName={identity?.previewUserName}
                    notice={body.notice || undefined}
                    greeting={body.greeting || undefined}
                    items={previewItems}
                />
            </section>
        </div>
    );
}

ChatIntroEditor.propTypes = {
    intro: PropTypes.shape({
        notice: PropTypes.string,
        greeting: PropTypes.string,
        displayName: PropTypes.string,
        avatarUrl: PropTypes.string,
        items: PropTypes.arrayOf(PropTypes.shape({ question: PropTypes.string, answer: PropTypes.string })),
    }),
    /** 저장한 응답을 돌려주면 그 값(서버가 다듬은 공백 등)으로 편집 상태를 맞춘다. 실패하면 throw — 입력은 그대로 남는다. */
    onSave: PropTypes.func.isRequired,
    /** 고객지원 사진 올리기 — 올린 사진 주소를 돌려준다(저장은 저장하기에서). */
    onUploadAvatar: PropTypes.func,
    saving: PropTypes.bool,
    kind: PropTypes.oneOf(['store', 'support']),
    /** 가게: { name, imageSrc } 읽기 전용 표시. 공통: previewUserName(미리보기 손님 이름). */
    identity: PropTypes.shape({ name: PropTypes.string, imageSrc: PropTypes.string, previewUserName: PropTypes.string }),
    noticeHelp: PropTypes.string,
};
