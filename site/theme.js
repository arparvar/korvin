const button = document.getElementById('themeToggle');
const saved = localStorage.getItem('korvin-theme');

if (saved === 'light') {
  document.body.classList.add('light');
  button.textContent = 'Dark';
}

button.addEventListener('click', () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  button.textContent = isLight ? 'Dark' : 'Light';
  localStorage.setItem('korvin-theme', isLight ? 'light' : 'dark');
});
