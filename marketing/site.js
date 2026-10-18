const theme = window.matchMedia('(prefers-color-scheme: dark)');
const updateTheme = () => { document.documentElement.dataset.theme = theme.matches ? 'dark' : 'light'; };
updateTheme();
theme.addEventListener('change', updateTheme);
