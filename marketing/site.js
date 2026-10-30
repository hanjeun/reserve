import Hangul from 'hangul-js';
import { installMarketingTyping } from './src/typing';
import { installFaqMotion } from './src/faq';
import { installMarketingScroll } from './src/scroll';

document.documentElement.classList.add('js');
const theme = window.matchMedia('(prefers-color-scheme: dark)');
const updateTheme = () => { document.documentElement.dataset.theme = theme.matches ? 'dark' : 'light'; };
updateTheme();
theme.addEventListener('change', updateTheme);

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
installFaqMotion(document, motion);
installMarketingTyping(document, motion, Hangul);
installMarketingScroll(document, motion);

if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('rv');
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(node => observer.observe(node));
} else document.querySelectorAll('.reveal').forEach(node => node.classList.add('rv'));

document.addEventListener('click', event => {
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
