/**
 * Shared utilities for comfyui-styler-pipeline
 */

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Determine if a color is light or dark based on luminance.
 * Supports hex (#fff, #ffffff, #ffffffff) and rgb/rgba formats.
 * @param {string} color - Color string (hex or rgb/rgba)
 * @returns {boolean} - True if color is light (luminance > 0.6)
 */
export function isColorLight(color) {
    if (!color || typeof color !== "string") return false;
    const v = color.trim();
    let r = null, g = null, b = null;
    if (v.startsWith("#")) {
        const hex = v.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    } else if (v.startsWith("rgb")) {
        const m = v.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const p = m[1].split(",").map((s) => s.trim());
            if (p.length >= 3) { r = +p[0]; g = +p[1]; b = +p[2]; }
        }
    }
    if (![r, g, b].every((n) => Number.isFinite(n))) return false;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
}

/**
 * Adjust color brightness by adding/subtracting a value from RGB components.
 * Clamps results to [0, 255] range. Preserves alpha channel if present.
 * @param {string} color - Color string (hex or rgb/rgba)
 * @param {number} amount - Amount to adjust (-255 to 255)
 * @returns {string} - Adjusted color in rgb/rgba format, or original color if invalid
 */
export function adjustColor(color, amount) {
    if (!color || typeof color !== "string") return color;
    const v = color.trim();
    let r = null, g = null, b = null, a = null;
    if (v.startsWith("#")) {
        const hex = v.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
            if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
        }
    } else if (v.startsWith("rgb")) {
        const m = v.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const p = m[1].split(",").map((s) => s.trim());
            if (p.length >= 3) { r = +p[0]; g = +p[1]; b = +p[2]; }
            if (p.length >= 4) a = +p[3];
        }
    }
    if (![r, g, b].every((n) => Number.isFinite(n))) return color;
    const c = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const rr = c(r + amount), gg = c(g + amount), bb = c(b + amount);
    if (Number.isFinite(a)) return `rgba(${rr}, ${gg}, ${bb}, ${a})`;
    return `rgb(${rr}, ${gg}, ${bb})`;
}

// ============================================================================
// Toast & Dialog Helpers
// ============================================================================

/**
 * Show a toast notification using ComfyUI's native Toast API.
 * Falls back to console logging for older ComfyUI versions.
 * @param {string} severity - "info", "success", "warn", or "error"
 * @param {string} summary - Toast title
 * @param {string} detail - Toast message body
 * @param {number} lifeMs - Duration in milliseconds (default: 4000)
 * @returns {boolean} - True if toast was shown, false if fallback was used
 */
export function showToast(severity, summary, detail, lifeMs = 4000) {
    const toast = app?.extensionManager?.toast;
    if (toast && typeof toast.add === "function") {
        toast.add({ severity, summary, detail, life: lifeMs });
        return true;
    }
    const fn =
        severity === "error"
            ? "error"
            : severity === "warn"
                ? "warn"
                : "log";
    console[fn](`[Styler Pipeline] ${summary}: ${detail}`);
    return false;
}

/**
 * Show a confirmation dialog using ComfyUI's dialog API.
 * Falls back to native confirm for older ComfyUI versions.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {object} options - Additional dialog options
 * @returns {Promise<boolean>} - True if confirmed, false otherwise
 */
export async function showConfirm(title, message, options = null) {
    const dialog = app?.extensionManager?.dialog;
    if (dialog && typeof dialog.confirm === "function") {
        try {
            const result = await dialog.confirm({
                title: title ?? "",
                message: message ?? "",
                ...(options && typeof options === "object" ? options : {}),
            });
            return !!result;
        } catch {
            // Fall back to native confirm
        }
    }
    try {
        if (typeof window !== "undefined" && typeof window.confirm === "function") {
            const textTitle = title ? String(title) : "";
            const textMessage = message ? String(message) : "";
            const combined =
                textTitle && textMessage
                    ? `${textTitle}\n\n${textMessage}`
                    : textTitle || textMessage;
            return !!window.confirm(combined);
        }
    } catch {
        // Ignore fallback errors
    }
    return false;
}

/**
 * Show a prompt dialog using ComfyUI's dialog API.
 * Falls back to native prompt for older ComfyUI versions.
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} defaultValue - Default input value
 * @param {object} options - Additional dialog options
 * @returns {Promise<string|null>} - Entered value or null if canceled
 */
export async function showPrompt(title, message, defaultValue = "", options = null) {
    const dialog = app?.extensionManager?.dialog;
    if (dialog && typeof dialog.prompt === "function") {
        try {
            const result = await dialog.prompt({
                title: title ?? "",
                message: message ?? "",
                defaultValue: defaultValue ?? "",
                ...(options && typeof options === "object" ? options : {}),
            });
            if (typeof result === "string") return result;
            if (result === null || result === undefined) return null;
            return String(result);
        } catch {
            // Fall back to native prompt
        }
    }
    try {
        if (typeof window !== "undefined" && typeof window.prompt === "function") {
            const textTitle = title ? String(title) : "";
            const textMessage = message ? String(message) : "";
            const combined =
                textTitle && textMessage
                    ? `${textTitle}\n\n${textMessage}`
                    : textTitle || textMessage;
            const response = window.prompt(combined, String(defaultValue ?? ""));
            return response === null ? null : String(response);
        }
    } catch {
        // Ignore fallback errors
    }
    return null;
}

// ============================================================================
// Clipboard Helper
// ============================================================================

/**
 * Copy text to clipboard with fallback for older browsers.
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - True if copied successfully
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall through to legacy method
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// Persistence Helpers
// ============================================================================

const PERSIST_NAMESPACE = "pipeline_control.";

function normalizePersistKey(key) {
    if (typeof key !== "string") return null;
    const trimmed = key.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(PERSIST_NAMESPACE)) return trimmed;
    return `${PERSIST_NAMESPACE}${trimmed}`;
}

function getLocalStorageSafe() {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

/**
 * Get a persisted setting from localStorage.
 * Keys are automatically namespaced with "pipeline_control.".
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not found
 * @returns {string|*} - Stored value or defaultValue
 */
export function getPersistedSetting(key, defaultValue = null) {
    const storage = getLocalStorageSafe();
    const normalized = normalizePersistKey(key);
    if (!storage || !normalized) return defaultValue;
    try {
        const value = storage.getItem(normalized);
        return value === null ? defaultValue : value;
    } catch {
        return defaultValue;
    }
}

/**
 * Set a persisted setting in localStorage.
 * @param {string} key - Setting key
 * @param {*} value - Value to store (will be stringified)
 * @returns {boolean} - True if saved successfully
 */
export function setPersistedSetting(key, value) {
    const storage = getLocalStorageSafe();
    const normalized = normalizePersistKey(key);
    if (!storage || !normalized) return false;
    if (value === null || value === undefined) {
        return removePersistedSetting(key);
    }
    try {
        storage.setItem(normalized, String(value));
        return true;
    } catch {
        return false;
    }
}

/**
 * Remove a persisted setting from localStorage.
 * @param {string} key - Setting key
 * @returns {boolean} - True if removed successfully
 */
export function removePersistedSetting(key) {
    const storage = getLocalStorageSafe();
    const normalized = normalizePersistKey(key);
    if (!storage || !normalized) return false;
    try {
        storage.removeItem(normalized);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get a persisted JSON setting from localStorage.
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not found or parse fails
 * @returns {*} - Parsed JSON value or defaultValue
 */
export function getPersistedJSON(key, defaultValue = null) {
    const raw = getPersistedSetting(key, null);
    if (raw === null || raw === undefined) return defaultValue;
    try {
        return JSON.parse(raw);
    } catch {
        removePersistedSetting(key);
        return defaultValue;
    }
}

/**
 * Set a persisted JSON setting in localStorage.
 * @param {string} key - Setting key
 * @param {*} obj - Value to serialize and store
 * @returns {boolean} - True if saved successfully
 */
export function setPersistedJSON(key, obj) {
    if (obj === undefined) return removePersistedSetting(key);
    try {
        return setPersistedSetting(key, JSON.stringify(obj));
    } catch {
        return false;
    }
}

// ============================================================================
// Version Helpers (for future update checking)
// ============================================================================

/**
 * Parse a semver-like version string into comparable parts.
 * Handles formats like "1.2.3", "1.2.3-beta.1", "v1.2.3".
 * @param {string} version - Version string
 * @returns {{ major: number, minor: number, patch: number, prerelease: string } | null}
 */
export function parseVersion(version) {
    if (!version || typeof version !== "string") return null;
    const cleaned = version.trim().replace(/^v/i, "");
    const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/);
    if (!match) return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2] || "0", 10),
        patch: parseInt(match[3] || "0", 10),
        prerelease: match[4] || "",
    };
}

/**
 * Compare two semver-like version strings.
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} - Negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa && !pb) return 0;
    if (!pa) return -1;
    if (!pb) return 1;
    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    if (pa.patch !== pb.patch) return pa.patch - pb.patch;
    if (pa.prerelease && !pb.prerelease) return -1;
    if (!pa.prerelease && pb.prerelease) return 1;
    if (pa.prerelease && pb.prerelease) {
        return pa.prerelease < pb.prerelease ? -1 : pa.prerelease > pb.prerelease ? 1 : 0;
    }
    return 0;
}

/**
 * Extract version string from pyproject.toml content.
 * @param {string} tomlContent - Raw TOML file content
 * @returns {string|null} - Version string or null if not found
 */
export function extractVersionFromToml(tomlContent) {
    if (!tomlContent || typeof tomlContent !== "string") return null;
    const match = tomlContent.match(/version\s*=\s*["']([^"']+)["']/);
    return match ? match[1] : null;
}

/**
 * Safe fetch wrapper that never throws.
 * Returns { ok, status, data } or { ok: false, status: 0, error }.
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<{ ok: boolean, status: number, data: any, error?: string }>}
 */
export async function safeFetch(url, options = {}) {
    try {
        const resp = await fetch(url, options);
        if (!resp.ok) {
            return { ok: false, status: resp.status, data: null, error: resp.statusText };
        }
        const contentType = resp.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
            ? await resp.json()
            : await resp.text();
        return { ok: true, status: resp.status, data };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: String(err) };
    }
}

// ============================================================================
// Button Style Helper
// ============================================================================

/**
 * Apply standard sidebar/overlay button styles using styler CSS variables.
 * Safe to call on any element; guards against null and repeat initialization.
 * @param {NodeList|Array} buttons - Collection of button elements
 */
export function applySidebarButtonStyles(buttons) {
    if (!buttons) return;
    Array.from(buttons).forEach((btn) => {
        if (!btn) return;
        btn.style.padding = "6px 12px";
        btn.style.border = "1px solid var(--styler-border)";
        btn.style.borderRadius = "4px";
        btn.style.background = "var(--styler-btn-bg)";
        btn.style.color = "var(--styler-text)";
        btn.style.cursor = "pointer";
        btn.style.fontFamily = "Arial, sans-serif";
        btn.style.fontSize = "13px";
        if (!btn.dataset.hoverReady) {
            btn.dataset.hoverReady = "1";
            btn.addEventListener("mouseenter", () => {
                if (btn.disabled) return;
                btn.style.background = "var(--styler-btn-hover-bg)";
            });
            btn.addEventListener("mouseleave", () => {
                if (btn.disabled) return;
                btn.style.background = "var(--styler-btn-bg)";
            });
        }
    });
}


