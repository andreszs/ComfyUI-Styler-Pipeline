const DEFAULT_LANG = "en";
const BASE_URL = "/pipeline_control/locales";

const AVAILABLE_LANGS = ["en", "de", "es", "fr", "ja", "ko", "pt", "ru", "zh", "zh-TW"];

let fallbackEnDict = {};
let currentDict = {};
let initPromise = null;

function normalizeLang(lang) {
    if (!lang || typeof lang !== "string") return "";
    const normalized = lang.trim().replace(/_/g, "-");
    if (!normalized) return "";
    const [base, region] = normalized.split("-");
    if (!region) return base.toLowerCase();
    return `${base.toLowerCase()}-${region.toUpperCase()}`;
}

function detectLangCandidates() {
    const navLangs =
        typeof navigator !== "undefined" && navigator.languages
            ? Array.from(navigator.languages)
            : [];
    const candidates = [];
    for (const raw of navLangs) {
        const normalized = normalizeLang(raw);
        if (normalized && AVAILABLE_LANGS.includes(normalized)) {
            if (!candidates.includes(normalized)) candidates.push(normalized);
        } else if (normalized) {
            const base = normalized.split("-")[0];
            if (base && AVAILABLE_LANGS.includes(base) && !candidates.includes(base)) {
                candidates.push(base);
            }
        }
    }
    if (!candidates.includes(DEFAULT_LANG)) {
        candidates.push(DEFAULT_LANG);
    }
    return candidates;
}

async function loadDict(lang) {
    try {
        const response = await fetch(`${BASE_URL}/${lang}/ui.json?v=${Date.now()}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data && typeof data === "object" ? data : null;
    } catch (err) {
        console.warn(`[Styler Pipeline] Failed to load i18n locale '${lang}':`, err.message);
        return null;
    }
}

export async function initI18n(options = null) {
    const forceReload = !!(options && typeof options === "object" && options.forceReload);
    if (!forceReload && initPromise) return initPromise;

    initPromise = (async () => {
        // Always load English fallback first
        fallbackEnDict = (await loadDict(DEFAULT_LANG)) || {};

        const candidates = detectLangCandidates();
        const lang = candidates[0] || DEFAULT_LANG;

        if (lang !== DEFAULT_LANG) {
            const dict = await loadDict(lang);
            currentDict = dict || fallbackEnDict;
        } else {
            currentDict = fallbackEnDict;
        }
    })();

    return initPromise;
}

export function t(key, params = null) {
    const source = Object.prototype.hasOwnProperty.call(currentDict, key)
        ? currentDict[key]
        : Object.prototype.hasOwnProperty.call(fallbackEnDict, key)
            ? fallbackEnDict[key]
            : key;
    let text = typeof source === "string" ? source : String(source ?? key);
    if (params && typeof params === "object") {
        Object.entries(params).forEach(([paramKey, value]) => {
            text = text.replaceAll(`{${paramKey}}`, String(value));
        });
    }
    return text;
}

initI18n().catch(() => {});
