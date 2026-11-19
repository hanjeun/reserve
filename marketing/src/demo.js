// 시연 상태는 각 기기 안에서만 바뀌며 계정·예약 API와 저장소를 사용하지 않는다.
export function installMarketingDemos(document) {
    const instances = [...document.querySelectorAll('[data-marketing-demo]')];
    const cleanups = [];
    for (const root of instances) {
        const find = selector => root.querySelector(selector);
        const all = selector => [...root.querySelectorAll(selector)];
        const field = name => find(`[data-demo-field="${name}"]`);
        let guests = 1;
        const localDate = offset => {
            const date = new Date(); date.setDate(date.getDate() + offset);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        const tell = text => {
            const feedback = find('[data-demo-feedback]'); feedback.textContent = text;
            const content = find('.marketing-demo-content');
            const bottom = feedback.offsetTop - content.offsetTop + feedback.offsetHeight + 16;
            if (text && bottom > content.scrollTop + content.clientHeight) content.scrollTop = bottom - content.clientHeight;
        };
        const filter = () => {
            const keyword = field('search')?.value.trim().toLocaleLowerCase() || '';
            const category = field('category')?.value || 'ALL';
            const status = field('reservation-status')?.value || 'ALL';
            let visible = 0;
            for (const card of all('[data-demo-store], [data-demo-reservation]')) {
                card.hidden = card.hasAttribute('data-demo-store')
                    ? !card.dataset.name.toLocaleLowerCase().includes(keyword) || category !== 'ALL' && card.dataset.category !== category
                    : status !== 'ALL' && card.dataset.status !== status;
                if (!card.hidden) visible++;
            }
            const empty = find('[data-demo-empty]'); if (empty) empty.hidden = visible > 0;
        };
        const reset = () => {
            guests = 1;
            for (const input of all('input, textarea')) { if (['checkbox', 'radio'].includes(input.type)) input.checked = false; else input.value = ''; }
            for (const select of all('select')) select.selectedIndex = 0;
            for (const like of all('[data-demo-like]')) like.setAttribute('aria-pressed', 'false');
            if (field('date')) { field('date').min = localDate(0); field('date').value = localDate(2); }
            if (find('[data-demo-guests]')) find('[data-demo-guests]').textContent = '1명';
            all('[data-demo-adjust]').forEach(button => { button.disabled = button.dataset.demoAdjust === '-1'; });
            const reservation = find('[data-demo-reservation]');
            if (reservation) {
                reservation.dataset.status = 'CONFIRMED'; find('[data-demo-reservation-label]').textContent = '예약 확정';
                find('[data-demo-reservation-date]').textContent = localDate(2).replaceAll('-', '. ');
                find('[data-demo-action="reservation-cancel"]').hidden = false; find('[data-demo-cancel]').hidden = true;
            }
            if (find('[data-demo-waiting-status]')) {
                find('[data-demo-waiting-status]').textContent = '대기 중'; find('[data-demo-teams]').textContent = '앞에 2팀이 기다리고 있어요.';
                find('[data-demo-action="waiting-call"]').hidden = false; find('[data-demo-action="waiting-qr"]').hidden = true;
                find('[data-demo-view="queue"]').hidden = false; find('[data-demo-view="qr"]').hidden = true;
            }
            all('[data-demo-qr]').forEach(code => { code.hidden = code.dataset.demoQr !== '1'; });
            tell(''); filter();
        };
        const book = () => {
            const date = field('date'), time = find('[data-demo-field="time"]:checked');
            const missing = !date.value || date.value < date.min ? date : !time ? field('time') : all('[data-demo-consent]').find(input => !input.checked);
            if (missing) { tell('날짜·시간과 필수 동의를 확인해주세요.'); missing.focus(); return; }
            tell(`${date.value.replaceAll('-', '. ')} ${time.value} · ${guests}명 예약 시연을 완료했어요. 실제 예약은 접수되지 않아요.`);
        };
        const click = event => {
            if (event.target.closest('a')) event.preventDefault();
            const step = event.target.closest('[data-demo-adjust]');
            if (step && !step.disabled) {
                guests = Math.max(1, Math.min(8, guests + Number(step.dataset.demoAdjust)));
                find('[data-demo-guests]').textContent = `${guests}명`;
                all('[data-demo-adjust]').forEach(button => { button.disabled = Number(button.dataset.demoAdjust) < 0 ? guests === 1 : guests === 8; });
            }
            const button = event.target.closest('[data-demo-action]');
            if (!button || button.disabled) return;
            switch (button.dataset.demoAction) {
                case 'reset': reset(); tell('예시 화면을 초기화했어요.'); break;
                case 'booking-submit': book(); break;
                case 'reservation-cancel': find('[data-demo-cancel]').hidden = false; find('[data-demo-action="reservation-confirm"]').focus(); break;
                case 'reservation-keep': find('[data-demo-cancel]').hidden = true; find('[data-demo-action="reservation-cancel"]').focus(); break;
                case 'reservation-confirm':
                    find('[data-demo-reservation]').dataset.status = 'CANCELLED'; find('[data-demo-reservation-label]').textContent = '취소';
                    find('[data-demo-cancel]').hidden = true; find('[data-demo-action="reservation-cancel"]').hidden = true;
                    tell('예시 예약을 취소했어요. 실제 예약은 바뀌지 않아요.'); filter(); break;
                case 'waiting-call':
                    find('[data-demo-waiting-status]').textContent = '호출됨'; find('[data-demo-teams]').textContent = '직원에게 입장 QR을 보여주세요.';
                    button.hidden = true; find('[data-demo-action="waiting-qr"]').hidden = false; find('[data-demo-action="waiting-qr"]').focus(); break;
                case 'waiting-qr':
                    find('[data-demo-view="queue"]').hidden = true; find('[data-demo-view="qr"]').hidden = false;
                    find('.marketing-demo-content').scrollTop = 0; find('[data-demo-view="qr"] h3').focus({ preventScroll: true }); break;
                case 'waiting-back':
                    find('[data-demo-view="queue"]').hidden = false; find('[data-demo-view="qr"]').hidden = true;
                    find('.marketing-demo-content').scrollTop = 0; find('[data-demo-view="queue"] h3').focus({ preventScroll: true }); break;
                case 'qr-refresh':
                    all('[data-demo-qr]').forEach(code => { code.hidden = !code.hidden; }); tell('시연용 QR을 바꿨어요. 실제 입장에는 사용할 수 없어요.'); break;
                case 'qr-checkin': tell('체크인 시연을 완료했어요. 실제 예약·입장 상태는 바뀌지 않아요.'); break;
                default: break;
            }
        };
        const keydown = event => { if (root.dataset.marketingDemo === 'booking' && event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); book(); } };
        reset();
        root.addEventListener('click', click); root.addEventListener('input', filter); root.addEventListener('change', filter); root.addEventListener('keydown', keydown);
        cleanups.push(() => { root.removeEventListener('click', click); root.removeEventListener('input', filter); root.removeEventListener('change', filter); root.removeEventListener('keydown', keydown); });
    }
    return () => cleanups.forEach(cleanup => cleanup());
}
