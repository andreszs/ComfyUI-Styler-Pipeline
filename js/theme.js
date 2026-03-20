import { isColorLight, adjustColor } from "./utils.js";

function getComfyThemeSafe() {
    if (typeof window === "undefined") return FALLBACK;
    if (typeof window.getComfyTheme === "function") return window.getComfyTheme();
    if (window.ComfyTheme && typeof window.ComfyTheme.getTheme === "function")
        return window.ComfyTheme.getTheme();
    return FALLBACK;
}

const FALLBACK = {
    isLight: false,
    theme: "dark",
    background: "#202020",
    text: "#fff",
    menuBg: "#353535",
    menuBgSecondary: "#303030",
    inputBg: "#222",
    inputText: "#ddd",
    border: "#4e4e4e",
    error: "#ff4444",
    contentHover: "#222",
    primaryBg: "#2f8cff",
    primaryHover: "#7db7ff",
};

export function applyThemeTokens(container) {
    const resolved = getComfyThemeSafe();

    const panelBg = resolved.menuBg || resolved.background;
    const panelBgSecondaryBase = resolved.menuBgSecondary || panelBg;
    const panelBgSecondary = adjustColor(panelBgSecondaryBase, resolved.isLight ? -12 : -10);
    const inputBg = resolved.inputBg || panelBgSecondary;
    const text = resolved.text || resolved.inputText;
    const textMuted = resolved.inputText || resolved.text;
    const border = resolved.border || resolved.text;
    const hoverBg = resolved.contentHover || panelBgSecondary;
    const primaryBg = resolved.primaryBg || hoverBg || border;
    const primaryHover = resolved.primaryHover || primaryBg;
    const primaryText = isColorLight(primaryBg) ? "#222222" : "#ffffff";
    const errorColor = resolved.error || "#ff4444";
    const tabShadow = resolved.isLight
        ? "0 0 6px rgba(0,0,0,0.2)"
        : "0 0 10px rgba(0,0,0,0.55)";

    container.style.setProperty("--styler-panel-bg", panelBg);
    container.style.setProperty("--styler-panel-bg-secondary", panelBgSecondary);
    container.style.setProperty("--styler-input-bg", inputBg);
    container.style.setProperty("--styler-input-text", textMuted);
    container.style.setProperty("--styler-text", text);
    container.style.setProperty("--styler-text-muted", textMuted);
    container.style.setProperty("--styler-border", border);
    container.style.setProperty("--styler-hover-bg", hoverBg);
    container.style.setProperty("--styler-btn-bg", panelBgSecondaryBase);
    container.style.setProperty("--styler-btn-hover-bg", hoverBg);
    container.style.setProperty("--styler-btn-disabled-bg", panelBg);
    container.style.setProperty("--styler-tab-shadow", tabShadow);
    container.style.setProperty("--styler-primary-bg", primaryBg);
    container.style.setProperty("--styler-primary-hover-bg", primaryHover);
    container.style.setProperty("--styler-primary-text", primaryText);
    container.style.setProperty("--styler-error", errorColor);
    container.style.setProperty("--styler-card-radius", "6px");
}

export function initThemeSupport(container) {
    applyThemeTokens(container);
    if (typeof window !== "undefined" && typeof window.watchThemeChanges === "function") {
        return window.watchThemeChanges(() => applyThemeTokens(container));
    }
    return () => {};
}
