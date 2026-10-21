import Hangul from 'hangul-js';
import { LINES, fullText } from './src/typing';

document.documentElement.classList.add('js');
const theme = window.matchMedia('(prefers-color-scheme: dark)');
const updateTheme = () => { document.documentElement.dataset.theme = theme.matches ? 'dark' : 'light'; };
updateTheme();
theme.addEventListener('change', updateTheme);

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const typing = [...document.querySelectorAll('[data-marketing-typing]')];
let timer;
let lineIndex = 0;
const showText = value => {
    const line = LINES[lineIndex];
    const blueStart = line.before.length;
    const blueEnd = blueStart + line.blue.length;
    for (const node of typing) {
        node.querySelector('[data-typing-before]').textContent = value.slice(0, blueStart);
        node.querySelector('[data-typing-blue]').textContent = value.slice(blueStart, blueEnd);
        node.querySelector('[data-typing-after]').textContent = value.slice(blueEnd);
    }
};
function runSequence(sequence, speed, next) {
    let index = 0;
    const step = () => {
        if (motion.matches) return;
        if (index < sequence.length) { showText(sequence[index++]); timer = setTimeout(step, speed); }
        else next();
    };
    step();
}
function erase() {
    const letters = Hangul.disassemble(fullText(LINES[lineIndex]));
    runSequence(letters.map((_, index) => Hangul.assemble(letters.slice(0, letters.length - index - 1))), 40, () => {
        lineIndex = (lineIndex + 1) % LINES.length;
        timer = setTimeout(type, 160);
    });
}
function type() {
    const letters = Hangul.disassemble(fullText(LINES[lineIndex]));
    runSequence(letters.map((_, index) => Hangul.assemble(letters.slice(0, index + 1))), 58, () => { timer = setTimeout(erase, 1800); });
}
function updateMotion() {
    clearTimeout(timer);
    if (motion.matches) { lineIndex = 0; showText(fullText(LINES[0])); }
    else timer = setTimeout(erase, 1000);
}
updateMotion();
motion.addEventListener('change', updateMotion);
window.addEventListener('pagehide', () => clearTimeout(timer));
window.addEventListener('pageshow', event => { if (event.persisted) updateMotion(); });

if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('rv');
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(node => observer.observe(node));
} else document.querySelectorAll('.reveal').forEach(node => node.classList.add('rv'));

document.addEventListener('click', event => {
    const scroll = event.target.closest('[data-scroll-target]');
    if (scroll) document.getElementById(scroll.dataset.scrollTarget)?.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'start' });
    const like = event.target.closest('[data-demo-like]');
    if (like) like.setAttribute('aria-pressed', String(like.getAttribute('aria-pressed') !== 'true'));
    const step = event.target.closest('[data-demo-delta]');
    if (step && !step.disabled) {
        let control = step.parentElement;
        while (control && !control.querySelector('[data-demo-count]')) control = control.parentElement;
        const output = control?.querySelector('[data-demo-count]');
        if (!output) return;
        const next = Math.max(1, Number.parseInt(output.textContent, 10) + Number(step.dataset.demoDelta));
        output.textContent = `${next}명`;
        control.querySelector('[data-demo-delta="-1"]').disabled = next === 1;
    }
});
