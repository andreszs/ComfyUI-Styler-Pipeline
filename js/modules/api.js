/**
 * api.js — Reusable external-API helpers for AI model requests.
 *
 * Provides:
 *  • Error classes (HttpError, RequestTimeoutError)
 *  • Rate-limit / retry helpers
 *  • Generic fetch utilities with timeout + AbortController wiring
 *  • Ollama provider adapter (chat, list models, health check)
 *  • ComfyUI queue check
 *  • Response utilities (markdown-fence stripping, safe JSON extraction)
 */

/* ── Error classes ── */

export class HttpError extends Error {
    constructor(status, headers = null, detail = "") {
        super(detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`);
        this.name = "HttpError";
        this.status = status;
        this.responseHeaders = headers;
        this.detail = typeof detail === "string" ? detail : "";
    }
}

export class RequestTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Request timed out after ${timeoutMs}ms`);
        this.name = "RequestTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

class OllamaPreflightError extends Error {
    constructor() {
        super("Ollama request preflight blocked");
        this.name = "OllamaPreflightError";
    }
}

/* ── Constants ── */

export const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
export const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
export const OLLAMA_HEALTH_URL = "http://127.0.0.1:11434";
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GEMINI_GENERATE_CONTENT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const HUGGINGFACE_CHAT_COMPLETIONS_URL = "https://router.huggingface.co/v1/chat/completions";
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const COMFYUI_QUEUE_URL = "/queue";

export const THROTTLE_BASE_MS = 900;
export const THROTTLE_JITTER_MAX_MS = 400;
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [0, 1500, 3000]; // indexed by attempt (0-based)
export const RETRY_JITTER_MAX_MS = 500;
export const RETRYABLE_HTTP_CODES = new Set([429, 503, 504]);
export const CATEGORY_REQUEST_TIMEOUT_MS = 25000;
export const LOCAL_QUERY_REQUEST_TIMEOUT_MS = 120000;
export const REFINE_SCORE_SCHEMA_CORRECTION_MESSAGE = 'Wrong format. Every candidate MUST have a numeric "score" (0.0-1.0). Reply with ONLY the corrected JSON: {"category":"...","candidates":[{"name":"...","score":0.95}]}';
let ollamaRequestPreflight = null;

export function setOllamaRequestPreflight(preflightFn = null) {
    ollamaRequestPreflight = typeof preflightFn === "function" ? preflightFn : null;
}

async function runOllamaRequestPreflight(context = {}) {
    if (typeof ollamaRequestPreflight !== "function") return;
    const allowed = await ollamaRequestPreflight(context);
    if (allowed === false) {
        throw new OllamaPreflightError();
    }
}

/* ── Domain schema ── */

export const RECOMMENDED_LOCAL_MODEL = "gemma3:4b";
export const MAX_ALLOWED_STYLES_PER_CATEGORY = 80;
export const MAX_MODEL_CANDIDATES_PER_CATEGORY = 6;
export const MAX_CATEGORIES = 10;
export const MIN_RELEVANCE = 60;
export const CANONICAL_CATEGORIES = [
    "aesthetic",
    "all_in_one",
    "anime",
    "atmosphere",
    "lingerie",
    "camera_angles",
    "clothing",
    "clothing_state",
    "clothing_style",
    "depth",
    "environment",
    "face",
    "fantasy",
    "filter",
    "gothic",
    "hair",
    "halloween",
    "lighting",
    "line_art",
    "mood",
    "punk",
    "rendering",
    "sci_fi",
    "timeofday",
];
export const CATEGORY_ALIASES = {
    "sci-fi": "sci_fi",
    scifi: "sci_fi",
    sci_fi: "sci_fi",
    scifi_style: "sci_fi",
    breast_state: "lingerie",
    lingerie: "lingerie",
    allinone: "all_in_one",
    all_in_one: "all_in_one",
    "all-in-one": "all_in_one",
    camera: "camera_angles",
    camera_angle: "camera_angles",
    cameraangles: "camera_angles",
    time_of_day: "timeofday",
    "time-of-day": "timeofday",
    timeofday: "timeofday",
};

/* ── Low-level helpers ── */

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export function getJitter(maxMs) { return Math.floor(Math.random() * maxMs); }

function sleepWithSignal(ms, signal) {
    if (!signal) return sleep(ms);
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            const abortErr = new Error("Aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
            return;
        }
        const onAbort = () => {
            clearTimeout(timerId);
            signal.removeEventListener("abort", onAbort);
            const abortErr = new Error("Aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
        };
        const timerId = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export function isRetryableHttpError(err) {
    return err instanceof HttpError && RETRYABLE_HTTP_CODES.has(err.status);
}

export function getRetryAfterMs(err) {
    if (!(err instanceof HttpError) || !err.responseHeaders) return 0;
    const raw = err.responseHeaders.get("Retry-After");
    if (!raw) return 0;
    const asInt = parseInt(raw, 10);
    if (!isNaN(asInt) && String(asInt) === raw.trim()) return asInt * 1000;
    const asDate = Date.parse(raw);
    if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
    return 0;
}

export function getHttpErrorLabel(err, provider = "ollama") {
    if ((provider === "openai" || provider === "anthropic" || provider === "groq" || provider === "gemini" || provider === "huggingface" || provider === "openrouter") && err instanceof HttpError) {
        if (err.status === 401 || err.status === 403) {
            return provider === "huggingface"
                ? "Invalid token or missing access."
                : "Invalid API key or missing API access.";
        }
        if (err.status === 429) {
            return "Rate limited. Try again later.";
        }
        if (err.status === 400) {
            const detail = typeof err.detail === "string" && err.detail.trim()
                ? `: ${err.detail.trim()}`
                : "";
            return `Bad request${detail}`;
        }
    }
    const errCode = err instanceof HttpError ? err.status : "err";
    return err instanceof HttpError && err.status === 429
        ? `Rate limited (${errCode})`
        : `HTTP ${errCode}`;
}

function parseGroqRateLimitWaitMs(errorMessage) {
    const raw = String(errorMessage || "").trim();
    const match = raw.match(/please try again in (\d+(?:\.\d+)?)(ms|s)\./i);
    if (!match) return null;
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value < 0) return null;
    return match[2].toLowerCase() === "ms" ? Math.ceil(value) : Math.ceil(value * 1000);
}

export function isConnectivityError(err) {
    const raw = (err && err.message) ? err.message : String(err || "");
    return /HTTP\s\d+|failed to fetch|network|cors|timeout|aborted|No reply content received from (?:Ollama|OpenAI|Anthropic|Groq|Gemini|Hugging Face|OpenRouter)/i.test(raw);
}

export function normalizeConnectivityError(err, provider = "ollama") {
    const raw = (err && err.message) ? err.message : String(err || "Unknown error");
    const isCloud = provider === "openai" || provider === "anthropic" || provider === "groq" || provider === "gemini" || provider === "huggingface" || provider === "openrouter";
    const cloudProviderName = provider === "anthropic"
        ? "Anthropic"
        : provider === "groq"
            ? "Groq"
            : provider === "gemini"
                ? "Gemini"
                : provider === "huggingface"
                    ? "Hugging Face"
                : provider === "openrouter"
                    ? "OpenRouter"
                : "OpenAI";

    // Surface HTTP status + detail for cloud providers instead of collapsing to generic message
    if (err instanceof HttpError && isCloud) {
        const detail = typeof err.detail === "string" && err.detail.trim()
            ? ` — ${err.detail.trim()}`
            : "";
        return `${cloudProviderName} HTTP ${err.status}${detail}`;
    }

    if (err instanceof RequestTimeoutError) {
        return isCloud
            ? `${cloudProviderName} request timed out.`
            : "Ollama request timed out";
    }

    if (/cors/i.test(raw)) {
        return isCloud
            ? `CORS error contacting ${cloudProviderName} (browser blocked the request).`
            : "Not connected (CORS)";
    }
    if (/failed to fetch/i.test(raw) || /network/i.test(raw)) {
        return isCloud
            ? `Network error contacting ${cloudProviderName} (request blocked or no internet).`
            : "Ollama not reachable at 127.0.0.1:11434";
    }
    if (isCloud) {
        return `${cloudProviderName} connection failed: ${raw}`;
    }
    return `Ollama connection failed: ${raw}`;
}

/* ── Response utilities ── */

/**
 * Strip markdown fences and extract the outermost JSON object from a string.
 * Returns the extracted substring (which may still need JSON.parse), or the
 * cleaned input if no braces are found.
 */
export function extractJsonObject(text) {
    const original = String(text || "").trim();
    if (!original) return "";

    const fencedMatch = original.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const source = fencedMatch && fencedMatch[1] ? fencedMatch[1].trim() : original;

    const firstBrace = source.indexOf("{");
    if (firstBrace === -1) {
        return source;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = firstBrace; index < source.length; index += 1) {
        const char = source[index];

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === "\\") {
            isEscaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === "{") depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(firstBrace, index + 1).trim();
            }
        }
    }

    return source.slice(firstBrace).trim();
}

export function extractFirstToLastJsonObject(text) {
    const source = String(text || "").trim();
    if (!source) return "";
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return "";
    }
    return source.slice(firstBrace, lastBrace + 1).trim();
}

export function stripJsonCodeFence(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced && fenced[1] ? fenced[1].trim() : raw;
}

/**
 * Attempt to parse a JSON object from a (possibly messy) LLM reply.
 * Returns { ok, data, extracted, reason? }.
 */
export function safeJsonParse(text) {
    const raw = String(text || "").trim();
    const stripped = stripJsonCodeFence(raw);
    if (!raw) {
        return {
            ok: false,
            reason: "Invalid JSON reply",
            data: null,
            extracted: "",
        };
    }
    if (stripped && stripped !== raw) {
        try {
            return {
                ok: true,
                data: JSON.parse(stripped),
                extracted: stripped,
            };
        } catch {
            // Continue with extraction fallbacks.
        }
    }
    try {
        return {
            ok: true,
            data: JSON.parse(raw),
            extracted: raw,
        };
    } catch {
        // Continue with extraction fallbacks.
    }
    const firstToLastExtracted = extractFirstToLastJsonObject(stripped);
    if (firstToLastExtracted) {
        try {
            return {
                ok: true,
                data: JSON.parse(firstToLastExtracted),
                extracted: firstToLastExtracted,
            };
        } catch {
            // Continue with strict brace-depth extraction fallback.
        }
    }
    const extracted = extractJsonObject(stripped);
    try {
        return {
            ok: true,
            data: JSON.parse(extracted),
            extracted,
        };
    } catch {
        return {
            ok: false,
            reason: "Invalid JSON reply",
            data: null,
            extracted,
        };
    }
}

export function normalizeCategoryKey(key, categoryAliases = CATEGORY_ALIASES) {
    const normalized = String(key || "")
        .trim()
        .toLowerCase()
        .replace(/[\s\-]+/g, "_")
        .replace(/_+/g, "_");
    if (!normalized) return "";
    return categoryAliases[normalized] || normalized;
}

export function normalizeStyleName(name) {
    return String(name || "")
        .trim()
        .replace(/^["']+|["']+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function uniqueStringList(values = []) {
    return Array.from(new Set((values || []).filter((value) => typeof value === "string" && value.trim())));
}

export function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeWhitespace(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidModelStyleScore(score) {
    return typeof score === "number"
        && Number.isFinite(score)
        && score >= 0
        && score <= 1;
}

function getRankFallbackScore(index) {
    const raw = Math.max(0.5, 0.99 - (index * 0.01));
    return Math.round(raw * 100) / 100;
}

function applyCandidateFallbackScores(candidates = []) {
    let fallbackCount = 0;
    const scored = (candidates || []).map((candidate, index) => {
        const rawScore = candidate?.score;
        if (isValidModelStyleScore(rawScore)) {
            return { ...candidate, score: rawScore };
        }
        fallbackCount += 1;
        return { ...candidate, score: getRankFallbackScore(index) };
    });
    return { candidates: scored, fallbackCount };
}

/* —— Request builders —— */

export function buildCandidateMessages({
    promptText,
    allowedStylesByCategory,
    maxCategories,
    maxCandidates,
    minRelevance,
} = {}) {
    // Single-category query: extract the one category and its styles
    const categories = Object.keys(allowedStylesByCategory || {}).filter(
        (category) => (allowedStylesByCategory[category] || []).length > 0
    );

    if (categories.length === 0) {
        throw new Error("No styles provided for query");
    }

    // For single-category queries, extract the style list directly
    const categoryId = categories[0];
    const styleList = allowedStylesByCategory[categoryId] || [];
    const stylesBlock = styleList.join("\n");

    return [
        {
            role: "system",
            content: "You are a JSON-only style selector. Return ONLY raw JSON with no markdown fences (no ```), no explanations, no extra text. Output must be a single valid JSON object.",
        },
        {
            role: "user",
            content: `User prompt: "${promptText}"
Category: "${categoryId}"

Select up to ${maxCandidates} styles from the list below that best match the user's prompt. Order best first.

RULES:
- Return ONLY raw JSON. No markdown (no \`\`\` fences), no prose, no explanations.
- Return exactly this top-level shape:
  {"category":"${categoryId}","candidates":[{"name":"Exact Style Name","score":0.95}]}
- "category" MUST be exactly "${categoryId}".
- "candidates" MUST be an array (max ${maxCandidates}) ordered by score descending.
- Use EXACT style names from the list below (case-sensitive match).
- NEVER invent style names. Only use strings present in the list.
- If no styles match clearly, return {"category":"${categoryId}","candidates":[]}.

- "name": MUST be an exact string from the list below.
- "score": number 0.0-1.0.
- Every candidate must include BOTH "name" and "score".
- Each style must appear only once.

Available styles (use these EXACT strings):
${stylesBlock}`,
        },
    ];
}

export function buildRefineCategoryMessages({
    categoryKey,
    promptText,
    styleData,
    maxCandidates,
} = {}) {
    const stylesBlock = (styleData || []).map((item) => {
        const prompt = (item.prompt || "").replace(/\s+/g, " ").trim();
        return prompt ? `${item.title} :: ${prompt}` : item.title;
    }).join("\n");

    return [
        {
            role: "system",
            content: "You are a JSON-only style selector. Return ONLY raw JSON with no markdown fences (no ```), no explanations, no extra text. Output must be a single valid JSON object.",
        },
        {
            role: "user",
            content: `User prompt: "${promptText}"
Category: "${categoryKey}"

Select up to ${maxCandidates} styles that best match the prompt. Match on both name and prompt content. Order best first.
Return ONLY raw JSON. No markdown (no \`\`\` fences), no prose, no explanations.

Output format (use ACTUAL style names from list below, NOT placeholders like "Style Name"):
{"category":"${categoryKey}","candidates":[{"name":"Actual Style Name","score":0.95}]}

- "name": MUST be an exact style name from the list below (NOT a placeholder)
- "score": number 0.0-1.0
- Every candidate must have both "name" and "score".
- NEVER invent style names. Only use exact strings from the list below.

Available styles (use these EXACT names):
${stylesBlock}`,
        },
    ];
}

export function buildRefineCorrectionMessages({
    baseMessages,
    previousReply,
    correctionMessage = REFINE_SCORE_SCHEMA_CORRECTION_MESSAGE,
} = {}) {
    return [
        ...(baseMessages || []),
        { role: "assistant", content: previousReply || "" },
        { role: "user", content: correctionMessage },
    ];
}

/* —— Parsing + normalization —— */

export function parseCandidateSelectionReply({
    replyText,
    allowedStylesByCategory,
    canonicalCategories,
    categoryAliases = {},
    minRelevance,
    maxCategories,
    maxCandidates,
} = {}) {
    const warnings = [];
    const candidateSelection = {};
    const parsed = safeJsonParse(replyText);
    if (!parsed.ok) {
        console.warn("[AI Presets Parser] JSON parse failed:", parsed.reason || "unknown");
        console.warn("[AI Presets Parser] Raw reply text:", replyText?.slice(0, 500));
        console.warn("[AI Presets Parser] Extracted text:", parsed.extracted?.slice(0, 500));
        return {
            ok: false,
            reason: "Invalid JSON reply",
            candidateSelection: {},
            warnings: [`JSON parse failed: ${parsed.reason || "unknown"}`],
            fallbackScoresApplied: 0,
        };
    }
    const payload = parsed.data;

    const allowedCategories = Object.keys(allowedStylesByCategory || {});
    const isSingleCategoryQuery = allowedCategories.length === 1;
    const requestedCategory = isSingleCategoryQuery ? allowedCategories[0] : "";

    if (!isSingleCategoryQuery || !requestedCategory) {
        return {
            ok: false,
            reason: "Query parser requires single-category request",
            candidateSelection: {},
            warnings: ["Query parser requires single-category request"],
            fallbackScoresApplied: 0,
        };
    }

    const validCategorySet = new Set(canonicalCategories || []);
    const normalizedMap = {};
    Object.entries(allowedStylesByCategory || {}).forEach(([category, names]) => {
        normalizedMap[category] = new Map((names || []).map((name) => [normalizeStyleName(name), name]));
    });

    let responseCategory = requestedCategory;
    let candidateItems = null;

    if (Array.isArray(payload)) {
        candidateItems = payload;
        warnings.push("Model returned array payload; normalized to candidates wrapper");
        console.warn(`[AI Presets Parser] Array payload detected. Normalized to {category, candidates} for "${requestedCategory}".`);
    } else if (payload && typeof payload === "object") {
        if (payload.category) {
            const normalizedCategory = normalizeCategoryKey(payload.category, categoryAliases);
            if (!normalizedCategory || !validCategorySet.has(normalizedCategory) || normalizedCategory !== requestedCategory) {
                return {
                    ok: false,
                    reason: "Category mismatch in response",
                    candidateSelection: {},
                    warnings: ["Category mismatch in response"],
                    fallbackScoresApplied: 0,
                };
            }
            responseCategory = normalizedCategory;
        }

        if (Array.isArray(payload.candidates)) {
            candidateItems = payload.candidates;
        } else if (Array.isArray(payload.styles)) {
            candidateItems = payload.styles;
            warnings.push("Model returned styles[] payload; normalized to candidates wrapper");
        } else {
            return {
                ok: false,
                reason: "Missing or invalid candidates array",
                candidateSelection: {},
                warnings: ["Missing or invalid candidates/styles array"],
                fallbackScoresApplied: 0,
            };
        }
    } else {
        return {
            ok: false,
            reason: "Reply must be a JSON object or array",
            candidateSelection: {},
            warnings: ["Reply must be a JSON object or array"],
            fallbackScoresApplied: 0,
        };
    }

    if (!Array.isArray(candidateItems)) {
        return {
            ok: false,
            reason: "Missing or invalid candidates array",
            candidateSelection: {},
            warnings: ["Missing or invalid candidates/styles array"],
            fallbackScoresApplied: 0,
        };
    }

    const category = responseCategory || requestedCategory;
    const allowedLookup = normalizedMap[category] || new Map();
    const resolved = [];
    const seen = new Set();

    (candidateItems || []).forEach((item) => {
        const rawName = typeof item === "string"
            ? item
            : (item && typeof item === "object" && typeof item.name === "string" ? item.name : "");
        if (!rawName) return;

        const normalized = normalizeStyleName(rawName);
        const canonical = allowedLookup.get(normalized);
        if (!canonical) {
            return;
        }
        if (seen.has(canonical)) return;

        seen.add(canonical);
        resolved.push({
            name: canonical,
            score: item && typeof item === "object" ? item.score : null,
        });
    });

    if (resolved.length === 0) {
        return {
            ok: false,
            reason: "No valid candidates after filtering",
            candidateSelection: {},
            warnings,
            fallbackScoresApplied: 0,
        };
    }

    const limit = Number.isFinite(maxCandidates) && maxCandidates > 0
        ? Math.floor(maxCandidates)
        : MAX_MODEL_CANDIDATES_PER_CATEGORY;
    const limitedResolved = resolved.slice(0, limit);
    const { candidates: scoredCandidates, fallbackCount } = applyCandidateFallbackScores(limitedResolved);
    candidateSelection[category] = scoredCandidates;

    return {
        ok: true,
        candidateSelection,
        warnings,
        fallbackScoresApplied: fallbackCount,
    };
}

export function parseRefineCategoryReply({
    replyText,
    categoryKey,
    allowedNames,
    categoryAliases = {},
    maxCandidates,
} = {}) {
    const parsed = safeJsonParse(replyText);

    if (!parsed.ok) {
        console.warn(`[AI Presets Refine Parser] JSON parse failed for category "${categoryKey}":`, parsed.reason || "unknown");
        console.warn(`[AI Presets Refine Parser] Raw reply text:`, replyText?.slice(0, 500));
        return {
            ok: false,
            reason: "Invalid JSON reply",
            candidates: [],
            fallbackScoresApplied: 0,
        };
    }

    const payload = parsed.data;
    let candidateItems = null;

    if (Array.isArray(payload)) {
        candidateItems = payload;
        console.warn(`[AI Presets Refine Parser] Array payload detected. Normalized to candidates for category "${categoryKey}".`);
    } else if (!payload || typeof payload !== "object") {
        console.warn(`[AI Presets Refine Parser] Payload is not a JSON object/array for category "${categoryKey}":`, payload);
        return {
            ok: false,
            reason: "Reply must be a JSON object or array",
            candidates: [],
            fallbackScoresApplied: 0,
        };
    } else {
        if (payload.category && normalizeCategoryKey(payload.category, categoryAliases) !== categoryKey) {
            console.warn(`[AI Presets Refine Parser] Category mismatch: expected "${categoryKey}", got "${payload.category}"`);
            return {
                ok: false,
                reason: "Category mismatch in response",
                candidates: [],
                fallbackScoresApplied: 0,
            };
        }
        if (Array.isArray(payload.candidates)) {
            candidateItems = payload.candidates;
        } else if (Array.isArray(payload.styles)) {
            candidateItems = payload.styles;
        } else {
            console.warn(`[AI Presets Refine Parser] Missing or invalid candidates/styles array for category "${categoryKey}"`);
            return {
                ok: false,
                reason: "Missing or invalid candidates array",
                candidates: [],
                fallbackScoresApplied: 0,
            };
        }
    }

    const normalizedMap = new Map((allowedNames || []).map((name) => [normalizeStyleName(name), name]));
    const limit = Number.isFinite(maxCandidates) && maxCandidates > 0
        ? Math.floor(maxCandidates)
        : MAX_MODEL_CANDIDATES_PER_CATEGORY;

    const resolved = [];
    const seen = new Set();
    for (const item of candidateItems || []) {
        const rawName = typeof item === "string"
            ? item
            : (item && typeof item === "object" && typeof item.name === "string" ? item.name : "");
        if (!rawName) continue;

        const normalized = normalizeStyleName(rawName);
        const canonical = normalizedMap.get(normalized);
        if (canonical && !seen.has(canonical)) {
            seen.add(canonical);
            resolved.push({
                name: canonical,
                score: item && typeof item === "object" ? item.score : null,
            });
        } else if (!canonical) {
        }
        if (resolved.length >= limit) break;
    }

    if (resolved.length === 0) {
        return {
            ok: false,
            reason: "No valid candidates after filtering",
            candidates: [],
            fallbackScoresApplied: 0,
        };
    }

    const { candidates: scoredCandidates, fallbackCount } = applyCandidateFallbackScores(resolved);
    return {
        ok: true,
        candidates: scoredCandidates,
        fallbackScoresApplied: fallbackCount,
    };
}

export function computeCategoryScoreFromCandidates(candidates = []) {
    const numericScores = (candidates || [])
        .map((candidate) => (typeof candidate?.score === "number" && Number.isFinite(candidate.score)
            ? Math.max(0, Math.min(1, candidate.score))
            : null))
        .filter((score) => score !== null);

    if (numericScores.length === 0) return null;
    return Math.max(...numericScores) * 100;
}

/* ── Generic fetch with timeout + caller signal ── */

/**
 * Perform a fetch with per-request timeout and optional caller-provided AbortSignal.
 * Throws HttpError on non-ok responses and RequestTimeoutError on timeout.
 *
 * @param {string} url
 * @param {RequestInit} fetchOptions  — standard fetch options (method, headers, body …)
 * @param {Object}      opts
 * @param {number}      [opts.timeoutMs]  — per-request timeout (ms)
 * @param {AbortSignal} [opts.signal]     — caller abort signal (e.g. from a cancel button)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, fetchOptions = {}, { timeoutMs, signal } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const { throwOnHttpError = true, ...nativeFetchOptions } = fetchOptions || {};

    const abortFromCaller = () => controller.abort();
    if (signal) {
        if (signal.aborted) {
            abortFromCaller();
        } else {
            signal.addEventListener("abort", abortFromCaller, { once: true });
        }
    }

    const timeoutId = timeoutMs != null
        ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)
        : null;

    try {
        const response = await fetch(url, {
            ...nativeFetchOptions,
            signal: controller.signal,
        });

        if (!response.ok && throwOnHttpError) {
            throw new HttpError(response.status, response.headers);
        }
        return response;
    } catch (err) {
        if (timedOut && err?.name === "AbortError") {
            throw new RequestTimeoutError(timeoutMs);
        }
        throw err;
    } finally {
        if (signal) signal.removeEventListener("abort", abortFromCaller);
        if (timeoutId !== null) clearTimeout(timeoutId);
    }
}

/* ── Ollama provider adapter ── */

/**
 * Send a chat request to Ollama and return the assistant reply text.
 *
 * @param {Object}      opts
 * @param {string}      opts.model
 * @param {Array}       opts.messages    — [{ role, content }]
 * @param {number}      [opts.timeoutMs] — per-request timeout
 * @param {AbortSignal} [opts.signal]    — caller abort signal
 * @returns {Promise<string>} assistant reply text
 */
export async function ollamaChat({ model, messages, timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS, signal } = {}) {
    const response = await fetchWithTimeout(
        OLLAMA_CHAT_URL,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, stream: false }),
        },
        { timeoutMs, signal },
    );

    const data = await response.json();
    const replyText = data?.message?.content;
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from Ollama");
    }
    return replyText;
}

function sanitizeOpenAIErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function sanitizeAnthropicErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function sanitizeGeminiErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function sanitizeHuggingFaceErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function flattenMessagesForOpenAIInput(messages = []) {
    const flattened = (messages || [])
        .map((message) => {
            const role = String(message?.role || "user").toUpperCase();
            const content = String(message?.content || "").trim();
            if (!content) return "";
            return `${role}:\n${content}`;
        })
        .filter(Boolean)
        .join("\n\n");
    return flattened.trim();
}

function extractOpenAIReplyText(data) {
    const directText = data?.output_text;
    if (typeof directText === "string" && directText.trim()) {
        return directText.trim();
    }

    const chunks = [];
    const output = Array.isArray(data?.output) ? data.output : [];
    output.forEach((entry) => {
        const content = Array.isArray(entry?.content) ? entry.content : [];
        content.forEach((part) => {
            if (typeof part?.output_text === "string" && part.output_text.trim()) {
                chunks.push(part.output_text.trim());
                return;
            }
            if (typeof part?.text === "string" && part.text.trim()) {
                chunks.push(part.text.trim());
            }
        });
    });
    if (chunks.length > 0) {
        return chunks.join("\n").trim();
    }
    return "";
}

export async function openaiChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("OpenAI API key is required");
    }

    const inputText = flattenMessagesForOpenAIInput(messages);
    if (!inputText) {
        throw new Error("No prompt content provided for OpenAI request");
    }

    const response = await fetchWithTimeout(
        OPENAI_RESPONSES_URL,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                input: inputText,
                temperature: 0.2,
                max_output_tokens: 1200,
            }),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = sanitizeOpenAIErrorMessage(
            data?.error?.message || data?.message || ""
        );
        throw new HttpError(response.status, response.headers, detail);
    }

    const replyText = extractOpenAIReplyText(data);
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from OpenAI");
    }
    return replyText;
}

export async function openaiTestApiKey({
    apiKey,
    model = "gpt-4.1-mini",
    timeoutMs = 10000,
    signal,
} = {}) {
    await openaiChat({
        apiKey,
        model,
        messages: [
            {
                role: "user",
                content: 'Return ONLY valid JSON: {"ok":true}',
            },
        ],
        timeoutMs,
        signal,
    });
}

function splitAnthropicSystemAndMessages(messages = []) {
    const systemParts = [];
    const outMessages = [];

    (messages || []).forEach((message) => {
        const roleRaw = String(message?.role || "user").trim().toLowerCase();
        const content = String(message?.content || "").trim();
        if (!content) return;

        if (roleRaw === "system") {
            systemParts.push(content);
            return;
        }

        const role = roleRaw === "assistant" ? "assistant" : "user";
        outMessages.push({ role, content });
    });

    return {
        system: systemParts.join("\n\n").trim(),
        messages: outMessages,
    };
}

function extractAnthropicReplyText(data) {
    const chunks = [];
    const content = Array.isArray(data?.content) ? data.content : [];
    content.forEach((part) => {
        if (part?.type === "text" && typeof part?.text === "string" && part.text.trim()) {
            chunks.push(part.text.trim());
        }
    });
    return chunks.join("\n").trim();
}

export async function anthropicChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("Anthropic API key is required");
    }

    const split = splitAnthropicSystemAndMessages(messages);
    if (!Array.isArray(split.messages) || split.messages.length === 0) {
        throw new Error("No prompt content provided for Anthropic request");
    }

    const body = {
        model,
        max_tokens: 1200,
        temperature: 0.2,
        messages: split.messages,
    };
    if (split.system) {
        body.system = split.system;
    }

    const response = await fetchWithTimeout(
        ANTHROPIC_MESSAGES_URL,
        {
            method: "POST",
            headers: {
                "x-api-key": token,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = sanitizeAnthropicErrorMessage(
            data?.error?.message || data?.message || ""
        );
        throw new HttpError(response.status, response.headers, detail);
    }

    const replyText = extractAnthropicReplyText(data);
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from Anthropic");
    }
    return replyText;
}

export async function anthropicTestApiKey({
    apiKey,
    model = "claude-3-5-haiku-latest",
    timeoutMs = 10000,
    signal,
} = {}) {
    await anthropicChat({
        apiKey,
        model,
        messages: [
            {
                role: "system",
                content: "Return ONLY valid JSON.",
            },
            {
                role: "user",
                content: '{"ok":true}',
            },
        ],
        timeoutMs,
        signal,
    });
}

function sanitizeGroqErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function splitGroqSystemAndMessages(messages = []) {
    const systemParts = [];
    const outMessages = [];

    (messages || []).forEach((message) => {
        const roleRaw = String(message?.role || "user").trim().toLowerCase();
        const content = String(message?.content || "").trim();
        if (!content) return;

        if (roleRaw === "system") {
            systemParts.push(content);
            return;
        }

        const role = roleRaw === "assistant" ? "assistant" : "user";
        outMessages.push({ role, content });
    });

    const result = [];
    if (systemParts.length > 0) {
        result.push({ role: "system", content: systemParts.join("\n\n").trim() });
    }
    result.push(...outMessages);
    return result;
}

export async function groqChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("Groq API key is required");
    }

    const chatMessages = splitGroqSystemAndMessages(messages);
    if (chatMessages.length === 0) {
        throw new Error("No prompt content provided for Groq request");
    }

    const response = await fetchWithTimeout(
        GROQ_CHAT_URL,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: chatMessages,
                temperature: 0.2,
                max_tokens: 1200,
            }),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const rawMessage = data?.error?.message || data?.message || "";
        const detail = sanitizeGroqErrorMessage(rawMessage);
        const err = new HttpError(response.status, response.headers, detail);
        if (response.status === 429) {
            const waitMs = parseGroqRateLimitWaitMs(rawMessage);
            if (waitMs !== null) {
                err.retryAfterBodyMs = waitMs;
            }
        }
        throw err;
    }

    const replyText = data?.choices?.[0]?.message?.content;
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from Groq");
    }
    return replyText.trim();
}

export async function groqTestApiKey({
    apiKey,
    model = "llama-3.1-8b-instant",
    timeoutMs = 10000,
    signal,
} = {}) {
    await groqChat({
        apiKey,
        model,
        messages: [
            {
                role: "system",
                content: "Return ONLY valid JSON.",
            },
            {
                role: "user",
                content: '{"ok":true}',
            },
        ],
        timeoutMs,
        signal,
    });
}

function splitGeminiSystemAndContents(messages = []) {
    const systemParts = [];
    const contents = [];

    (messages || []).forEach((message) => {
        const roleRaw = String(message?.role || "user").trim().toLowerCase();
        const content = String(message?.content || "").trim();
        if (!content) return;

        if (roleRaw === "system") {
            systemParts.push(content);
            return;
        }

        const role = roleRaw === "assistant" ? "model" : "user";
        contents.push({
            role,
            parts: [{ text: content }],
        });
    });

    return {
        system: systemParts.join("\n\n").trim(),
        contents,
    };
}

function extractGeminiReplyText(data) {
    const chunks = [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    candidates.forEach((candidate) => {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        parts.forEach((part) => {
            if (typeof part?.text === "string" && part.text.trim()) {
                chunks.push(part.text.trim());
            }
        });
    });
    return chunks.join("\n").trim();
}

export async function geminiChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("Gemini API key is required");
    }

    const split = splitGeminiSystemAndContents(messages);
    if (!Array.isArray(split.contents) || split.contents.length === 0) {
        throw new Error("No prompt content provided for Gemini request");
    }

    const body = {
        contents: split.contents,
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
        },
    };
    if (split.system) {
        body.systemInstruction = {
            parts: [{ text: split.system }],
        };
    }

    const url = `${GEMINI_GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`;
    const response = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = sanitizeGeminiErrorMessage(
            data?.error?.message || data?.message || ""
        );
        throw new HttpError(response.status, response.headers, detail);
    }

    const replyText = extractGeminiReplyText(data);
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from Gemini");
    }
    return replyText;
}

export async function geminiTestApiKey({
    apiKey,
    model = "gemini-1.5-flash",
    timeoutMs = 10000,
    signal,
} = {}) {
    await geminiChat({
        apiKey,
        model,
        messages: [
            {
                role: "system",
                content: "Return ONLY valid JSON.",
            },
            {
                role: "user",
                content: '{"ok":true}',
            },
        ],
        timeoutMs,
        signal,
    });
}

function splitHuggingFaceSystemAndMessages(messages = []) {
    const systemParts = [];
    const outMessages = [];

    (messages || []).forEach((message) => {
        const roleRaw = String(message?.role || "user").trim().toLowerCase();
        const content = String(message?.content || "").trim();
        if (!content) return;

        if (roleRaw === "system") {
            systemParts.push(content);
            return;
        }

        const role = roleRaw === "assistant" ? "assistant" : "user";
        outMessages.push({ role, content });
    });

    const result = [];
    if (systemParts.length > 0) {
        result.push({ role: "system", content: systemParts.join("\n\n").trim() });
    }
    result.push(...outMessages);
    return result;
}

export async function huggingFaceChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("Hugging Face token is required");
    }

    const modelId = String(model || "").trim();
    if (!modelId) {
        throw new Error("Hugging Face model is required");
    }

    const chatMessages = splitHuggingFaceSystemAndMessages(messages);
    if (chatMessages.length === 0) {
        throw new Error("No prompt content provided for Hugging Face request");
    }

    const url = HUGGINGFACE_CHAT_COMPLETIONS_URL;

    const response = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: modelId,
                messages: chatMessages,
                max_tokens: 1200,
                temperature: 0.2,
            }),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    let rawText = "";
    try {
        rawText = await response.text();
    } catch {
        rawText = "";
    }
    if (rawText) {
        try {
            data = JSON.parse(rawText);
        } catch {
            data = rawText.trim();
        }
    }

    if (!response.ok) {
        const errorBody = typeof data === "string"
            ? data
            : (data?.error?.message || data?.error || data?.message || "");
        const detail = sanitizeHuggingFaceErrorMessage(errorBody);

        if (response.status === 404) {
            const hint = detail
                ? `Model "${modelId}" not found on HF Router — ${detail}`
                : `Model "${modelId}" not found on HF Router. Select another Hugging Face model and try again.`;
            throw new HttpError(404, response.headers, hint);
        }
        throw new HttpError(response.status, response.headers, detail);
    }

    const replyText = data?.choices?.[0]?.message?.content;
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from Hugging Face");
    }
    return replyText.trim();
}

export async function huggingFaceTestApiKey({
    apiKey,
    model = "moonshotai/Kimi-K2-Instruct-0905",
    timeoutMs = 15000,
    signal,
} = {}) {
    await huggingFaceChat({
        apiKey,
        model,
        messages: [
            {
                role: "user",
                content: "Generate a short, single-sentence response.",
            },
        ],
        timeoutMs,
        signal,
    });
}

function sanitizeOpenRouterErrorMessage(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

function splitOpenRouterSystemAndMessages(messages = []) {
    const systemParts = [];
    const outMessages = [];

    (messages || []).forEach((message) => {
        const roleRaw = String(message?.role || "user").trim().toLowerCase();
        const content = String(message?.content || "").trim();
        if (!content) return;

        if (roleRaw === "system") {
            systemParts.push(content);
            return;
        }

        const role = roleRaw === "assistant" ? "assistant" : "user";
        outMessages.push({ role, content });
    });

    const result = [];
    if (systemParts.length > 0) {
        result.push({ role: "system", content: systemParts.join("\n\n").trim() });
    }
    result.push(...outMessages);
    return result;
}

export async function openrouterChat({
    apiKey,
    model,
    messages,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
} = {}) {
    const token = String(apiKey || "").trim();
    if (!token) {
        throw new Error("OpenRouter API key is required");
    }

    const chatMessages = splitOpenRouterSystemAndMessages(messages);
    if (chatMessages.length === 0) {
        throw new Error("No prompt content provided for OpenRouter request");
    }

    const response = await fetchWithTimeout(
        OPENROUTER_CHAT_URL,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/andreszs/comfyui-styler-pipeline",
                "X-Title": "ComfyUI Styler Pipeline",
            },
            body: JSON.stringify({
                model,
                messages: chatMessages,
                temperature: 0.2,
                max_tokens: 1200,
            }),
            throwOnHttpError: false,
        },
        { timeoutMs, signal },
    );

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = sanitizeOpenRouterErrorMessage(
            data?.error?.message || data?.message || ""
        );
        throw new HttpError(response.status, response.headers, detail);
    }

    const replyText = data?.choices?.[0]?.message?.content;
    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("No reply content received from OpenRouter");
    }
    return replyText.trim();
}

export async function openrouterTestApiKey({
    apiKey,
    model = "openai/gpt-4o-mini",
    timeoutMs = 10000,
    signal,
} = {}) {
    await openrouterChat({
        apiKey,
        model,
        messages: [
            {
                role: "system",
                content: "Return ONLY valid JSON.",
            },
            {
                role: "user",
                content: '{"ok":true}',
            },
        ],
        timeoutMs,
        signal,
    });
}

/**
 * Fetch the list of locally-available Ollama model names.
 * @returns {Promise<string[]>}
 */
export async function ollamaFetchModels({ timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS, signal } = {}) {
    const response = await fetchWithTimeout(
        OLLAMA_TAGS_URL,
        {
            method: "GET",
        },
        { timeoutMs, signal },
    );
    const data = await response.json();
    return Array.isArray(data?.models)
        ? data.models.map((model) => model?.name).filter((name) => typeof name === "string" && name.trim())
        : [];
}

/**
 * Lightweight health-check ping (HEAD request).
 * @returns {Promise<boolean>}
 */
export async function ollamaHealthPing({ timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS } = {}) {
    try {
        const res = await fetchWithTimeout(
            OLLAMA_HEALTH_URL,
            { method: "HEAD", throwOnHttpError: false },
            { timeoutMs },
        );
        return res.ok || res.status > 0; // any HTTP response means Ollama is up
    } catch {
        return false;
    }
}

/* —— Provider adapters + retry wrapper —— */

export async function requestLLM({
    provider,
    model,
    messages,
    apiKey,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
    ollamaPreflightContext,
} = {}) {
    if (provider === "ollama") {
        await runOllamaRequestPreflight({
            provider,
            model,
            messages,
            timeoutMs,
            ...((ollamaPreflightContext && typeof ollamaPreflightContext === "object") ? ollamaPreflightContext : {}),
        });
        return ollamaChat({ model, messages, timeoutMs, signal });
    }
    if (provider === "openai") {
        return openaiChat({ apiKey, model, messages, timeoutMs, signal });
    }
    if (provider === "anthropic") {
        return anthropicChat({ apiKey, model, messages, timeoutMs, signal });
    }
    if (provider === "groq") {
        return groqChat({ apiKey, model, messages, timeoutMs, signal });
    }
    if (provider === "gemini") {
        return geminiChat({ apiKey, model, messages, timeoutMs, signal });
    }
    if (provider === "huggingface") {
        return huggingFaceChat({ apiKey, model, messages, timeoutMs, signal });
    }
    if (provider === "openrouter") {
        return openrouterChat({ apiKey, model, messages, timeoutMs, signal });
    }
    throw new Error(`Unknown provider: ${provider}`);
}

export async function requestLLMWithRetry({
    provider,
    model,
    messages,
    apiKey,
    timeoutMs = CATEGORY_REQUEST_TIMEOUT_MS,
    signal,
    maxAttempts = RETRY_MAX_ATTEMPTS,
    retryBackoffMs = RETRY_BACKOFF_MS,
    retryJitterMaxMs = RETRY_JITTER_MAX_MS,
    onRetry,
    ollamaPreflightContext,
} = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const replyText = await requestLLM({
                provider,
                model,
                messages,
                apiKey,
                timeoutMs,
                signal,
                ollamaPreflightContext,
            });
            return {
                ok: true,
                replyText,
                attemptsUsed: attempt + 1,
            };
        } catch (err) {
            if (err?.name === "AbortError") {
                throw err;
            }

            if (err instanceof RequestTimeoutError) {
                return {
                    ok: false,
                    reason: "timeout",
                    error: err,
                    attemptsUsed: attempt + 1,
                    errorLabel: "Timeout",
                };
            }

            if (err instanceof OllamaPreflightError) {
                return {
                    ok: false,
                    reason: "preflight",
                    error: err,
                    attemptsUsed: attempt + 1,
                    errorLabel: "Unavailable",
                };
            }

            if (isRetryableHttpError(err) && attempt < maxAttempts - 1) {
                const backoffMs = retryBackoffMs[attempt + 1] || 3000;
                const retryAfterMs = getRetryAfterMs(err);
                const delayMs = Math.max(backoffMs, retryAfterMs) + getJitter(retryJitterMaxMs);
                if (typeof onRetry === "function") {
                    await onRetry({
                        attempt,
                        nextAttempt: attempt + 1,
                        maxAttempts,
                        error: err,
                        delayMs,
                    });
                }
                await sleepWithSignal(delayMs, signal);
                continue;
            }

            return {
                ok: false,
                reason: err instanceof HttpError ? "http_error" : "error",
                error: err,
                attemptsUsed: attempt + 1,
                errorLabel: getHttpErrorLabel(err, provider),
            };
        }
    }

    return {
        ok: false,
        reason: "error",
        error: new Error("Exhausted retry attempts"),
        attemptsUsed: maxAttempts,
        errorLabel: "HTTP err",
    };
}

/**
 * Check if ComfyUI is currently executing a workflow by querying the queue endpoint.
 * @returns {Promise<boolean>} True if ComfyUI is busy (queue_running or queue_pending has items)
 */
export async function checkComfyUIBusy() {
    try {
        const response = await fetch(COMFYUI_QUEUE_URL);
        if (!response.ok) {
            console.warn("[API] Failed to check ComfyUI queue status:", response.status);
            return false;
        }
        const data = await response.json();
        const queueRunning = data?.queue_running || [];
        const queuePending = data?.queue_pending || [];
        return queueRunning.length > 0 || queuePending.length > 0;
    } catch (err) {
        console.warn("[API] Error checking ComfyUI queue:", err);
        return false;
    }
}

/* —— Model classification —— */

/**
 * Classify a local model's compatibility level.
 * Returns "compatible" | "not_recommended" | "incompatible" | null (for cloud/empty).
 */
export function classifyLocalModel(modelName) {
    if (!modelName) return null;
    if (modelName.endsWith("-cloud")) return null; // cloud models are always fine
    const name = modelName.trim().toLowerCase();
    if (name === RECOMMENDED_LOCAL_MODEL) return "compatible";
    if (name.startsWith("gemma")) return "compatible";
    return "incompatible";
}

export function isLocalModelName(modelName) {
    return !!modelName && !modelName.endsWith("-cloud");
}

/* —— Data preparation for LLM queries —— */

export function buildLocalStyleIndex(styleIndex, canonicalCategories = CANONICAL_CATEGORIES) {
    const byCategory = {};
    canonicalCategories.forEach((category) => {
        byCategory[category] = [];
    });

    (styleIndex || []).forEach((item) => {
        const category = normalizeCategoryKey(item?.category);
        const title = normalizeWhitespace(item?.title);
        if (!category || !title) return;

        const positivePrompt = normalizeWhitespace(item?.positive_prompt || item?.prompt || "");
        byCategory[category].push({
            title,
            titleNorm: normalizeName(title),
            prompt: positivePrompt,
            promptNorm: normalizeName(positivePrompt),
        });
    });
    return byCategory;
}

export function buildAllowedStylesByCategory(styleByCategory, options = {}) {
    const maxStylesPerCategory = Number.isFinite(options.maxStylesPerCategory)
        ? Math.max(0, Number(options.maxStylesPerCategory))
        : MAX_ALLOWED_STYLES_PER_CATEGORY;
    const allowed = {};
    Object.entries(styleByCategory || {}).forEach(([category, list]) => {
        const names = uniqueStringList((list || []).map((item) => item?.title).filter(Boolean));
        allowed[category] = maxStylesPerCategory === 0
            ? names
            : names.slice(0, maxStylesPerCategory);
    });
    return allowed;
}

/* —— Parsing tests —— */

export function apiRunParsingTests() {
    console.group("AI Presets Parsing Tests");

    const testAllowedStyles = {
        "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        "atmosphere": ["Foggy", "Rainy", "Sunny"],
        "sci_fi": ["Cyberpunk", "Space Opera", "Dystopian"],
    };

    let passedTests = 0;
    let totalTests = 0;

    function runTest(name, testFn) {
        totalTests++;
        console.group(`Test ${totalTests}: ${name}`);
        try {
            testFn();
            passedTests++;
            console.log("PASSED");
        } catch (error) {
            console.error("FAILED:", error.message);
        }
        console.groupEnd();
    }

    // Test 1: Strict category+candidates format
    runTest("Strict category wrapper with scores", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `{
  "category": "lighting",
  "candidates": [
    {"name": "Neon Glow", "score": 0.95},
    {"name": "Hard Light", "score": 0.82}
  ]
}`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (!result.ok) throw new Error("Parser failed on category wrapper format");
        if (!result.candidateSelection.lighting) throw new Error("Missing lighting category");
        if (result.candidateSelection.lighting.length !== 2) throw new Error("Expected 2 candidates");
        const first = result.candidateSelection.lighting[0];
        if (!first || first.name !== "Neon Glow") throw new Error("Expected first candidate to be Neon Glow");
        if (typeof first.score !== "number" || Math.abs(first.score - 0.95) > 0.0001) throw new Error("Expected normalized score 0.95");
        console.log("Result:", result);
    });

    // Test 2: Strict format with markdown fences
    runTest("Strict format with ```json fences", () => {
        const singleCategoryAllowedStyles = {
            "atmosphere": ["Foggy", "Rainy", "Sunny"],
        };
        const response = `\`\`\`json
{
  "category": "atmosphere",
  "candidates": [
    {"name": "Foggy", "score": 0.88},
    {"name": "Rainy", "score": 0.75}
  ]
}
\`\`\``;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (!result.ok) throw new Error("Parser failed with fenced JSON");
        if (!result.candidateSelection.atmosphere) throw new Error("Missing atmosphere category");
        if (result.candidateSelection.atmosphere.length !== 2) throw new Error("Expected 2 candidates");
        console.log("Result:", result);
    });

    // Test 3: Strict format with invalid styles filtered out
    runTest("Strict format filters invalid style names", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `{
  "category": "lighting",
  "candidates": [
    {"name": "Neon Glow", "score": 0.95},
    {"name": "Fake Style", "score": 0.90},
    {"name": "Soft Ambient", "score": 0.85},
    {"name": "Another Fake", "score": 0.80}
  ]
}`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (!result.ok) throw new Error("Parser failed");
        if (!result.candidateSelection.lighting) throw new Error("Valid styles were dropped");
        if (result.candidateSelection.lighting.length !== 2) throw new Error(`Expected 2 valid styles, got ${result.candidateSelection.lighting.length}`);
        console.log("Result:", result);
    });

    // Test 4: Strict format with case-insensitive matching
    runTest("Strict format case-insensitive style matching", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `{
  "category": "lighting",
  "candidates": [
    {"name": "NEON GLOW", "score": 0.90},
    {"name": "soft ambient", "score": 0.85}
  ]
}`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (!result.ok) throw new Error("Parser failed");
        if (!result.candidateSelection.lighting) throw new Error("Missing lighting category");
        if (result.candidateSelection.lighting.length !== 2) throw new Error("Case-insensitive matching failed");
        console.log("Result:", result);
    });

    // Test 5: Strict format with empty candidates array
    runTest("Strict format with empty candidates array", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `{"category":"lighting","candidates":[]}`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (result.ok) throw new Error("Empty candidates should be treated as invalid");
        console.log("Result:", result);
    });

    // Test 6: Dirty local payload as direct array is normalized
    runTest("Direct array payload normalization", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `[
  {"name":"Neon Glow","score":0.95},
  {"name":"Hard Light","score":0.82}
]`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (!result.ok) throw new Error("Array normalization failed");
        if (!result.candidateSelection.lighting) throw new Error("Missing lighting category");
        if (result.candidateSelection.lighting.length !== 2) throw new Error("Expected 2 candidates");
        if (!Array.isArray(result.warnings) || result.warnings.length === 0) throw new Error("Expected normalization warning");
        console.log("Result:", result);
    });

    // Test 7: Legacy multi-category wrappers are rejected
    runTest("Legacy categories[] wrapper is rejected", () => {
        const singleCategoryAllowedStyles = {
            "lighting": ["Neon Glow", "Soft Ambient", "Hard Light"],
        };
        const response = `{
  "categories":[{"name":"lighting","relevance":95,"candidates":["Neon Glow"]}]
}`;
        const result = parseCandidateSelectionReply({
            replyText: response,
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (result.ok) throw new Error("categories[] wrapper should be rejected");
        console.log("Result:", result);
    });

    // Test 8: Empty/malformed responses
    runTest("Empty response", () => {
        const singleCategoryAllowedStyles = { "lighting": ["Neon Glow"] };
        const result = parseCandidateSelectionReply({
            replyText: "",
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (result.ok) throw new Error("Empty response should fail");
        console.log("Result:", result);
    });

    runTest("Malformed JSON", () => {
        const singleCategoryAllowedStyles = { "lighting": ["Neon Glow"] };
        const result = parseCandidateSelectionReply({
            replyText: "{styles: [this is not valid]}",
            allowedStylesByCategory: singleCategoryAllowedStyles,
            canonicalCategories: CANONICAL_CATEGORIES,
            categoryAliases: CATEGORY_ALIASES,
            minRelevance: MIN_RELEVANCE,
            maxCategories: MAX_CATEGORIES,
            maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
        });
        if (result.ok) throw new Error("Malformed JSON should fail");
        console.log("Result:", result);
    });

    console.groupEnd();
    console.log(`\nTest Results: ${passedTests}/${totalTests} passed`);

    if (passedTests === totalTests) {
        console.log("All tests passed!");
    } else {
        console.warn(`${totalTests - passedTests} test(s) failed`);
    }

    return { passed: passedTests, total: totalTests };
}

// Export test function to global scope for console access
if (typeof window !== "undefined") {
    window.aiPresetsRunParsingTests = apiRunParsingTests;
    console.log("Run aiPresetsRunParsingTests() to test Ollama parsing");
}


