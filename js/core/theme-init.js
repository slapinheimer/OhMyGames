// Applies the saved theme before first paint (classic script, loaded in <head>).
(function () {
  try {
    var s = JSON.parse(localStorage.getItem("omw:settings:global") || "{}");
    var root = document.documentElement;
    if (s.theme === "dark" || s.theme === "light") root.setAttribute("data-theme", s.theme);
    var game = root.getAttribute("data-game");
    var g = game ? JSON.parse(localStorage.getItem("omw:settings:" + game) || "{}") : {};
    if (g.highContrast) root.setAttribute("data-contrast", "high");
  } catch (e) {}
})();
