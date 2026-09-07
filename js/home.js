const THEME_STORAGE_KEY = "pspo-theme";
const themeToggle = document.getElementById("themeToggleHome");

function applyHomeTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  const isDark = theme === "dark";
  themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function initializeHomeTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyHomeTheme(storedTheme === "dark" ? "dark" : "light");
}

themeToggle.addEventListener("click", () => {
  applyHomeTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

initializeHomeTheme();
