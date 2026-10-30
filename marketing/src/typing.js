import { heights } from '../../frontend/src/styles/tokens/spacing.js';

export const LINES = [
    { before: '버튼 ', blue: '클릭 한 번', after: '으로' },
    { before: '더 쉽고 ', blue: '더 놀라운', after: ' 경험을' },
    { before: '', blue: '원하는 곳', after: '을 예약하세요' },
    { before: '', blue: '지금 바로', after: ' 시작해보세요' },
];

const TYPE_SPEED = 58;

export function fullText(line) {
    return line.before + line.blue + line.after;
}

export function splitLine(text, blue) {
    const start = blue ? text.indexOf(blue) : -1;
    return start < 0 ? { before: text, blue: '', after: '' }
        : { before: text.slice(0, start), blue, after: text.slice(start + blue.length) };
}

function paint(node, line, value) {
    const start = line.before.length;
    const end = start + line.blue.length;
    node.querySelector('[data-typing-before]').textContent = value.slice(0, start);
    node.querySelector('[data-typing-blue]').textContent = value.slice(start, end);
    node.querySelector('[data-typing-after]').textContent = value.slice(end);
}

export function installMarketingTyping(document, motion, hangul) {
    const view = document.defaultView;
    const frames = (text, erase = false) => {
        const letters = hangul.disassemble(text);
        return letters.map((_, index) => hangul.assemble(letters.slice(0, erase ? letters.length - index - 1 : index + 1)));
    };
    const controllers = new Map();
    let hidden = document.hidden;
    let suspended = false;

    for (const heading of document.querySelectorAll('[data-marketing-typing], [data-marketing-section-title]')) {
        const hero = heading.hasAttribute('data-marketing-typing');
        const nodes = [...heading.querySelectorAll('[data-typing-line]')];
        const lines = nodes.map(node => ({ before: node.querySelector('[data-typing-before]').textContent,
            blue: node.querySelector('[data-typing-blue]').textContent, after: node.querySelector('[data-typing-after]').textContent }));
        let timer;
        let visible = false;
        let lineIndex = 0;
        const stop = () => {
            view.clearTimeout(timer);
            nodes.forEach((node, index) => { paint(node, lines[index], fullText(lines[index])); delete node.dataset.typingActive; });
        };
        const allowed = () => visible && !hidden && !suspended && !motion.matches;
        const sequence = (node, line, values, speed, next) => {
            let index = 0;
            const step = () => {
                if (!allowed()) return;
                if (index < values.length) { paint(node, line, values[index++]); timer = view.setTimeout(step, speed); }
                else next();
            };
            step();
        };
        const typeHero = () => sequence(nodes[0], LINES[lineIndex], frames(fullText(LINES[lineIndex])), TYPE_SPEED,
            () => { timer = view.setTimeout(eraseHero, 1800); });
        const eraseHero = () => sequence(nodes[0], LINES[lineIndex], frames(fullText(LINES[lineIndex]), true), 40, () => {
            lineIndex = (lineIndex + 1) % LINES.length;
            timer = view.setTimeout(typeHero, 160);
        });
        const typeSection = index => {
            if (index >= lines.length || !allowed()) return;
            const node = nodes[index];
            node.dataset.typingActive = 'true';
            sequence(node, lines[index], frames(fullText(lines[index])), TYPE_SPEED, () => {
                delete node.dataset.typingActive;
                typeSection(index + 1);
            });
        };
        const refresh = () => {
            stop();
            if (!allowed()) return;
            if (hero) {
                lineIndex = 0;
                timer = view.setTimeout(eraseHero, 1000);
            } else {
                nodes.forEach((node, index) => paint(node, lines[index], ''));
                timer = view.setTimeout(() => typeSection(0), 180);
            }
        };
        controllers.set(heading, { refresh, stop, setVisible(next) { if (visible !== next) { visible = next; refresh(); } } });
    }

    const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
        for (const entry of entries) controllers.get(entry.target)?.setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.6);
    }, { threshold: [0, 0.6], rootMargin: `-${heights.header} 0px 0px 0px` }) : null;
    for (const [heading, controller] of controllers) {
        if (observer) observer.observe(heading);
        else if (heading.hasAttribute('data-marketing-typing')) controller.setVisible(true);
    }
    const refresh = () => controllers.forEach(controller => controller.refresh());
    const onVisibility = () => { hidden = document.hidden; refresh(); };
    const onHide = () => { suspended = true; refresh(); };
    const onShow = () => { suspended = false; hidden = document.hidden; refresh(); };
    motion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    view.addEventListener('pagehide', onHide);
    view.addEventListener('pageshow', onShow);
    return () => {
        observer?.disconnect();
        controllers.forEach(controller => controller.stop());
        motion.removeEventListener('change', refresh);
        document.removeEventListener('visibilitychange', onVisibility);
        view.removeEventListener('pagehide', onHide);
        view.removeEventListener('pageshow', onShow);
    };
}
