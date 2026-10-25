import Hangul from 'hangul-js';
import { REGION_OPTIONS } from '../constants/regions';

const TYPOS = { 스터디오: '스튜디오', 스투디오: '스튜디오', 필라태스: '필라테스', 메세지: '메시지', 웨이딩: '웨이팅', 에약: '예약' };
const WORDS = ['스튜디오', '필라테스', '클리닉', '웨이팅', '메시지'];
const DISTRICTS = { 강남: ['서울 강남구'], 강남구: ['서울 강남구'], 송파: ['서울 송파구'], 송파구: ['서울 송파구'],
    용산: ['서울 용산구'], 용산구: ['서울 용산구'], 종로: ['서울 종로구'], 종로구: ['서울 종로구'],
    중구: ['서울 중구', '부산 중구', '대구 중구', '인천 중구', '대전 중구', '울산 중구'] };
export const PERSONAL_SEARCH_SCOPES = ['reservations', 'waiting', 'messages'];
const SCOPE_WORDS = [
    ['reservations', /^(?:내가 예약한|내 예약(?:한)?|예약한 내역)(?:\s+|$)/u],
    ['waiting', /^(?:내가 접수한 웨이팅|내 웨이팅|내 대기)(?:\s+|$)/u],
    ['messages', /^(?:내 메시지|내 대화|내 채팅)(?:\s+|$)/u],
];
const normalized = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';

function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, changes = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++changes > 1) return false;
        if (a.length <= b.length) j++;
        if (a.length >= b.length) i++;
    }
    return changes + (i < a.length || j < b.length ? 1 : 0) === 1;
}

export function searchCorrections(keyword) {
    const text = normalized(keyword);
    if (!text || text.length > 100 || /[\p{Cc}]/u.test(text)) return [];
    const words = text.split(' ');
    const fixed = words.map(word => TYPOS[word] ?? word).join(' ');
    if (fixed !== text) return [{ keyword: fixed, kind: 'correction' }];
    if (words.length !== 1 || !/^[가-힣]{3,8}$/u.test(text) || WORDS.includes(text)) return [];
    const letters = Hangul.disassemble(text);
    return WORDS.filter(word => oneEdit(letters, Hangul.disassemble(word)))
        .slice(0, 2).map(word => ({ keyword: word, kind: 'correction' }));
}

export function koreanSearchDate(now = new Date(), offset = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(now);
    const part = type => parts.find(value => value.type === type).value;
    const day = new Date(Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')) + offset));
    return day.toISOString().slice(0, 10);
}

export function understandSearch(keyword, { choice = '', now = new Date() } = {}) {
    const original = normalized(keyword);
    const plan = { scope: 'all', term: original, date: '', region: '', choices: [], label: '', choice };
    if (!original || original.length > 100 || /[\p{Cc}]/u.test(original)) return plan;
    let term = original;
    for (const [scope, pattern] of SCOPE_WORDS) if (pattern.test(term)) {
        plan.scope = scope; term = term.replace(pattern, ''); break;
    }
    const dateMatch = /(?:^|\s)(오늘|내일|어제)(?=\s|$)/u.exec(term);
    if (dateMatch && (plan.scope !== 'all' || /(?:^|\s)예약(?=\s|$)/u.test(term))) {
        const date = koreanSearchDate(now, { 오늘: 0, 내일: 1, 어제: -1 }[dateMatch[1]]);
        term = term.replace(dateMatch[0], ' ').trim();
        if (plan.scope === 'all') {
            term = term.replace(/(?:^|\s)예약(?=\s|$)/u, ' ').trim();
            plan.choices = [{ id: 'reservations', label: dateMatch[1] + ' 내 예약', scope: 'reservations', date },
                { id: 'stores', label: '예약할 가게 찾기', scope: 'stores', date: '', note: '예약 가능 시간은 가게 상세에서 확인해요.' }];
            const selected = plan.choices.find(item => item.id === choice.split('|')[0]);
            if (!selected) return { ...plan, term };
            Object.assign(plan, selected, { choices: [] });
        } else if (['reservations', 'waiting', 'messages'].includes(plan.scope)) plan.date = date;
    }
    if (plan.scope === 'all' || plan.scope === 'stores') {
        const tokens = term.split(' ').filter(Boolean);
        const first = tokens[0];
        const province = REGION_OPTIONS.find(item => [item.value, item.label].includes(first));
        const districts = DISTRICTS[first];
        if (province) {
            plan.scope = 'stores'; plan.region = province.value; tokens.shift();
            const district = DISTRICTS[tokens[0]]?.find(region => region.startsWith(province.value + ' '));
            if (district) { plan.region = district; tokens.shift(); }
            else if (/^[가-힣]{1,12}[시군구]$/u.test(tokens[0] ?? '')) plan.region += ' ' + tokens.shift();
            term = tokens.join(' ');
        }
        else if (districts?.length === 1) { plan.scope = 'stores'; plan.region = districts[0]; tokens.shift(); term = tokens.join(' '); }
        else if (districts?.length > 1) {
            const prefix = dateMatch ? 'stores|' : '';
            plan.choices = districts.map(region => ({ id: prefix + region, label: region, scope: 'stores', region }));
            const selected = plan.choices.find(item => item.id === choice);
            if (selected) { Object.assign(plan, selected, { choices: [] }); tokens.shift(); term = tokens.join(' '); }
        }
    }
    plan.term = term;
    plan.label = [plan.region, plan.date, { reservations: '내 예약', waiting: '내 웨이팅', messages: '내 메시지', stores: '가게' }[plan.scope]].filter(Boolean).join(' · ');
    return plan;
}

export function searchPlanKey(plan) {
    return [plan.scope, plan.term, plan.date, plan.region].join('\u001f');
}
