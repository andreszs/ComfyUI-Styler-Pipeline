import { registerModule } from "./index.js";
import { getStyleIndex } from "../style-data.js";
import {
    applyModuleRightPanelStyles,
    applyModuleFooterSeparatorStyles,
    applyModuleFooterStyles,
    applyModuleFooterRightStyles,
    applyModuleFooterActionsStyles,
    applyModuleFooterButtonBaseStyles,
    applyModuleFooterCancelButtonStyles,
    applyModuleFooterApplyButtonStyles,
    wireModuleFooterButtonHover,
} from "./layout-shared.js";
import { showToast, showConfirm, showPrompt, getPersistedSetting, setPersistedSetting, getPersistedJSON, setPersistedJSON } from "../utils.js";
import { t } from "./i18n.js";
import {
    applyCategoryListStyles,
    ensureCategoryListScrollbarHiddenStyles,
    computeCategoryDensity,
    makeCategoryBtn,
} from "./category-sidebar-shared.js";
import {
    RETRY_MAX_ATTEMPTS,
    RECOMMENDED_LOCAL_MODEL,
    MAX_MODEL_CANDIDATES_PER_CATEGORY,
    CATEGORY_ALIASES,
    sleep,
    getHttpErrorLabel,
    normalizeCategoryKey,
    normalizeStyleName,
    normalizeWhitespace,
    classifyLocalModel,
    isLocalModelName,
    buildLocalStyleIndex,
    buildRefineCategoryMessages,
    parseRefineCategoryReply,
    requestLLMWithRetry,
    setOllamaRequestPreflight,
    isConnectivityError,
    normalizeConnectivityError,
    ollamaFetchModels,
    ollamaHealthPing,
    openaiTestApiKey,
    anthropicTestApiKey,
    groqTestApiKey,
    geminiTestApiKey,
    huggingFaceTestApiKey,
    openrouterTestApiKey,
    checkComfyUIBusy,
} from "./api.js";
import {
    createAiStylerModels,
    OPENAI_MODEL_DEFAULT,
    GROQ_MODEL_DEFAULT,
    GEMINI_MODEL_DEFAULT,
    HUGGINGFACE_MODEL_DEFAULT,
    OPENROUTER_MODEL_DEFAULT,
} from "./ai-styler-models.js";

const LOCAL_OMIT_ENABLE_DELAY_MS = 5000;
const CHIP_STAGGER_MS = 100;
const CHIP_STAGGER_FAST_MS = 50;
// Set to true to enable prompt-validation debug logging in the browser console.
const AI_PRESETS_DEBUG = false;
const CHIP_STAGGER_FAST_THRESHOLD = 12;
const SIDEBAR_CHIP_TYPE_CHAR_DELAY_MS = 14;
const SIDEBAR_CHIP_TYPE_STAGGER_MS = 90;
const CHIP_PROMPT_TOOLTIP_MAX_CHARS = 420;
const MANUAL_PICK_TERMINAL_STATES = new Set(["done", "no_results", "http_error", "timeout", "cancelled", "omitted"]);

const AI_PRESETS_README_URL = "https://github.com/andreszs/comfyui-styler-pipeline/blob/main/README.md";
const AI_PRESETS_README_MODEL_ANCHOR = "#adding-models-local--cloud-via-ollama";
const AI_PRESETS_README_PROMPT_ANCHOR = "#writing-a-good-prompt-for-ai-presets-suggestions";
const AI_PRESETS_SCROLLBAR_STYLE_ID = "dsp-ai-presets-category-list-scrollbar-style";
const AI_PRESETS_STATUS_BAR_FONT_SIZE = "11px";
const AI_PRESETS_QUERYING_ROW_BG = "rgba(0, 122, 255, 0.08)";

const PROVIDER_API_KEY_URLS = {
    openai: "https://platform.openai.com/docs/overview",
    anthropic: "https://platform.claude.com/docs/en/get-started",
    gemini: "https://ai.google.dev/gemini-api/docs",
    groq: "https://console.groq.com/docs/quickstart",
    huggingface: "https://huggingface.co/docs/hub/en/api",
    openrouter: "https://openrouter.ai/keys",
};
const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";
const AI_PRESETS_PLACEHOLDERS_URL = "/pipeline_control/assets/placeholders.json";
const PERSIST_KEY_PROVIDER = "ai_presets.last_provider";
const PERSIST_KEY_MODEL = "ai_presets.last_model";
const PERSIST_KEY_MODEL_BY_PROVIDER = "ai_presets.last_model_by_provider";
const PERSIST_KEY_HF_CUSTOM_MODEL = "ai_presets.hf_custom_model";
const PERSIST_KEY_REQUEST_TIMEOUT_SECONDS = "ai_presets.request_timeout_seconds";
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 25;
const MODEL_CACHE_KEY_PREFIX = "dsp_llm_models_cache:";
const HUGGINGFACE_CUSTOM_MODEL_OPTION_ID = "__hf_custom_model__";
const RATE_LIMIT_FALLBACK_SECONDS = 10;
const RATE_LIMIT_RETRY_SAFETY_SECONDS = 1;
const MODEL_DISCOVERY_TIMEOUT_MS = 15000;
const MODEL_REFRESH_REQUIRED_KEY_PROVIDER_IDS = new Set(["openai", "anthropic", "groq", "gemini"]);
// Prompt is persisted exclusively in __dsp_meta__.last_llm_prompt (node JSON).
// No localStorage fallback for prompt persistence.
const OLLAMA_POLL_INITIAL_MS = 2000;
const OLLAMA_POLL_MAX_MS = 10000;
const OLLAMA_POLL_BACKOFF = 1.5;
const OPENAI_MODEL_OPTIONS = [
    "gpt-5.2",
    "gpt-4o",
    "gpt-5-mini",
];
const OPENAI_MODEL_SET = new Set(OPENAI_MODEL_OPTIONS);
const OPENAI_STYLER_EXCLUDED_TOKENS = [
    "dall-e",
    "gpt-image",
    "chatgpt-image",
    "sora",
    "tts",
    "gpt-audio",
    "audio-preview",
    "gpt-4o-mini-tts",
    "gpt-4o-audio-preview",
    "whisper",
    "transcribe",
    "diarize",
    "moderation",
    "omni-moderation",
    "embedding",
    "text-embedding",
    "realtime",
    "gpt-realtime",
    "search-preview",
    "search-api",
    "-search-",
    "codex",
];
const OPENAI_STYLER_RECOMMENDED_PRIORITY = ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o"];
const OPENAI_STYLER_BUDGET_PRIORITY = ["gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini"];
const OPENAI_STYLER_ADVANCED_PRIORITY = ["o3", "o4-mini", "o1"];
const ANTHROPIC_MODEL_OPTIONS = [
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
];
const ANTHROPIC_MODEL_DEFAULT = ANTHROPIC_MODEL_OPTIONS[0].id;
const ANTHROPIC_MODEL_SET = new Set(ANTHROPIC_MODEL_OPTIONS.map((entry) => entry.id));
const GEMINI_MODEL_OPTIONS = [
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
];
const GEMINI_MODEL_SET = new Set(GEMINI_MODEL_OPTIONS.map((entry) => entry.id));
const GEMINI_STYLER_EXCLUDED_TOKENS = [
    "imagen-",
    "veo-",
    "image",
    "tts",
    "audio",
    "native-audio",
    "embedding",
    "aqa",
    "robotics",
    "computer-use",
    "deep-research",
    "nano-banana",
    "gemini-2.0",
    "gemma-3n-",
];
const GEMINI_STYLER_RECOMMENDED_PRIORITY = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
];
const GEMINI_STYLER_BUDGET_PRIORITY = [];
const HUGGINGFACE_MODEL_OPTIONS = [
    { id: "Qwen/Qwen2.5-7B-Instruct", label: "Qwen 2.5 7B Instruct" },
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct" },
    { id: "moonshotai/Kimi-K2-Instruct-0905", label: "Kimi K2 Instruct" },
];
const HUGGINGFACE_MODEL_SET = new Set(HUGGINGFACE_MODEL_OPTIONS.map((entry) => entry.id));
const HUGGINGFACE_DISCOVERY_FETCH_LIMIT = 100;
const HUGGINGFACE_VISIBLE_MODELS_LIMIT = 50;
const HUGGINGFACE_STYLER_ALLOWED_PIPELINE_TAGS = new Set([
    "text-generation",
    "text2text-generation",
    "conversational",
]);
const HUGGINGFACE_STYLER_EXCLUDED_PIPELINE_TAGS = new Set([
    "automatic-speech-recognition",
    "text-to-image",
    "image-to-text",
    "image-classification",
    "image-segmentation",
    "image-feature-extraction",
    "zero-shot-image-classification",
    "object-detection",
    "visual-question-answering",
    "video-classification",
    "text-to-video",
    "image-to-video",
    "audio-classification",
    "audio-to-audio",
    "text-to-audio",
    "audio-to-text",
    "text-to-speech",
    "speech-to-text",
    "feature-extraction",
    "text-classification",
    "token-classification",
    "zero-shot-classification",
    "sentence-similarity",
    "fill-mask",
    "summarization",
    "translation",
    "table-question-answering",
    "question-answering",
]);
const HUGGINGFACE_STYLER_EXCLUDED_KEYWORDS = [
    "automatic-speech-recognition",
    "speech",
    "asr",
    "whisper",
    "audio",
    "tts",
    "image",
    "vision",
    "multimodal",
    "video",
    "embedding",
    "embed",
    "feature-extraction",
    "text-classification",
    "classifier",
    "classification",
    "tokenizer",
    "tokenizers",
    "reranker",
    "rerank",
    "diffusion",
    "stable-diffusion",
    "segmentation",
    "detector",
    "detection",
    "whisper",
    "wav2vec",
    "clip",
];
const HUGGINGFACE_STYLER_ALLOWED_TAG_KEYWORDS = [
    "text-generation",
    "text2text-generation",
    "conversational",
];
const GROQ_MODEL_OPTIONS = [
    { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" },
    { id: "qwen/qwen3-32b", label: "qwen/qwen3-32b" },
    { id: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" },
];
const GROQ_MODEL_SET = new Set(GROQ_MODEL_OPTIONS.map((entry) => entry.id));
const GROQ_STYLER_EXCLUDED_TOKENS = ["whisper", "guard", "prompt-guard", "safeguard", "arabic", "saudi"];
const GROQ_STYLER_RECOMMENDED_PRIORITY = [
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "moonshotai/kimi-k2-instruct",
];
const GROQ_STYLER_BUDGET_PRIORITY = ["llama-3.1-8b-instant", "groq/compound-mini", "groq/compound"];

const OPENROUTER_MODEL_OPTIONS = [];
const OPENROUTER_MODEL_SET = new Set();
const OPENROUTER_FILTER_OTHER_ID = "__openrouter_filter_other__";
const OPENROUTER_DEFAULT_DISPLAY_COUNT = 50;

/* -- Placeholder rotation state -- */
let cachedPlaceholders = null;
let cachedPromptCandidates = null;
let lastPlaceholderIndex = -1;
let activationCounter = 0;
let lastLoggedPlaceholder = null;
const aiPresetsModuleStateStore = {
    snapshot: null,
};

function formatStylesActiveChipText(count) {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    return t("gallery.badge.styles_active", { count: safeCount });
}

/**
 * Load placeholder variants from JSON file.
 * @returns {Promise<string[]>} Array of placeholder strings
 */
async function loadPlaceholders() {
    if (cachedPlaceholders) return cachedPlaceholders;
    try {
        const response = await fetch(AI_PRESETS_PLACEHOLDERS_URL);
        if (!response.ok) {
            cachedPlaceholders = [t("ai_styler.prompt.fallback_placeholder")];
            return cachedPlaceholders;
        }
        cachedPlaceholders = await response.json();
        if (!Array.isArray(cachedPlaceholders) || cachedPlaceholders.length === 0) {
            cachedPlaceholders = [t("ai_styler.prompt.fallback_placeholder")];
        }
        return cachedPlaceholders;
    } catch (err) {
        cachedPlaceholders = ["Sci-fi scene inside a spaceship, tense mood, practical lighting\u2026"];
        return cachedPlaceholders;
    }
}

/**
 * Get a random placeholder, avoiding the last used one if possible.
 * @returns {Promise<string>} Random placeholder text
 */
async function getRandomPlaceholder() {
    const placeholders = await loadPlaceholders();
    if (placeholders.length === 1) return placeholders[0];

    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * placeholders.length);
    } while (newIndex === lastPlaceholderIndex && placeholders.length > 1);

    lastPlaceholderIndex = newIndex;
    return placeholders[newIndex];
}

async function refreshPromptPlaceholder(promptInput) {
    if (!promptInput) return;
    try {
        const placeholder = await getRandomPlaceholder();
        promptInput.placeholder = placeholder;
        lastLoggedPlaceholder = placeholder;
    } catch (_err) {
        // silently ignore placeholder rotation failures
    }
}

async function loadPromptCandidatesForRandomize() {
    if (Array.isArray(cachedPromptCandidates)) return cachedPromptCandidates;
    try {
        const response = await fetch(AI_PRESETS_PLACEHOLDERS_URL);
        if (!response.ok) {
            cachedPromptCandidates = [];
            return cachedPromptCandidates;
        }
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.length === 0) {
            cachedPromptCandidates = [];
            return cachedPromptCandidates;
        }
        cachedPromptCandidates = payload
            .map((entry) => String(entry || "").trim())
            .filter(Boolean);
        return cachedPromptCandidates;
    } catch (_err) {
        cachedPromptCandidates = [];
        return cachedPromptCandidates;
    }
}

async function applyRandomPromptCandidate(promptInput) {
    if (!promptInput) return;
    try {
        const candidates = await loadPromptCandidatesForRandomize();
        if (!candidates.length) return;
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const promptText = candidates[randomIndex];
        if (!promptText) return;
        promptInput.value = promptText;
        promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_err) {
        // silently ignore randomize failures
    }
}

function buildScoreBadgeHtml(score) {
    if (score === null || typeof score !== "number") return "";
    const normalized = Math.max(0, Math.min(1, score));
    const percentage = Math.round(normalized * 100);
    const r = Math.round(255 * (1 - normalized));
    const g = Math.round(255 * normalized);
    const textColor = `rgb(${r}, ${g}, 0)`;
    const bgColor = `rgba(${r}, ${g}, 0, 0.15)`;
    return `<span class="score-badge" style="background:${bgColor};color:${textColor};">${percentage}</span>`;
}

function formatModelDropdownLabel(modelName) {
    return modelName;
}

function isOpenAIModelName(modelName) {
    return OPENAI_MODEL_SET.has(String(modelName || "").trim());
}

function isAnthropicModelName(modelName) {
    return ANTHROPIC_MODEL_SET.has(String(modelName || "").trim());
}

function isGeminiModelName(modelName) {
    return GEMINI_MODEL_SET.has(String(modelName || "").trim());
}

function isHuggingFaceModelName(modelName) {
    return HUGGINGFACE_MODEL_SET.has(String(modelName || "").trim());
}

function isHuggingFaceCustomModelOption(modelName) {
    return String(modelName || "").trim() === HUGGINGFACE_CUSTOM_MODEL_OPTION_ID;
}

function isGroqModelName(modelName) {
    return GROQ_MODEL_SET.has(String(modelName || "").trim());
}

function isOpenRouterModelName(modelName) {
    return OPENROUTER_MODEL_SET.has(String(modelName || "").trim());
}

function getModelProvider(modelName) {
    if (isHuggingFaceCustomModelOption(modelName)) return "huggingface";
    if (isOpenAIModelName(modelName)) return "openai";
    if (isAnthropicModelName(modelName)) return "anthropic";
    if (isGroqModelName(modelName)) return "groq";
    if (isGeminiModelName(modelName)) return "gemini";
    if (isHuggingFaceModelName(modelName)) return "huggingface";
    if (isOpenRouterModelName(modelName)) return "openrouter";
    return "ollama";
}

function getProviderOptionIdForModel(modelName) {
    const trimmed = String(modelName || "").trim();
    if (!trimmed) return "";
    const provider = getModelProvider(trimmed);
    if (provider !== "ollama") return provider;
    return trimmed.endsWith("-cloud") ? "ollama_cloud" : "ollama_local";
}

function getApiProviderForProviderOption(providerId) {
    if (providerId === "openai" || providerId === "anthropic" || providerId === "groq" || providerId === "gemini" || providerId === "huggingface" || providerId === "openrouter") {
        return providerId;
    }
    return "ollama";
}

function getDefaultModelForProviderOption(providerId, availableModels = []) {
    const resolvedProviderId = String(providerId || "").trim();
    const availableModelIds = Array.isArray(availableModels)
        ? availableModels.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
        : [];
    if (!resolvedProviderId || availableModelIds.length === 0) return "";

    let preferredModelId = "";
    if (resolvedProviderId === "ollama_local") preferredModelId = RECOMMENDED_LOCAL_MODEL;
    else if (resolvedProviderId === "openai") preferredModelId = OPENAI_MODEL_DEFAULT;
    else if (resolvedProviderId === "anthropic") preferredModelId = ANTHROPIC_MODEL_DEFAULT;
    else if (resolvedProviderId === "groq") preferredModelId = GROQ_MODEL_DEFAULT;
    else if (resolvedProviderId === "gemini") preferredModelId = GEMINI_MODEL_DEFAULT;
    else if (resolvedProviderId === "huggingface") preferredModelId = HUGGINGFACE_MODEL_DEFAULT;
    else if (resolvedProviderId === "openrouter") preferredModelId = OPENROUTER_MODEL_DEFAULT;

    if (preferredModelId && availableModelIds.includes(preferredModelId)) {
        return preferredModelId;
    }
    if (resolvedProviderId === "huggingface") {
        const firstNonCustom = availableModelIds.find((id) => !isHuggingFaceCustomModelOption(id));
        if (firstNonCustom) return firstNonCustom;
    }
    return availableModelIds[0] || "";
}

function getProviderModelCacheStorageKey(providerId) {
    return `${MODEL_CACHE_KEY_PREFIX}${providerId}`;
}

function normalizeLastModelByProviderMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const normalized = {};
    Object.entries(value).forEach(([providerId, modelId]) => {
        const resolvedProviderId = String(providerId || "").trim();
        const resolvedModelId = String(modelId || "").trim();
        if (!resolvedProviderId || !resolvedModelId) return;
        normalized[resolvedProviderId] = resolvedModelId;
    });
    return normalized;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizePromptTooltipText(value) {
    let text = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return "";

    text = text
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{2,}/g, "\n");

    if (text.length > CHIP_PROMPT_TOOLTIP_MAX_CHARS) {
        text = `${text.slice(0, CHIP_PROMPT_TOOLTIP_MAX_CHARS - 1).trimEnd()}\u2026`;
    }
    return text;
}


function buildStylePromptTooltipLookup(styleIndex) {
    const byCategory = {};

    (styleIndex || []).forEach((item) => {
        const category = normalizeCategoryKey(item?.category);
        const title = normalizeWhitespace(item?.title);
        if (!category || !title) return;

        const positivePrompt = normalizePromptTooltipText(
            item?.positive_prompt || item?.prompt || item?.positive || item?.positivePrompt || ""
        );
        if (!positivePrompt) return;

        if (!byCategory[category]) byCategory[category] = new Map();
        byCategory[category].set(normalizeStyleName(title), positivePrompt);
    });

    return byCategory;
}

function buildSuggestionsQuickStartHtml() {
    return `
        <div class="dsp-ai-presets-quick-start">
            <div class="dsp-ai-presets-quick-start-card">
                <div class="dsp-ai-presets-quick-start-title">
                    <span class="dsp-ai-presets-quick-start-title-icon" aria-hidden="true">&#128640;</span>
                    <span>${t("ai_styler.quick_start.title")}</span>
                </div>
                <div class="dsp-ai-presets-quick-start-steps">
                    <div class="dsp-ai-presets-quick-start-step">
                        <span class="dsp-ai-presets-quick-start-step-number">1.</span>
                        <span class="dsp-ai-presets-quick-start-step-text">${t("ai_styler.quick_start.step1")}</span>
                    </div>
                    <div class="dsp-ai-presets-quick-start-step">
                        <span class="dsp-ai-presets-quick-start-step-number">2.</span>
                        <span class="dsp-ai-presets-quick-start-step-text">${t("ai_styler.quick_start.step2")}</span>
                    </div>
                    <div class="dsp-ai-presets-quick-start-step">
                        <span class="dsp-ai-presets-quick-start-step-number">3.</span>
                        <span class="dsp-ai-presets-quick-start-step-text">${t("ai_styler.quick_start.step3")}</span>
                    </div>
                    <div class="dsp-ai-presets-quick-start-step">
                        <span class="dsp-ai-presets-quick-start-step-number">4.</span>
                        <span class="dsp-ai-presets-quick-start-step-text">${t("ai_styler.quick_start.step4_before_key")} <span class="dsp-ai-presets-quick-start-key">${t("ai_styler.btn.query.label")}</span>.</span>
                    </div>
                    <div class="dsp-ai-presets-quick-start-step">
                        <span class="dsp-ai-presets-quick-start-step-number">5.</span>
                        <span class="dsp-ai-presets-quick-start-step-text">${t("ai_styler.quick_start.step5")}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function isDefaultSuggestionsPlaceholderText(value) {
    return String(value || "").trim() === "Results will appear here.";
}

function buildAiPresetsHtml() {
    const randomizePromptLabel = t("ai_styler.actions.randomize");
    return `
    <div class="dsp-overlay dsp-ai-presets-overlay" data-overlay="ai-presets">
        <div class="dsp-overlay-content">
            <div class="dsp-ai-presets-layout">
                    <div class="dsp-ai-presets-categories">
                        <div class="dsp-ai-presets-category-list"></div>
                    </div>
                    <div class="dsp-ai-presets-setup-block">
                        <div class="dsp-ai-presets-field">
                            <div class="dsp-ai-presets-model-row">
                                <div class="dsp-ai-presets-provider-col csp-form-col">
                                    <div class="dsp-ai-presets-select-header">
                                        <label class="dsp-ai-presets-label dsp-ai-presets-col-label" for="dsp-ai-presets-provider">${t("ai_styler.provider.label")}</label>
                                    </div>
                                    <select id="dsp-ai-presets-provider" class="dsp-ai-presets-select dsp-ai-presets-provider-select csp-form-control" aria-label="${t("ai_styler.provider.label")}"></select>
                                </div>
                                <div class="dsp-ai-presets-model-col csp-form-col">
                                    <div class="dsp-ai-presets-select-header dsp-ai-presets-model-select-header">
                                        <label class="dsp-ai-presets-label dsp-ai-presets-col-label" for="dsp-ai-presets-model">${t("ai_styler.model.label")}</label>
                                        <button class="dsp-btn csp-small-btn dsp-ai-presets-model-refresh" type="button" title="${t("ai_styler.btn.refresh_models.title")}" aria-label="${t("ai_styler.btn.refresh_models.title")}">${t("ai_styler.btn.refresh_models.label")}</button>
                                    </div>
                                    <select id="dsp-ai-presets-model" class="dsp-ai-presets-select dsp-ai-presets-model-select csp-form-control"></select>
                                </div>
                                <div class="dsp-ai-presets-token-col csp-form-col">
                                    <button class="dsp-btn csp-small-btn dsp-ai-presets-get-ollama" type="button" title="${t("ai_styler.btn.get_ollama.title")}" aria-label="${t("ai_styler.btn.get_ollama.label")}">${t("ai_styler.btn.get_ollama.label")}</button>
                                    <div class="dsp-ai-presets-openai-key-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-openai-key">${t("ai_styler.openai.key.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-openai-key-row">
                                            <input type="password" id="dsp-ai-presets-openai-key" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.openai.key.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-openai-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-ai-presets-anthropic-key-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-anthropic-key">${t("ai_styler.anthropic.key.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-anthropic-key-row">
                                            <input type="password" id="dsp-ai-presets-anthropic-key" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.anthropic.key.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-anthropic-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-ai-presets-groq-key-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-groq-key">${t("ai_styler.groq.key.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-groq-key-row">
                                            <input type="password" id="dsp-ai-presets-groq-key" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.groq.key.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-groq-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-ai-presets-gemini-key-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-gemini-key">${t("ai_styler.gemini.key.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-gemini-key-row">
                                            <input type="password" id="dsp-ai-presets-gemini-key" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.gemini.key.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-gemini-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-ai-presets-hf-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-hf-token">${t("ai_styler.huggingface.token.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-hf-token-row">
                                            <input type="password" id="dsp-ai-presets-hf-token" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.huggingface.token.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-hf-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-ai-presets-openrouter-key-wrap is-hidden">
                                        <div class="dsp-ai-presets-key-label-row">
                                            <label class="dsp-ai-presets-label" for="dsp-ai-presets-openrouter-key">${t("ai_styler.openrouter.key.label")}</label>
                                        </div>
                                        <div class="dsp-ai-presets-openrouter-key-row">
                                            <input type="password" id="dsp-ai-presets-openrouter-key" class="dsp-ai-presets-input csp-form-control csp-form-control--grow" autocomplete="off" spellcheck="false" placeholder="${t("ai_styler.openrouter.key.placeholder")}" />
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-openrouter-test" type="button">${t("ai_styler.btn.test.label")}</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="dsp-ai-presets-timeout-col csp-form-col">
                                    <div class="dsp-ai-presets-select-header dsp-ai-presets-timeout-header">
                                        <label class="dsp-ai-presets-label dsp-ai-presets-col-label" for="dsp-ai-presets-timeout">${t("ai_styler.timeout.label")}</label>
                                    </div>
                                    <input type="number" id="dsp-ai-presets-timeout" class="dsp-ai-presets-timeout-input csp-form-control csp-form-control--number" value="25" min="1" step="1" inputmode="numeric" aria-label="${t("ai_styler.timeout.aria_label")}" title="${t("ai_styler.timeout.title")}" />
                                </div>
                            </div>
                            <div class="dsp-ai-presets-model-row-badges">
                                <span class="dsp-ai-presets-provider-badge"></span>
                                <span class="dsp-ai-presets-provider-pricing-badge"></span>
                                <span class="dsp-ai-presets-model-warning-badge"></span>
                                <span class="dsp-ai-presets-model-status">${t("ai_styler.model_status.not_running")}</span>
                            </div>
                            <div class="dsp-ai-presets-setup-notices">
                                <div class="dsp-ai-presets-inline-error is-hidden"></div>
                                <div class="dsp-ai-presets-inline-warning is-hidden">
                                    <span class="dsp-ai-presets-inline-warning-icon" aria-hidden="true">&#9888;</span>
                                    <span class="dsp-ai-presets-inline-warning-body">${t("ai_styler.warning.ollama_recommended_model")}</span>
                                </div>
                            </div>
                            <div class="dsp-ai-presets-provider-helper-wrap is-hidden">
                                <button class="dsp-btn csp-small-btn dsp-ai-presets-get-api-key" type="button" title="${t("ai_styler.btn.get_api_key.title")}" aria-label="${t("ai_styler.btn.get_api_key.label")}">${t("ai_styler.btn.get_api_key.label")}</button>
                                <button class="dsp-btn csp-small-btn dsp-ai-presets-save-token" type="button" title="${t("ai_styler.actions.save_token_browser")}" aria-label="${t("ai_styler.actions.save_token_browser")}">${t("ai_styler.actions.save_token_browser")}</button>
                            </div>
                            <iframe class="dsp-ai-presets-token-save-target dsp-ai-presets-visually-hidden" title="" aria-hidden="true" tabindex="-1"></iframe>
                            <form class="dsp-ai-presets-token-save-form dsp-ai-presets-visually-hidden" method="post" action="" autocomplete="on" aria-hidden="true">
                                <input type="text" class="dsp-ai-presets-token-save-username" name="username" autocomplete="username" tabindex="-1" />
                                <input type="password" class="dsp-ai-presets-token-save-password" name="password" autocomplete="current-password" tabindex="-1" />
                            </form>
                        </div>
                    </div>
                    <div class="dsp-ai-presets-prompt-block">
                        <div class="dsp-ai-presets-field">
                            <div class="dsp-ai-presets-prompt-row">
                                <div class="dsp-ai-presets-prompt-input-wrap csp-form-col">
                                    <div class="dsp-ai-presets-label-row">
                                        <label class="dsp-ai-presets-label" for="dsp-ai-presets-prompt">${t("ai_styler.prompt.label")}</label>
                                        <div class="dsp-ai-presets-prompt-actions-row">
                                            <button class="dsp-btn csp-small-btn dsp-ai-presets-randomize" type="button" title="${randomizePromptLabel}" aria-label="${randomizePromptLabel}">${randomizePromptLabel}</button>
                                            <button class="dsp-ai-presets-help-btn dsp-btn dsp-btn-icon csp-small-btn csp-small-btn--icon" type="button" data-ai-presets-help="prompt" title="${t("ai_styler.btn.prompt_help.title")}" aria-label="${t("ai_styler.btn.prompt_help.aria_label")}">${t("ai_styler.btn.prompt_help.text")}</button>
                                        </div>
                                    </div>
                                    <div class="dsp-input-with-x">
                                        <input type="text" id="dsp-ai-presets-prompt" class="dsp-ai-presets-input csp-form-control" maxlength="150" placeholder="" />
                                        <button class="dsp-ai-presets-prompt-clear dsp-input-clear-x is-hidden" type="button" aria-label="Clear prompt">&#x2715;</button>
                                    </div>
                                </div>
                                <button class="dsp-btn dsp-ai-presets-generate" type="button">${t("ai_styler.btn.query.label")}</button>
                            </div>
                        </div>
                        <div class="dsp-ai-presets-suggestions">
                            <div class="dsp-ai-presets-suggestions-header">
                                <div class="dsp-ai-presets-suggestions-title">${t("ai_styler.suggestions.title")}</div>
                            </div>
                            <div class="dsp-ai-presets-suggestions-content">${buildSuggestionsQuickStartHtml()}</div>
                        </div>
                        <div class="dsp-ai-presets-status-bar">${t("ai_styler.status.ready")}</div>
                        <div class="dsp-module-footer dsp-ai-presets-footer">
                            <div class="dsp-module-footer-actions dsp-ai-presets-footer-actions">
                                <button class="dsp-btn dsp-apply-btn dsp-module-footer-apply dsp-ai-presets-apply" type="button" title="${t("actions.apply.title")}">${t("actions.apply.label")}</button>
                                <button class="dsp-btn dsp-cancel-btn dsp-module-footer-cancel dsp-ai-presets-cancel" type="button" title="${t("actions.cancel.title")}">${t("actions.cancel.label")}</button>
                            </div>
                            <div class="dsp-module-footer-right dsp-ai-presets-footer-right">
                                <span class="dsp-ai-presets-selected-count">${t("ai_styler.badge.no_styles_active")} <button class="dsp-ai-presets-selected-clear is-inactive" type="button" aria-hidden="true" tabindex="-1" disabled>\u2715</button></span>
                            </div>
                        </div>
                    </div>
            </div>
        </div>
    </div>`;
}

function applyAiPresetsStyles(container) {
    container.querySelectorAll(".dsp-ai-presets-category-list").forEach((list) => {
        applyCategoryListStyles(list);
    });
    ensureCategoryListScrollbarHiddenStyles();
    if (!document.getElementById(AI_PRESETS_SCROLLBAR_STYLE_ID)) {
        const style = document.createElement("style");
        style.id = AI_PRESETS_SCROLLBAR_STYLE_ID;
        style.textContent = `
            .dsp-ai-presets-category-list::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    container.querySelectorAll(".dsp-ai-presets-setup-block, .dsp-ai-presets-prompt-block").forEach((pane) => {
        applyModuleRightPanelStyles(pane);
    });



    container.querySelectorAll(".dsp-ai-presets-setup-block").forEach((form) => {
        form.classList.add("dsp-ai-presets-setup-block-ui");
    });

    container.querySelectorAll(".dsp-ai-presets-prompt-block").forEach((block) => {
        block.classList.add("dsp-ai-presets-prompt-block-ui");
    });

    container.querySelectorAll(".dsp-ai-presets-generate").forEach((btn) => {
        applyModuleFooterButtonBaseStyles(btn);
        applyModuleFooterApplyButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "apply");
        btn.classList.add("dsp-ai-presets-generate-ui");
    });

    container.querySelectorAll(".dsp-ai-presets-footer-separator").forEach((separator) => {
        applyModuleFooterSeparatorStyles(separator);
    });

    container.querySelectorAll(".dsp-ai-presets-footer").forEach((footer) => {
        applyModuleFooterStyles(footer);
    });

    container.querySelectorAll(".dsp-ai-presets-footer-right").forEach((right) => {
        applyModuleFooterRightStyles(right);
    });

    container.querySelectorAll(".dsp-ai-presets-footer-actions").forEach((actions) => {
        applyModuleFooterActionsStyles(actions);
    });

    container.querySelectorAll(".dsp-ai-presets-cancel, .dsp-ai-presets-apply").forEach((btn) => {
        applyModuleFooterButtonBaseStyles(btn);
        btn.classList.add("dsp-ai-presets-footer-btn-ui");
    });

    container.querySelectorAll(".dsp-ai-presets-cancel").forEach((btn) => {
        applyModuleFooterCancelButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "cancel");
    });

    container.querySelectorAll(".dsp-ai-presets-apply").forEach((btn) => {
        applyModuleFooterApplyButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "apply");
    });

    container.querySelectorAll(".dsp-ai-presets-status-bar").forEach((bar) => {
        // Create progress fill node for compatibility; visual styles are in CSS.
        let fill = bar.querySelector(".dsp-ai-presets-status-bar-fill");
        if (!fill) {
            fill = document.createElement("div");
            fill.className = "dsp-ai-presets-status-bar-fill";
            bar.prepend(fill);
        }
    });

    // Add spinner animation and loading styles for dynamically created elements
    if (!document.getElementById("dsp-ai-presets-spinner-animation")) {
        const style = document.createElement("style");
        style.id = "dsp-ai-presets-spinner-animation";
        style.textContent = `
            @keyframes dsp-ai-presets-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .dsp-ai-presets-loading-panel {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 20px;
                padding: 48px 16px;
                min-height: 160px;
                flex: 1;
            }
            
            .dsp-ai-presets-loading-spinner {
                width: 48px;
                height: 48px;
                border: 4px solid rgba(255, 255, 255, 0.12);
                border-top: 4px solid var(--styler-primary);
                border-radius: 50%;
                animation: dsp-ai-presets-spin 0.8s linear infinite;
                flex-shrink: 0;
            }
            
            .dsp-ai-presets-loading-text {
                font-size: 13px;
                color: var(--styler-text-muted);
                font-weight: 500;
                text-align: center;
            }

            .dsp-ai-presets-local-status-icon {
                width: 20px;
                height: 20px;
                min-width: 20px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 3px;
                line-height: 1;
                color: var(--styler-text);
                opacity: 1;
            }

            @keyframes dsp-ai-presets-bullet-pulse {
                0%, 100% {
                    opacity: 0.45;
                    filter: brightness(0.92);
                }
                50% {
                    opacity: 1;
                    filter: brightness(1.06);
                }
            }

            .dsp-ai-presets-status-bullet::before {
                content: "";
                width: 8px;
                height: 8px;
                border-radius: 999px;
                background: currentColor;
                box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent);
            }

            .dsp-ai-presets-status-bullet.is-pulsing::before {
                animation: dsp-ai-presets-bullet-pulse 1.05s ease-in-out infinite;
            }

            .dsp-ai-presets-status-bullet--running {
                color: #0a84ff;
            }

            .dsp-ai-presets-status-bullet--success {
                color: #16a34a;
            }

            .dsp-ai-presets-status-bullet--neutral {
                color: color-mix(in srgb, var(--styler-text) 70%, var(--styler-border));
            }

            .dsp-ai-presets-status-bullet--warn {
                color: var(--styler-status-warn, #b45309);
            }

            .dsp-ai-presets-status-bullet--error {
                color: #dc2626;
            }

            .dsp-ai-presets-status-bullet--ratelimit {
                color: #d97706;
            }

            .dsp-ai-presets-status-bar-typed--ratelimit {
                color: #d97706;
            }

            @keyframes dsp-ai-presets-running-pill-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.12);
                }
                50% {
                    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.08);
                }
            }

            @keyframes dsp-ai-presets-separator-pulse {
                0%, 100% {
                    border-bottom-color: var(--styler-error, #f44336);
                }
                50% {
                    border-bottom-color: var(--styler-primary, #2196F3);
                }
            }

            .dsp-tab-bar.dsp-tab-bar-pulse {
                animation: dsp-ai-presets-separator-pulse 2s ease-in-out infinite !important;
                will-change: border-bottom-color;
            }

            .dsp-ai-presets-state-pill--running {
                border-color: rgba(0, 122, 255, 0.52) !important;
                background: rgba(0, 122, 255, 0.14) !important;
                color: color-mix(in srgb, var(--styler-primary, #0a84ff) 58%, #0077ff) !important;
                animation: dsp-ai-presets-running-pill-pulse 1.5s ease-in-out infinite;
            }

            .dsp-ai-presets-local-refine-btn {
                border: none;
                border-radius: 999px;
                padding: 3px 9px;
                font-size: 11px;
                font-family: Arial, sans-serif;
                line-height: 1.2;
                display: inline-flex;
                align-items: center;
                white-space: nowrap;
                cursor: pointer;
                background: color-mix(in srgb, var(--styler-primary-bg) 8%, var(--styler-input-bg));
                color: color-mix(in srgb, var(--styler-primary, #3b82f6) 68%, #0066ff);
                transition: background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out, opacity 120ms ease-out;
            }

            .dsp-ai-presets-local-refine-btn:hover:not(:disabled) {
                background: color-mix(in srgb, var(--styler-primary-bg) 16%, var(--styler-input-bg));
                color: color-mix(in srgb, var(--styler-primary, #3b82f6) 60%, #0050ff);
            }

            .dsp-ai-presets-local-refine-btn:disabled {
                opacity: 0.5;
                cursor: default;
            }

            .dsp-ai-presets-local-refine-btn:focus,
            .dsp-ai-presets-local-refine-btn:focus-visible,
            .dsp-ai-presets-local-refine-btn:active,
            .dsp-ai-presets-local-refine-btn:disabled {
                border: none;
            }

            .dsp-ai-presets-local-browse-btn {
                border: 1px solid color-mix(in srgb, var(--styler-border) 60%, transparent) !important;
                border-radius: 999px !important;
                padding: 3px 9px !important;
                background: var(--styler-input-bg) !important;
                color: var(--styler-text) !important;
                transition: background 100ms ease-out !important;
            }

            .dsp-ai-presets-local-browse-btn:hover:not(:disabled) {
                background: color-mix(in srgb, var(--styler-primary-bg) 28%, var(--styler-panel-bg-secondary)) !important;
                color: var(--styler-text) !important;
            }

            .dsp-ai-presets-local-browse-btn:focus,
            .dsp-ai-presets-local-browse-btn:focus-visible,
            .dsp-ai-presets-local-browse-btn:active {
                border: 1px solid color-mix(in srgb, var(--styler-border) 60%, transparent) !important;
                border-radius: 999px !important;
                background: var(--styler-input-bg) !important;
                color: var(--styler-text) !important;
            }

            .dsp-ai-presets-status-bullet.is-hidden {
                display: none;
            }

            .dsp-ai-presets-status-bar-model,
            .dsp-ai-presets-status-bar-timer {
                color: var(--styler-text);
                opacity: 0.95;
            }
            
            .dsp-ai-presets-metrics {
                font-size: 11px;
                color: var(--styler-text-muted);
                padding: 6px 10px;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
                margin-top: 8px;
                font-family: "Consolas", "Monaco", monospace;
                line-height: 1.4;
            }

            /* Status bar theme classes */
            .dsp-ai-presets-statusbar--running .dsp-ai-presets-status-bar-fill,
            .dsp-ai-presets-statusbar--ok .dsp-ai-presets-status-bar-fill,
            .dsp-ai-presets-statusbar--warn .dsp-ai-presets-status-bar-fill,
            .dsp-ai-presets-statusbar--error .dsp-ai-presets-status-bar-fill {
                display: none !important;
            }

            .dsp-ai-presets-candidate-pill,
            .dsp-ai-presets-local-candidate-pill,
            .dsp-ai-presets-local-browse-btn {
                font-family: Consolas, "Courier New", monospace !important;
                font-size: ${AI_PRESETS_STATUS_BAR_FONT_SIZE} !important;
            }

        `;
        document.head.appendChild(style);
    }
}

function initAiPresets(container, manager) {
    applyAiPresetsStyles(container);

    const categoryList = container.querySelector(".dsp-ai-presets-category-list");
    const providerSelect = container.querySelector("#dsp-ai-presets-provider");
    const modelSelect = container.querySelector("#dsp-ai-presets-model");
    const timeoutInput = container.querySelector("#dsp-ai-presets-timeout");
    const modelRefreshBtn = container.querySelector(".dsp-ai-presets-model-refresh");
    const getOllamaBtn = container.querySelector(".dsp-ai-presets-get-ollama");
    const providerHelperWrap = container.querySelector(".dsp-ai-presets-provider-helper-wrap");
    const getApiKeyBtn = container.querySelector(".dsp-ai-presets-get-api-key");
    const saveTokenBtn = container.querySelector(".dsp-ai-presets-save-token");
    const tokenSaveTarget = container.querySelector(".dsp-ai-presets-token-save-target");
    const tokenSaveForm = container.querySelector(".dsp-ai-presets-token-save-form");
    const tokenSaveUsernameInput = container.querySelector(".dsp-ai-presets-token-save-username");
    const tokenSavePasswordInput = container.querySelector(".dsp-ai-presets-token-save-password");
    const modelStatus = container.querySelector(".dsp-ai-presets-model-status");
    const providerBadge = container.querySelector(".dsp-ai-presets-provider-badge");
    const providerPricingBadge = container.querySelector(".dsp-ai-presets-provider-pricing-badge");
    const warningBadge = container.querySelector(".dsp-ai-presets-model-warning-badge");
    const openaiKeyWrap = container.querySelector(".dsp-ai-presets-openai-key-wrap");
    const openaiKeyRow = container.querySelector(".dsp-ai-presets-openai-key-row");
    const openaiKeyInput = container.querySelector("#dsp-ai-presets-openai-key");
    const openaiTestBtn = container.querySelector(".dsp-ai-presets-openai-test");
    const anthropicKeyWrap = container.querySelector(".dsp-ai-presets-anthropic-key-wrap");
    const anthropicKeyRow = container.querySelector(".dsp-ai-presets-anthropic-key-row");
    const anthropicKeyInput = container.querySelector("#dsp-ai-presets-anthropic-key");
    const anthropicTestBtn = container.querySelector(".dsp-ai-presets-anthropic-test");
    const groqKeyWrap = container.querySelector(".dsp-ai-presets-groq-key-wrap");
    const groqKeyRow = container.querySelector(".dsp-ai-presets-groq-key-row");
    const groqKeyInput = container.querySelector("#dsp-ai-presets-groq-key");
    const groqTestBtn = container.querySelector(".dsp-ai-presets-groq-test");
    const geminiKeyWrap = container.querySelector(".dsp-ai-presets-gemini-key-wrap");
    const geminiKeyRow = container.querySelector(".dsp-ai-presets-gemini-key-row");
    const geminiKeyInput = container.querySelector("#dsp-ai-presets-gemini-key");
    const geminiTestBtn = container.querySelector(".dsp-ai-presets-gemini-test");
    const hfWrap = container.querySelector(".dsp-ai-presets-hf-wrap");
    const hfTokenRow = container.querySelector(".dsp-ai-presets-hf-token-row");
    const hfTokenInput = container.querySelector("#dsp-ai-presets-hf-token");
    const hfTestBtn = container.querySelector(".dsp-ai-presets-hf-test");
    const openrouterKeyWrap = container.querySelector(".dsp-ai-presets-openrouter-key-wrap");
    const openrouterKeyRow = container.querySelector(".dsp-ai-presets-openrouter-key-row");
    const openrouterKeyInput = container.querySelector("#dsp-ai-presets-openrouter-key");
    const openrouterTestBtn = container.querySelector(".dsp-ai-presets-openrouter-test");
    // Use the ID selector so we always get the prompt field, not any provider key
    // field (which also carries the .dsp-ai-presets-input class and can appear first
    // in DOM order, causing querySelector(".dsp-ai-presets-input") to return it).
    const promptInput = container.querySelector("#dsp-ai-presets-prompt");
    const promptClearBtn = container.querySelector(".dsp-ai-presets-prompt-clear");
    const inlineErrorLabel = container.querySelector(".dsp-ai-presets-inline-error");
    const inlineWarningLabel = container.querySelector(".dsp-ai-presets-inline-warning");
    const modelHelpBtn = container.querySelector('[data-ai-presets-help="model"]');
    const promptHelpBtn = container.querySelector('[data-ai-presets-help="prompt"]');
    const randomizePromptBtn = container.querySelector(".dsp-ai-presets-randomize");
    const generateBtn = container.querySelector(".dsp-ai-presets-generate");
    const applyBtn = container.querySelector(".dsp-ai-presets-apply");
    const cancelBtn = container.querySelector(".dsp-ai-presets-cancel");
    const selectedCountBadge = container.querySelector(".dsp-ai-presets-selected-count");
    const clearAllBtn = container.querySelector(".dsp-ai-presets-selected-clear");
    const suggestionsHeader = container.querySelector(".dsp-ai-presets-suggestions-header");
    const suggestionsContent = container.querySelector(".dsp-ai-presets-suggestions-content");
    const statusBar = container.querySelector(".dsp-ai-presets-status-bar");

    if (!categoryList || !providerSelect || !modelSelect || !timeoutInput || !modelRefreshBtn || !getOllamaBtn || !providerHelperWrap || !getApiKeyBtn || !saveTokenBtn || !tokenSaveTarget || !tokenSaveForm || !tokenSaveUsernameInput || !tokenSavePasswordInput || !modelStatus || !providerBadge || !providerPricingBadge || !openaiKeyWrap || !openaiKeyRow || !openaiKeyInput || !openaiTestBtn || !anthropicKeyWrap || !anthropicKeyRow || !anthropicKeyInput || !anthropicTestBtn || !groqKeyWrap || !groqKeyRow || !groqKeyInput || !groqTestBtn || !geminiKeyWrap || !geminiKeyRow || !geminiKeyInput || !geminiTestBtn || !hfWrap || !hfTokenRow || !hfTokenInput || !hfTestBtn || !openrouterKeyWrap || !openrouterKeyRow || !openrouterKeyInput || !openrouterTestBtn || !promptInput || !inlineErrorLabel || !inlineWarningLabel || !generateBtn || !applyBtn || !cancelBtn || !selectedCountBadge || !clearAllBtn || !suggestionsHeader || !suggestionsContent || !statusBar) {
        console.error("[AI Presets] Missing required elements");
        return;
    }
    const tokenSaveTargetName = `dsp-ai-presets-token-save-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    tokenSaveTarget.setAttribute("name", tokenSaveTargetName);
    tokenSaveForm.setAttribute("target", tokenSaveTargetName);
    tokenSaveForm.setAttribute("action", window.location.pathname || "/");

    let onSelectCallback = null;
    let onApplyCallback = null;
    let onCancelCallback = null;
    let disposeHeaderRefineMenu = null;
    let disposeHeaderAddMenu = null;
    let headerRefineBtn = null;
    const nodePromptBindings = {
        getLastLLMPrompt: null,
        setLastLLMPrompt: null,
    };
    const persistedProviderSelection = String(getPersistedSetting(PERSIST_KEY_PROVIDER, "") || "").trim();
    const persistedModelSelection = String(getPersistedSetting(PERSIST_KEY_MODEL, "") || "").trim();
    const persistedLastModelByProvider = normalizeLastModelByProviderMap(
        getPersistedJSON(PERSIST_KEY_MODEL_BY_PROVIDER, {})
    );
    const persistedModelProviderId = getProviderOptionIdForModel(persistedModelSelection);
    if (persistedModelProviderId && persistedModelSelection && !persistedLastModelByProvider[persistedModelProviderId]) {
        persistedLastModelByProvider[persistedModelProviderId] = persistedModelSelection;
    }
    const persistedRequestTimeoutSeconds = getPersistedSetting(PERSIST_KEY_REQUEST_TIMEOUT_SECONDS, DEFAULT_REQUEST_TIMEOUT_SECONDS);
    const initialRequestTimeoutSeconds = normalizeRequestTimeoutSeconds(persistedRequestTimeoutSeconds);
    const initialProviderSelection = persistedProviderSelection || persistedModelProviderId;
    const initialModelSelection = String(
        (initialProviderSelection && persistedLastModelByProvider[initialProviderSelection])
        || persistedModelSelection
        || ""
    ).trim();
    const initialLastHuggingFaceNonCustomModel = String(
        persistedLastModelByProvider.huggingface || ""
    ).trim();

    const state = {
        connecting: false,
        connected: false,
        error: null,
        models: [],
        providerModelCache: {},
        openAiStylerCatalog: null,
        groqStylerCatalog: null,
        geminiStylerCatalog: null,
        selectedProvider: initialProviderSelection,
        selectedModel: initialModelSelection,
        requestTimeoutSeconds: initialRequestTimeoutSeconds,
        lastSelectedModelByProvider: { ...persistedLastModelByProvider },
        lastOpenAiInvalidFallbackModel: "",
        lastGroqInvalidFallbackModel: "",
        lastGeminiInvalidFallbackModel: "",
        openaiApiKey: "",
        anthropicApiKey: "",
        groqApiKey: "",
        geminiApiKey: "",
        huggingFaceToken: "",
        openrouterApiKey: "",
        openrouterModelFilter: null,
        huggingFaceCustomModelId: String(getPersistedSetting(PERSIST_KEY_HF_CUSTOM_MODEL, "") || "").trim(),
        lastHuggingFaceNonCustomModel: isHuggingFaceCustomModelOption(initialLastHuggingFaceNonCustomModel)
            ? ""
            : initialLastHuggingFaceNonCustomModel,
        isGenerating: false,
        suggestionText: "Results will appear here.",
        stagedSelection: {},
        stagedCandidates: {},
        stagedSkipSet: new Set(),
        suggestionsVisible: false,
        suggestionsModelName: "",
        suggestionsRawJson: "",
        suggestionsWarnings: [],
        suggestionsNotes: [],
        suggestionsCategories: [],
        categoryHasFinalLLMResult: {},
        suggestionsErrorCategories: new Set(),
        sidebarLoadingCategories: new Set(),
        refiningCategories: new Set(),
        styleIndex: [],
        stylePromptTooltipLookupByCategory: {},
        generateRunId: 0,
        refineRunId: 0,
        showRawJson: false,
        abortController: null,
        refineAbortController: null,
        lastRequestMetrics: null,
        requestStartTime: null,
        statusTimerInterval: null,
        scopedCategories: new Set(),
        lastRequestModel: "",
        localSequentialActive: false,
        localSequentialStatusByCategory: {},
        progressTotal: 0,
        progressDone: 0,
        completedCount: 0,
        withResultsCount: 0,
        failedCount: 0,
        /** Per-category HTTP error label for display (e.g. "Rate limited (429)") */
        categoryHttpError: {},
        /** @type {string[]} Dynamic queue of category IDs for the current run */
        runQueue: [],
        /** Index of the next category to process in runQueue */
        runQueueIndex: 0,
        /** Whether the queue runner loop is actively processing */
        runQueueIsRunning: false,
        /** Cached allowed styles for the current run (so enqueued categories can resolve) */
        runAllowedStyles: null,
        chipRenderRunToken: 0,
        chipRenderTimersByCategory: {},
        sidebarTypingRunToken: 0,
        sidebarTypingInitialized: false,
        sidebarTypingQueue: [],
        sidebarTypingIsProcessing: false,
        sidebarTypingActiveTask: null,
        sidebarTypingVersionByCategory: {},
        sidebarSelectionLabelByCategory: {},
        isLocalQueryRun: false,
        batchRefineRunning: false,
        activeCategory: "",
        activeCategoryRequestId: 0,
        nextCategoryRequestId: 1,
        activeCategoryAbortController: null,
        activeCategoryAbortCleanup: null,
        omitEnableTimer: null,
        omitEnabledRequestId: 0,
        omittedCategoryRequestIds: new Set(),
        /** Ollama health-check polling */
        ollamaPollingTimer: null,
        ollamaPollingInterval: OLLAMA_POLL_INITIAL_MS,
        ollamaTabActive: false,
        pendingSidebarSync: false,
        suggestionsManuallyCleared: false,
        inlinePromptErrorText: "",
        refreshingProviderId: "",
        busyRequestCount: 0,
        ollamaOfflineToastUntil: 0,
        llmRateLimitGateUntilMs: 0,
        llmRequestInFlightPromise: null,
    };
    timeoutInput.value = String(state.requestTimeoutSeconds);
    const modelFns = createAiStylerModels();

    function cloneSnapshotCandidates(source) {
        const cloned = {};
        Object.entries(source || {}).forEach(([category, candidates]) => {
            if (!Array.isArray(candidates)) return;
            cloned[category] = candidates
                .map((item) => {
                    if (typeof item === "string") {
                        const name = item.trim();
                        if (!name) return null;
                        return { name, score: null };
                    }
                    if (item && typeof item.name === "string") {
                        const name = item.name.trim();
                        if (!name) return null;
                        const score = (typeof item.score === "number" && Number.isFinite(item.score))
                            ? Math.max(0, Math.min(1, item.score))
                            : null;
                        return { name, score };
                    }
                    return null;
                })
                .filter(Boolean);
        });
        return cloned;
    }

    function captureModuleSnapshot() {
        aiPresetsModuleStateStore.snapshot = {
            prompt: promptInput.value || "",
            selectedProvider: state.selectedProvider || "",
            selectedModel: state.selectedModel || "",
            requestTimeoutSeconds: state.requestTimeoutSeconds,
            lastSelectedModelByProvider: { ...(state.lastSelectedModelByProvider || {}) },
            suggestionText: state.suggestionText || "Results will appear here.",
            stagedSelection: cloneSelection(state.stagedSelection),
            stagedCandidates: cloneSnapshotCandidates(state.stagedCandidates),
            stagedSkipSet: Array.from(state.stagedSkipSet || []),
            suggestionsVisible: !!state.suggestionsVisible,
            suggestionsModelName: state.suggestionsModelName || "",
            suggestionsRawJson: state.suggestionsRawJson || "",
            suggestionsWarnings: Array.isArray(state.suggestionsWarnings) ? [...state.suggestionsWarnings] : [],
            suggestionsNotes: Array.isArray(state.suggestionsNotes) ? [...state.suggestionsNotes] : [],
            suggestionsCategories: Array.isArray(state.suggestionsCategories) ? [...state.suggestionsCategories] : [],
            categoryHasFinalLLMResult: { ...(state.categoryHasFinalLLMResult || {}) },
            suggestionsErrorCategories: Array.from(state.suggestionsErrorCategories || []),
            scopedCategories: Array.from(state.scopedCategories || []),
            localSequentialActive: !!state.localSequentialActive,
            localSequentialStatusByCategory: { ...(state.localSequentialStatusByCategory || {}) },
            categoryHttpError: { ...(state.categoryHttpError || {}) },
            showRawJson: !!state.showRawJson,
            inlinePromptErrorText: state.inlinePromptErrorText || "",
            suggestionsManuallyCleared: !!state.suggestionsManuallyCleared,
        };
    }

    function renderLocalSequentialRowsFromState() {
        const categories = Array.isArray(state.suggestionsCategories)
            ? state.suggestionsCategories.filter((category) => typeof category === "string" && category.trim())
            : [];
        if (categories.length === 0) {
            setSuggestionText(state.suggestionText || "Results will appear here.");
            return;
        }

        // Ensure the rows container exists without wiping existing content.
        // Use a dedicated class so we never accidentally reuse the Quick Start
        // placeholder div (which is also a direct child div but has display:flex
        // without flex-direction:column, causing rows to lay out horizontally).
        let rowsContainer = suggestionsContent.querySelector(".dsp-ai-presets-rows-container");
        if (!rowsContainer) {
            suggestionsContent.innerHTML = `<div class="dsp-ai-presets-rows-container"></div>`;
            rowsContainer = suggestionsContent.querySelector(".dsp-ai-presets-rows-container");
        }

        categories.forEach((category) => {
            let row = getLocalSequentialRowElement(category);
            if (!row) {
                row = document.createElement("div");
                row.className = "dsp-ai-presets-suggestion-row";
                row.setAttribute("data-category", category);
                rowsContainer.appendChild(row);
            }
        });

        renderAllLocalSequentialRows();
    }

    function restoreModuleSnapshot() {
        const snapshot = aiPresetsModuleStateStore.snapshot;
        if (!snapshot) return false;

        promptInput.value = snapshot.prompt || "";
        if (promptClearBtn) promptClearBtn.classList.toggle("is-hidden", !promptInput.value);
        state.selectedProvider = snapshot.selectedProvider || "";
        state.selectedModel = snapshot.selectedModel || "";
        applyRequestTimeoutSeconds(snapshot.requestTimeoutSeconds, { persist: false });
        state.lastSelectedModelByProvider = { ...(snapshot.lastSelectedModelByProvider || {}) };
        state.suggestionText = snapshot.suggestionText || "Results will appear here.";
        state.stagedSelection = cloneSelection(snapshot.stagedSelection || {});
        state.stagedCandidates = cloneSnapshotCandidates(snapshot.stagedCandidates);
        state.stagedSkipSet = new Set(Array.isArray(snapshot.stagedSkipSet) ? snapshot.stagedSkipSet : []);
        state.suggestionsVisible = !!snapshot.suggestionsVisible;
        state.suggestionsModelName = snapshot.suggestionsModelName || "";
        state.suggestionsRawJson = snapshot.suggestionsRawJson || "";
        state.suggestionsWarnings = Array.isArray(snapshot.suggestionsWarnings) ? [...snapshot.suggestionsWarnings] : [];
        state.suggestionsNotes = Array.isArray(snapshot.suggestionsNotes) ? [...snapshot.suggestionsNotes] : [];
        state.suggestionsCategories = Array.isArray(snapshot.suggestionsCategories) ? [...snapshot.suggestionsCategories] : [];
        state.categoryHasFinalLLMResult = { ...(snapshot.categoryHasFinalLLMResult || {}) };
        state.suggestionsErrorCategories = new Set(
            Array.isArray(snapshot.suggestionsErrorCategories) ? snapshot.suggestionsErrorCategories : []
        );
        state.scopedCategories = new Set(Array.isArray(snapshot.scopedCategories) ? snapshot.scopedCategories : []);
        state.localSequentialActive = !!snapshot.localSequentialActive;
        state.localSequentialStatusByCategory = { ...(snapshot.localSequentialStatusByCategory || {}) };
        // Defense-in-depth: this function is only called when no work is running,
        // so no category should be in the "running" state.  A snapshot captured
        // mid-run (before the finally-block refresh) could contain stale "running"
        // entries that would otherwise produce a stuck blinking bullet on restore.
        if (!state.isGenerating) {
            Object.keys(state.localSequentialStatusByCategory).forEach((cat) => {
                if (state.localSequentialStatusByCategory[cat] === "running") {
                    const hasCandidates = Array.isArray(state.stagedCandidates[cat]) && state.stagedCandidates[cat].length > 0;
                    state.localSequentialStatusByCategory[cat] = hasCandidates ? "done" : "cancelled";
                }
            });
        }
        state.categoryHttpError = { ...(snapshot.categoryHttpError || {}) };
        Object.keys(state.categoryHttpError).forEach((category) => {
            state.categoryHttpError[category] = toChipStatusText(state.categoryHttpError[category]);
        });
        state.showRawJson = !!snapshot.showRawJson;
        state.inlinePromptErrorText = snapshot.inlinePromptErrorText || "";
        state.suggestionsManuallyCleared = !!snapshot.suggestionsManuallyCleared;

        populateModelSelect(state.selectedProvider || getProviderOptionIdForModel(state.selectedModel));
        renderCategoryList();
        updateSelectedCountBadge();
        updateGenerateButton();

        if (state.suggestionsVisible) {
            if (state.localSequentialActive) {
                renderLocalSequentialRowsFromState();
            } else {
                renderSuggestionCandidates(
                    state.suggestionsModelName || state.selectedModel || "",
                    state.stagedCandidates,
                    state.suggestionsWarnings,
                    state.suggestionsRawJson,
                    state.suggestionsNotes,
                    {
                        categories: state.suggestionsCategories,
                        errorCategories: Array.from(state.suggestionsErrorCategories),
                    }
                );
            }
        } else {
            setSuggestionText(state.suggestionText);
        }
        setInlinePromptError(state.inlinePromptErrorText);

        updateViewJsonButton();
        return true;
    }

    async function handleTabDeactivate() {
        // Allow background work (query/refine) to continue while on another tab.
        // Only capture the snapshot so re-activation can restore UI if needed.
        captureModuleSnapshot();
    }

    function isLatestRun(runId) {
        return runId === state.generateRunId;
    }

    function isLatestRefineRun(runId) {
        return runId === state.refineRunId;
    }

    function clearOmitEnableTimer() {
        if (state.omitEnableTimer) {
            clearTimeout(state.omitEnableTimer);
            state.omitEnableTimer = null;
        }
    }

    function hideOmitButton() {
        clearOmitEnableTimer();
        const activeCategory = state.activeCategory;
        state.omitEnabledRequestId = 0;
        if (state.localSequentialActive && activeCategory) {
            renderLocalSequentialSuggestionRow(activeCategory);
        }
    }

    function scheduleOmitButtonEnable(requestId) {
        hideOmitButton();
        if (!state.isGenerating || !state.isLocalQueryRun) return;
        if (state.localSequentialActive && state.activeCategory) {
            renderLocalSequentialSuggestionRow(state.activeCategory);
        }
        state.omitEnableTimer = setTimeout(() => {
            if (!state.isGenerating || !state.isLocalQueryRun) return;
            if (state.activeCategoryRequestId !== requestId) return;
            if (!state.activeCategoryAbortController) return;
            state.omitEnabledRequestId = requestId;
            if (state.localSequentialActive && state.activeCategory) {
                renderLocalSequentialSuggestionRow(state.activeCategory);
            }
        }, LOCAL_OMIT_ENABLE_DELAY_MS);
    }

    function beginCategoryRequest(category) {
        const requestId = state.nextCategoryRequestId++;
        state.activeCategory = category || "";
        state.activeCategoryRequestId = requestId;
        state.activeCategoryAbortController = new AbortController();

        const runSignal = state.abortController?.signal;
        if (runSignal) {
            const abortFromRun = () => state.activeCategoryAbortController?.abort();
            if (runSignal.aborted) {
                abortFromRun();
            } else {
                runSignal.addEventListener("abort", abortFromRun, { once: true });
                state.activeCategoryAbortCleanup = () => {
                    runSignal.removeEventListener("abort", abortFromRun);
                };
            }
        }

        if (state.isLocalQueryRun) {
            scheduleOmitButtonEnable(requestId);
        } else {
            hideOmitButton();
        }

        return {
            requestId,
            signal: state.activeCategoryAbortController.signal,
        };
    }

    function endCategoryRequest(requestId) {
        if (state.activeCategoryRequestId !== requestId) return;
        const activeCategory = state.activeCategory;
        clearOmitEnableTimer();
        if (typeof state.activeCategoryAbortCleanup === "function") {
            state.activeCategoryAbortCleanup();
        }
        state.activeCategoryAbortCleanup = null;
        state.activeCategoryAbortController = null;
        state.activeCategory = "";
        state.activeCategoryRequestId = 0;
        state.omitEnabledRequestId = 0;
        if (state.localSequentialActive && activeCategory) {
            renderLocalSequentialSuggestionRow(activeCategory);
        }
    }

    function markCurrentCategoryOmitted() {
        const requestId = state.activeCategoryRequestId;
        const category = state.activeCategory;
        if (!requestId || !category) return false;
        if (state.omittedCategoryRequestIds.has(requestId)) return true;
        state.omittedCategoryRequestIds.add(requestId);

        if (state.localSequentialActive && state.localSequentialStatusByCategory[category]) {
            setLocalSequentialCategoryStatus(category, "omitted");
        }
        const displayCategory = category.replace(/_/g, " ");
        tickerType(`Omitted ${displayCategory}. Moving on...`);

        if (state.activeCategoryAbortController && !state.activeCategoryAbortController.signal.aborted) {
            state.activeCategoryAbortController.abort();
        }
        hideOmitButton();
        return true;
    }

    function hasPendingRunQueueWork() {
        return state.runQueueIsRunning && state.runQueue.length > state.runQueueIndex;
    }

    function hasActiveRefineRequest() {
        return !!state.refineAbortController && !state.refineAbortController.signal.aborted;
    }

    function isRefineProcessActive() {
        if (state.batchRefineRunning) return true;
        if (state.refiningCategories.size > 0) return true;
        if (hasActiveRefineRequest()) return true;
        return false;
    }

    function hasInFlightLlmRequest() {
        const hasGenerateRequest = !!state.abortController && !state.abortController.signal.aborted;
        const hasCategoryRequest = !!state.activeCategoryAbortController && !state.activeCategoryAbortController.signal.aborted;
        const hasRefineRequest = hasActiveRefineRequest();
        return hasGenerateRequest || hasCategoryRequest || hasRefineRequest;
    }

    function beginBusyRequest() {
        state.busyRequestCount = Math.max(0, Number(state.busyRequestCount) || 0) + 1;
        updateTabActivityIndicator();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            state.busyRequestCount = Math.max(0, (Number(state.busyRequestCount) || 0) - 1);
            updateTabActivityIndicator();
        };
    }

    async function withBusyRequest(work) {
        const release = beginBusyRequest();
        try {
            return await work();
        } finally {
            release();
        }
    }

    function hasBusyIndicatorWork() {
        // Keep the top tab-bar pulse tied to actual LLM work only.
        // Lightweight local discovery/health requests (e.g. Ollama tags) should not drive global error visuals.
        return hasActiveWork();
    }

    function hasActiveWork() {
        if (state.batchRefineRunning) return true;
        if (state.isGenerating || state.runQueueIsRunning) return true;
        if (state.refiningCategories.size > 0) return true;
        if (hasPendingRunQueueWork()) return true;
        if (hasInFlightLlmRequest()) return true;
        return false;
    }

    function cancelActiveRefineProcess() {
        if (!isRefineProcessActive()) return false;

        const hadActiveRefineRequest = hasActiveRefineRequest();
        if (state.batchRefineRunning) {
            state.batchRefineRunning = false;
        }

        if (hadActiveRefineRequest) {
            state.refineAbortController.abort();
        } else {
            stopStatusTimer();
            updateStatusBar("cancelled", { duration: 0 });
            tickerType(t("ai_styler.statusbar.cancelled"));
            if (state.localSequentialActive) {
                Object.keys(state.localSequentialStatusByCategory || {}).forEach((category) => {
                    const categoryStatus = state.localSequentialStatusByCategory[category];
                    if (categoryStatus === "queued" || categoryStatus === "running") {
                        state.localSequentialStatusByCategory[category] = "cancelled";
                    }
                });
                renderAllLocalSequentialRows();
            }
            state.refiningCategories.clear();
        }

        state.pendingSidebarSync = false;
        updateViewJsonButton();
        updateTabActivityIndicator();
        updateGenerateButton();
        return true;
    }

    async function cancelActiveWorkForClose() {
        if (!hasActiveWork()) return false;

        // Invalidate in-flight results so late replies cannot mutate state/UI after cancel.
        state.generateRunId += 1;
        state.refineRunId += 1;

        invalidateLocalSequentialChipRendering();
        stopSidebarChipTypingForCurrentRun();

        if (state.abortController && !state.abortController.signal.aborted) {
            state.abortController.abort();
        }
        if (state.activeCategoryAbortController && !state.activeCategoryAbortController.signal.aborted) {
            state.activeCategoryAbortController.abort();
        }
        if (state.refineAbortController && !state.refineAbortController.signal.aborted) {
            state.refineAbortController.abort();
        }
        if (typeof state.activeCategoryAbortCleanup === "function") {
            state.activeCategoryAbortCleanup();
        }

        state.abortController = null;
        state.refineAbortController = null;
        state.isGenerating = false;
        state.isLocalQueryRun = false;
        state.batchRefineRunning = false;
        state.activeCategory = "";
        state.activeCategoryRequestId = 0;
        state.activeCategoryAbortController = null;
        state.activeCategoryAbortCleanup = null;
        state.omittedCategoryRequestIds.clear();
        state.runQueue = [];
        state.runQueueIndex = 0;
        setRunQueueIsRunning(false);
        hideOmitButton();

        state.refiningCategories.clear();
        if (state.localSequentialActive) {
            Object.keys(state.localSequentialStatusByCategory || {}).forEach((category) => {
                const categoryStatus = state.localSequentialStatusByCategory[category];
                if (categoryStatus === "queued" || categoryStatus === "running") {
                    state.localSequentialStatusByCategory[category] = "cancelled";
                }
            });
            renderAllLocalSequentialRows();
        } else if (state.suggestionsVisible) {
            renderSuggestionCandidates(
                state.suggestionsModelName,
                state.stagedCandidates,
                state.suggestionsWarnings,
                state.suggestionsRawJson,
                state.suggestionsNotes,
                {
                    categories: state.suggestionsCategories,
                    errorCategories: Array.from(state.suggestionsErrorCategories),
                }
            );
        }

        stopStatusTimer();
        const duration = state.requestStartTime
            ? Math.max(0, Math.round(performance.now() - state.requestStartTime))
            : 0;
        state.requestStartTime = null;
        updateStatusBar("cancelled", { duration });
        tickerType("Cancelled");
        updateGenerateButton();
        await Promise.resolve();
        return true;
    }

    function ensureStatusBarLayout() {
        if (!statusBar) return {};
        let wrapper = statusBar.querySelector(".dsp-ai-presets-status-bar-text");
        if (!wrapper) {
            // Remove bare text nodes left from initial HTML
            Array.from(statusBar.childNodes).forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) node.remove();
            });
            wrapper = document.createElement("span");
            wrapper.className = "dsp-ai-presets-status-bar-text";

            // Left: status bullet + typed status text (flex: 1, truncates)
            const left = document.createElement("span");
            left.className = "dsp-ai-presets-status-bar-left";

            const bullet = document.createElement("span");
            bullet.className = "dsp-ai-presets-local-status-icon dsp-ai-presets-status-bullet dsp-ai-presets-status-bullet--neutral dsp-ai-presets-status-bar-bullet is-hidden";
            bullet.setAttribute("aria-hidden", "true");

            const typed = document.createElement("span");
            typed.className = "dsp-ai-presets-status-bar-typed";

            // Middle-right: static model/provider cluster
            const model = document.createElement("span");
            model.className = "dsp-ai-presets-status-bar-model";

            // Far-right: timer
            const timer = document.createElement("span");
            timer.className = "dsp-ai-presets-status-bar-timer";

            left.appendChild(bullet);
            left.appendChild(typed);
            wrapper.appendChild(left);
            wrapper.appendChild(model);
            wrapper.appendChild(timer);
            statusBar.appendChild(wrapper);
        }
        return {
            bullet: wrapper.querySelector(".dsp-ai-presets-status-bar-bullet"),
            typed: wrapper.querySelector(".dsp-ai-presets-status-bar-typed"),
            model: wrapper.querySelector(".dsp-ai-presets-status-bar-model"),
            timer: wrapper.querySelector(".dsp-ai-presets-status-bar-timer"),
        };
    }

    /* -- Ticker / typewriter utility -- */
    const ticker = {
        token: 0,
        intervalId: null,
        charDelayMs: 10,
    };

    function tickerCancel() {
        ticker.token += 1;
        if (ticker.intervalId !== null) {
            clearInterval(ticker.intervalId);
            ticker.intervalId = null;
        }
    }

    function sanitizeStatusBarText(text) {
        return String(text || "")
            .replace(/\u2026/g, "...")
            .replace(/[\u2013\u2014]/g, "-")
            .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
            .replace(/!/g, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    function tickerType(text, { extraClass = "" } = {}) {
        return new Promise((resolve) => {
            tickerCancel();
            const { typed } = ensureStatusBarLayout();
            if (!typed) { resolve(); return; }
            typed.classList.remove("dsp-ai-presets-status-bar-typed--ratelimit");
            if (extraClass) typed.classList.add(extraClass);
            typed.textContent = "";
            const sanitized = sanitizeStatusBarText(text);
            if (!sanitized) { resolve(); return; }
            const myToken = ticker.token;
            let idx = 0;
            ticker.intervalId = setInterval(() => {
                if (ticker.token !== myToken) { resolve(); return; }
                typed.textContent += sanitized[idx];
                idx += 1;
                if (idx >= sanitized.length) {
                    clearInterval(ticker.intervalId);
                    ticker.intervalId = null;
                    resolve();
                }
            }, ticker.charDelayMs);
        });
    }

    function tickerClear() {
        tickerCancel();
        const { typed } = ensureStatusBarLayout();
        if (typed) typed.textContent = "";
    }

    function setStatusBarProgress(percent) {
        if (!statusBar) return;
        const fill = statusBar.querySelector(".dsp-ai-presets-status-bar-fill");
        if (fill) {
            const clampedPercent = Math.max(0, Math.min(100, percent));
            fill.style.width = `${clampedPercent}%`;
            fill.style.borderRadius = clampedPercent >= 100 ? "4px" : "4px 0 0 4px";
        }
    }

    function buildStatusSummary() {
        const q = state.completedCount;
        const r = state.withResultsCount;
        const f = state.failedCount;
        if (q === 0) return "";
        let summary = t("ai_styler.statusbar.summary", { queried: q, with_results: r });
        if (f > 0) summary += t("ai_styler.statusbar.summary_failed", { failed: f });
        return summary;
    }

    function setStatusBarTheme(theme) {
        if (!statusBar) return;
        statusBar.classList.remove("dsp-ai-presets-statusbar--running", "dsp-ai-presets-statusbar--ok", "dsp-ai-presets-statusbar--warn", "dsp-ai-presets-statusbar--error");
        if (theme === "running") statusBar.classList.add("dsp-ai-presets-statusbar--running");
        if (theme === "ok") statusBar.classList.add("dsp-ai-presets-statusbar--ok");
        if (theme === "warn") statusBar.classList.add("dsp-ai-presets-statusbar--warn");
        else if (theme === "error") statusBar.classList.add("dsp-ai-presets-statusbar--error");
    }

    function setStatusBarBulletState({ visible, variant, pulsing, title = "" }) {
        const { bullet } = ensureStatusBarLayout();
        if (!bullet) return;
        bullet.classList.toggle("is-hidden", !visible);
        bullet.classList.remove(
            "dsp-ai-presets-status-bullet--running",
            "dsp-ai-presets-status-bullet--success",
            "dsp-ai-presets-status-bullet--neutral",
            "dsp-ai-presets-status-bullet--warn",
            "dsp-ai-presets-status-bullet--error",
            "dsp-ai-presets-status-bullet--ratelimit",
            "is-pulsing",
        );
        bullet.classList.add(`dsp-ai-presets-status-bullet--${variant}`);
        if (pulsing) bullet.classList.add("is-pulsing");
        if (title) bullet.title = title;
        else bullet.removeAttribute("title");
    }

    function setStatusBarRunning(running) {
        if (running) {
            setStatusBarBulletState({ visible: true, variant: "running", pulsing: true, title: t("ai_styler.statusbar.running") });
            return;
        }
        setStatusBarBulletState({ visible: false, variant: "neutral", pulsing: false });
    }

    function setStatusBarModelText() {
        const { model: modelEl } = ensureStatusBarLayout();
        if (!modelEl) return;
        const modelName = state.lastRequestModel || t("ai_styler.statusbar.model_none");
        modelEl.textContent = modelName;
    }

    function updateStatusBar(status, details = {}) {
        if (!statusBar) return;

        const { timer } = ensureStatusBarLayout();
        setStatusBarModelText();

        const summary = buildStatusSummary();
        const summaryPart = summary ? ` \u2014 ${summary}` : "";

        switch (status) {
            case "idle":
            case "ready":
                setStatusBarTheme("neutral");
                setStatusBarRunning(false);
                tickerType(t("ai_styler.statusbar.ready") + summaryPart);
                if (timer) timer.textContent = "";
                break;
            case "running": {
                const elapsed = details.elapsed || "0.0";
                setStatusBarTheme("running");
                setStatusBarRunning(true);
                // Don't retype left - the ticker manages it during the run
                if (timer) timer.textContent = `${elapsed}s`;
                break;
            }
            case "success": {
                const duration = (Number(details.duration) / 1000).toFixed(1);
                setStatusBarTheme("ok");
                setStatusBarBulletState({ visible: true, variant: "success", pulsing: false, title: t("ai_styler.statusbar.done") });
                setStatusBarProgress(100);
                if (timer) timer.textContent = `${duration}s`;
                break;
            }
            case "cancelled": {
                const cancelTime = (Number(details.duration) / 1000).toFixed(1);
                setStatusBarTheme("error");
                setStatusBarBulletState({ visible: true, variant: "error", pulsing: false, title: t("ai_styler.statusbar.cancelled") });
                setStatusBarProgress(100);
                if (timer) timer.textContent = `${cancelTime}s`;
                break;
            }
            case "error": {
                const errorTime = (Number(details.duration) / 1000).toFixed(1);
                setStatusBarTheme("error");
                setStatusBarBulletState({ visible: true, variant: "error", pulsing: false, title: t("ai_styler.statusbar.error") });
                setStatusBarProgress(100);
                if (timer) timer.textContent = `${errorTime}s`;
                break;
            }
            default:
                setStatusBarTheme("neutral");
                setStatusBarRunning(false);
                tickerType(t("ai_styler.statusbar.ready"));
                if (timer) timer.textContent = "";
        }
    }

    function startStatusTimer() {
        // Clear any existing timer
        if (state.statusTimerInterval) {
            clearInterval(state.statusTimerInterval);
            state.statusTimerInterval = null;
        }

        updateViewJsonButton();

        state.requestStartTime = performance.now();

        // Set initial state
        updateStatusBar("running", { elapsed: "0.0" });

        // Only update the timer span every 100ms (don't re-type left side)
        state.statusTimerInterval = setInterval(() => {
            if (state.requestStartTime) {
                const elapsed = ((performance.now() - state.requestStartTime) / 1000).toFixed(1);
                const { timer } = ensureStatusBarLayout();
                if (timer) timer.textContent = `${elapsed}s`;
            }
        }, 100);
    }

    function stopStatusTimer() {
        if (state.statusTimerInterval) {
            clearInterval(state.statusTimerInterval);
            state.statusTimerInterval = null;
        }
        updateViewJsonButton();
    }

    function resetGenerateSession() {
        invalidateLocalSequentialChipRendering();
        stopSidebarChipTypingForCurrentRun();
        // Reset run-level control state only.
        // IMPORTANT: Never clear stagedCandidates, suggestionsCategories,
        // suggestionsVisible, localSequentialStatusByCategory, or
        // suggestionsContent — Suggestions must remain persistent.
        state.stagedSkipSet.clear();
        state.sidebarLoadingCategories.clear();
        state.suggestionsWarnings = [];
        state.suggestionsNotes = [];
        state.suggestionsRawJson = "";
        state.suggestionsErrorCategories = new Set();
        state.progressTotal = 0;
        state.progressDone = 0;
        state.completedCount = 0;
        state.withResultsCount = 0;
        state.failedCount = 0;
        state.categoryHttpError = {};
        state.runQueue = [];
        state.runQueueIndex = 0;
        setRunQueueIsRunning(false);
        state.runAllowedStyles = null;
        state.isLocalQueryRun = false;
        state.batchRefineRunning = false;
        state.refineAbortController = null;
        state.refiningCategories.clear();
        state.activeCategory = "";
        state.activeCategoryRequestId = 0;
        state.activeCategoryAbortController = null;
        state.activeCategoryAbortCleanup = null;
        state.omittedCategoryRequestIds.clear();
        setStatusBarProgress(0);
        setStatusBarRunning(false);
        tickerClear();
        setInlinePromptError("");
        hideOmitButton();
        updateViewJsonButton();

        renderFromStaged();
    }

    function setInlinePromptError(text) {
        const nextText = String(text || "").trim();
        state.inlinePromptErrorText = nextText;
        updateSetupNotices();
    }

    function shouldShowOllamaRecommendedModelWarning() {
        const selectedProviderId = String(
            state.selectedProvider
            || providerSelect.value
            || getProviderOptionIdForModel(state.selectedModel)
            || ""
        ).trim();
        if (selectedProviderId !== "ollama_local") return false;
        const selectedModelId = String(state.selectedModel || modelSelect.value || "").trim();
        if (!selectedModelId) return false;
        return selectedModelId.toLowerCase() !== String(RECOMMENDED_LOCAL_MODEL).toLowerCase();
    }

    function updateSetupNotices() {
        const nextText = String(state.inlinePromptErrorText || "").trim();
        if (nextText) {
            inlineErrorLabel.textContent = nextText;
            inlineErrorLabel.classList.remove("is-hidden");
        } else {
            inlineErrorLabel.textContent = "";
            inlineErrorLabel.classList.add("is-hidden");
        }

        if (shouldShowOllamaRecommendedModelWarning()) {
            inlineWarningLabel.classList.remove("is-hidden");
        } else {
            inlineWarningLabel.classList.add("is-hidden");
        }
    }

    function getLlmErrorStatusCode(err) {
        const numericStatus = Number(err?.status);
        if (Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599) {
            return numericStatus;
        }
        const rawMessage = typeof err?.message === "string" ? err.message : String(err || "");
        const match = rawMessage.match(/\bHTTP\s+(\d{3})\b/i);
        return match ? Number(match[1]) : null;
    }

    function sleepWithAbortSignal(ms, signal) {
        if (!signal) return sleep(ms);
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                const abortErr = new Error("Aborted");
                abortErr.name = "AbortError";
                reject(abortErr);
                return;
            }

            let timerId = 0;
            const onAbort = () => {
                clearTimeout(timerId);
                signal.removeEventListener("abort", onAbort);
                const abortErr = new Error("Aborted");
                abortErr.name = "AbortError";
                reject(abortErr);
            };
            signal.addEventListener("abort", onAbort, { once: true });
            timerId = setTimeout(() => {
                signal.removeEventListener("abort", onAbort);
                resolve();
            }, ms);
        });
    }

    function createAbortError() {
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        return abortErr;
    }

    function waitForPromiseWithAbortSignal(promise, signal) {
        if (!signal) return promise;
        if (signal.aborted) {
            return Promise.reject(createAbortError());
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                signal.removeEventListener("abort", onAbort);
                reject(createAbortError());
            };
            signal.addEventListener("abort", onAbort, { once: true });
            Promise.resolve(promise)
                .then((value) => {
                    signal.removeEventListener("abort", onAbort);
                    resolve(value);
                })
                .catch((err) => {
                    signal.removeEventListener("abort", onAbort);
                    reject(err);
                });
        });
    }

    function getRateLimitGateWaitMs() {
        const untilMs = Number(state.llmRateLimitGateUntilMs) || 0;
        if (!untilMs) return 0;
        return Math.max(0, untilMs - Date.now());
    }

    async function waitForGlobalRateLimitGate(signal) {
        const waitMs = getRateLimitGateWaitMs();
        if (waitMs <= 0) return;
        await sleepWithAbortSignal(waitMs, signal);
    }

    function extendGlobalRateLimitGate(waitSeconds) {
        const safeSeconds = Number.isFinite(Number(waitSeconds))
            ? Math.max(0, Number(waitSeconds))
            : 0;
        const waitMs = Math.ceil(safeSeconds * 1000);
        if (waitMs <= 0) return 0;
        const candidateUntilMs = Date.now() + waitMs;
        if (candidateUntilMs > (Number(state.llmRateLimitGateUntilMs) || 0)) {
            state.llmRateLimitGateUntilMs = candidateUntilMs;
        }
        return getRateLimitGateWaitMs();
    }

    async function runSerialLlmRequest(task, signal) {
        const previous = state.llmRequestInFlightPromise || Promise.resolve();
        let releaseCurrent = () => {};
        const current = new Promise((resolve) => {
            releaseCurrent = resolve;
        });
        state.llmRequestInFlightPromise = current;
        try {
            await waitForPromiseWithAbortSignal(previous, signal);
            await waitForGlobalRateLimitGate(signal);
            return await task();
        } finally {
            releaseCurrent();
            if (state.llmRequestInFlightPromise === current) {
                state.llmRequestInFlightPromise = null;
            }
        }
    }

    async function requestLlmCategoryWithGlobalBackoff({
        provider,
        model,
        messages,
        apiKey,
        timeoutMs,
        signal,
        maxAttempts = RETRY_MAX_ATTEMPTS,
        onRateLimited,
        onRateLimitWaitComplete,
    } = {}) {
        const cappedAttempts = Number.isFinite(Number(maxAttempts))
            ? Math.max(1, Math.floor(Number(maxAttempts)))
            : RETRY_MAX_ATTEMPTS;
        let pendingRateLimitWaitReset = false;

        for (let attempt = 0; attempt < cappedAttempts; attempt += 1) {
            const nextSendAt = new Date().toISOString();
            const requestResult = await runSerialLlmRequest(
                () => {
                    if (pendingRateLimitWaitReset && typeof onRateLimitWaitComplete === "function") {
                        onRateLimitWaitComplete({
                            attempt,
                            maxAttempts: cappedAttempts,
                        });
                    }
                    pendingRateLimitWaitReset = false;
                    return requestLLMWithRetry({
                        provider,
                        model,
                        messages,
                        apiKey,
                        timeoutMs,
                        signal,
                        maxAttempts: 1,
                    });
                },
                signal,
            );

            if (requestResult.ok) {
                return requestResult;
            }

            const statusCode = getLlmErrorStatusCode(requestResult.error);
            const hasRemainingAttempts = attempt < cappedAttempts - 1;
            if (statusCode !== 429 || !hasRemainingAttempts) {
                return requestResult;
            }

            const isGroqProvider = String(provider || "").trim().toLowerCase() === "groq";
            const bodyRetryAfterMs = Number.isFinite(requestResult.error?.retryAfterBodyMs)
                ? Math.max(0, requestResult.error.retryAfterBodyMs)
                : null;
            const waitSeconds = isGroqProvider && bodyRetryAfterMs !== null
                ? (bodyRetryAfterMs / 1000) + RATE_LIMIT_RETRY_SAFETY_SECONDS
                : RATE_LIMIT_FALLBACK_SECONDS;
            const waitMs = extendGlobalRateLimitGate(waitSeconds);
            const effectiveWaitSeconds = waitMs / 1000;
            const nextAllowedAt = new Date(Date.now() + waitMs).toISOString();

            if (typeof onRateLimited === "function") {
                await onRateLimited({
                    attempt,
                    nextAttempt: attempt + 1,
                    maxAttempts: cappedAttempts,
                    error: requestResult.error,
                    delayMs: waitMs,
                    waitSeconds: effectiveWaitSeconds,
                });
            }
            pendingRateLimitWaitReset = true;
        }

        return {
            ok: false,
            reason: "error",
            error: new Error("Exhausted retry attempts"),
            attemptsUsed: cappedAttempts,
            errorLabel: "HTTP err",
        };
    }

    function toChipStatusText(text) {
        const raw = String(text || "").trim();
        if (!raw) return t("ai_styler.chip_status.network_error");
        if (/^cancelled$/i.test(raw)) return t("ai_styler.chip_status.cancelled");
        const match = raw.match(/\bHTTP\s+(\d{3})\b/i) || raw.match(/\b(\d{3})\b/);
        if (match) return t("ai_styler.chip_status.http_error", { code: match[1] });
        return t("ai_styler.chip_status.network_error");
    }

    function normalizeLlmRequestFailure(err, { provider = "ollama", modelName = "", fallbackInlineText = "" } = {}) {
        const statusCode = getLlmErrorStatusCode(err);
        const statusTextForChip = statusCode ? toChipStatusText(`HTTP ${statusCode}`) : t("ai_styler.chip_status.network_error");
        const modelLabel = String(modelName || "").trim() || "(model)";

        let inlineErrorText = "";
        if (typeof err?.detail === "string" && err.detail.trim()) {
            inlineErrorText = err.detail.trim();
        } else if (typeof err?.message === "string" && err.message.trim()) {
            inlineErrorText = err.message.trim().replace(/^HTTP\s+\d{3}\s*:\s*/i, "");
        } else if (fallbackInlineText) {
            inlineErrorText = String(fallbackInlineText).trim();
        }

        if (!inlineErrorText || /^HTTP\s+\d{3}$/i.test(inlineErrorText)) {
            inlineErrorText = normalizeConnectivityError(err, provider);
        }

        return {
            statusTextForChip,
            inlineErrorText: inlineErrorText || statusTextForChip,
            toastText: `${modelLabel}: ${statusTextForChip}`,
        };
    }

    function reportLlmRequestFailure(err, {
        provider = "ollama",
        modelName = "",
        fallbackInlineText = "",
        toastSummary = t("ai_styler.toast.query_success.title"),
    } = {}) {
        const normalized = normalizeLlmRequestFailure(err, { provider, modelName, fallbackInlineText });
        setInlinePromptError(normalized.inlineErrorText);
        showToast("error", toastSummary, normalized.toastText, 6000);
        return normalized;
    }

    function setSuggestionText(text) {
        state.suggestionText = text || "Results will appear here.";

        // Never overwrite suggestionsContent when suggestions are visible —
        // that would destroy persistent suggestion rows.
        if (state.suggestionsVisible) return;

        // If generating, show loading spinner (cancel is handled by the Generate->Cancel button)
        if (state.isGenerating) {
            suggestionsContent.innerHTML = `
                <div class="dsp-ai-presets-loading-panel">
                    <div class="dsp-ai-presets-loading-spinner"></div>
                    <div class="dsp-ai-presets-loading-text">${t("ai_styler.suggestions.loading")}</div>
                </div>
            `;
        } else if (isDefaultSuggestionsPlaceholderText(state.suggestionText)) {
            suggestionsContent.innerHTML = buildSuggestionsQuickStartHtml();
        } else {
            suggestionsContent.innerHTML = `<div>${escapeHtml(state.suggestionText)}</div>`;
        }
    }

    function syncSuggestionsEmptyState() {
        const hasRenderedRows = !!suggestionsContent.querySelector(".dsp-ai-presets-suggestion-row[data-category]");
        const hasScopedCategories = state.scopedCategories instanceof Set && state.scopedCategories.size > 0;
        if (hasRenderedRows || hasScopedCategories) return;

        state.suggestionsVisible = false;
        suggestionsContent.innerHTML = buildSuggestionsQuickStartHtml();
    }

    function validatePrompt() {
        const value = (promptInput.value || "").trim();
        if (!value) {
            showToast("warn", t("ai_styler.toast.prompt_required.title"), t("ai_styler.toast.prompt_required.body"));
            return null;
        }
        return value;
    }

    function normalizeRequestTimeoutSeconds(value) {
        const parsed = Number.parseInt(String(value ?? "").trim(), 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return DEFAULT_REQUEST_TIMEOUT_SECONDS;
        }
        return parsed;
    }

    function applyRequestTimeoutSeconds(value, { persist = true } = {}) {
        const normalized = normalizeRequestTimeoutSeconds(value);
        state.requestTimeoutSeconds = normalized;
        const normalizedText = String(normalized);
        if (timeoutInput.value !== normalizedText) {
            timeoutInput.value = normalizedText;
        }
        if (persist) {
            setPersistedSetting(PERSIST_KEY_REQUEST_TIMEOUT_SECONDS, normalized);
        }
        return normalized;
    }

    function getCurrentRequestTimeoutSecondsSnapshot() {
        return applyRequestTimeoutSeconds(timeoutInput.value, { persist: true });
    }

    function getCurrentRequestTimeoutMsSnapshot() {
        return getCurrentRequestTimeoutSecondsSnapshot() * 1000;
    }

    function getCurrentModelSnapshot() {
        const liveModel = (modelSelect?.value || "").trim();
        if (state.selectedModel !== liveModel) {
            state.selectedModel = liveModel;
        }
        if (state.selectedModel) {
            const providerOption = getProviderOptionIdForModel(state.selectedModel);
            if (providerOption) {
                state.selectedProvider = providerOption;
                state.lastSelectedModelByProvider[providerOption] = state.selectedModel;
            }
        }
        return state.selectedModel || "";
    }

    function getCurrentProviderOptionSnapshot(modelName = null) {
        const liveProvider = String(providerSelect?.value || "").trim();
        if (liveProvider) {
            state.selectedProvider = liveProvider;
            return liveProvider;
        }
        const resolvedModel = modelName == null ? getCurrentModelSnapshot() : String(modelName || "").trim();
        const providerOption = getProviderOptionIdForModel(resolvedModel);
        if (providerOption) {
            state.selectedProvider = providerOption;
            return providerOption;
        }
        return String(state.selectedProvider || "").trim();
    }

    function persistLastUsedProviderModel(providerOptionId = "", modelId = "") {
        const normalizedModelId = String(modelId || "").trim();
        let normalizedProviderId = String(providerOptionId || "").trim();
        if (!normalizedProviderId && normalizedModelId) {
            normalizedProviderId = getProviderOptionIdForModel(normalizedModelId);
        }
        if (!normalizedProviderId && !normalizedModelId) return;

        if (normalizedProviderId) {
            state.selectedProvider = normalizedProviderId;
            setPersistedSetting(PERSIST_KEY_PROVIDER, normalizedProviderId);
        }
        if (normalizedModelId) {
            state.selectedModel = normalizedModelId;
            setPersistedSetting(PERSIST_KEY_MODEL, normalizedModelId);
        }
        if (normalizedProviderId && normalizedModelId) {
            state.lastSelectedModelByProvider[normalizedProviderId] = normalizedModelId;
            setPersistedJSON(PERSIST_KEY_MODEL_BY_PROVIDER, state.lastSelectedModelByProvider);
            if (normalizedProviderId === "huggingface" && !isHuggingFaceCustomModelOption(normalizedModelId)) {
                state.lastHuggingFaceNonCustomModel = normalizedModelId;
            }
        }
    }

    function getCurrentProviderSnapshot(modelName = null) {
        const resolvedModel = modelName == null ? getCurrentModelSnapshot() : String(modelName || "").trim();
        if (resolvedModel) {
            return getModelProvider(resolvedModel);
        }
        const selectedProviderId = String(state.selectedProvider || providerSelect?.value || "").trim();
        return getApiProviderForProviderOption(selectedProviderId);
    }

    function isOllamaLocalProviderTarget(providerOptionId = "", modelName = "") {
        const resolvedProviderOptionId = String(providerOptionId || "").trim();
        if (resolvedProviderOptionId) {
            return resolvedProviderOptionId === "ollama_local" || resolvedProviderOptionId === "ollama_cloud";
        }
        const resolvedModelName = String(modelName || "").trim();
        if (resolvedModelName) {
            const providerFromModel = getProviderOptionIdForModel(resolvedModelName);
            return providerFromModel === "ollama_local" || providerFromModel === "ollama_cloud";
        }
        const currentProvider = getCurrentProviderOptionSnapshot(resolvedModelName);
        return currentProvider === "ollama_local" || currentProvider === "ollama_cloud";
    }

    function ensureOllamaLocalRunning({ providerOptionId = "", modelName = "", notify = true } = {}) {
        if (!isOllamaLocalProviderTarget(providerOptionId, modelName)) {
            return true;
        }
        if (state.connected) {
            return true;
        }
        if (notify) {
            const now = Date.now();
            if (now >= state.ollamaOfflineToastUntil) {
                state.ollamaOfflineToastUntil = now + 800;
                showToast("error", t("ai_styler.toast.ollama_offline.title"), t("ai_styler.toast.ollama_offline.body"));
            }
        }
        return false;
    }

    setOllamaRequestPreflight(({ model, provider } = {}) => {
        const providerOptionId = provider === "ollama" ? "ollama_local" : "";
        return ensureOllamaLocalRunning({ providerOptionId, modelName: model, notify: true });
    });

    function getCurrentOpenAIApiKeySnapshot() {
        const liveKey = (openaiKeyInput?.value || "").trim();
        if (state.openaiApiKey !== liveKey) {
            state.openaiApiKey = liveKey;
        }
        return liveKey;
    }

    function getCurrentAnthropicApiKeySnapshot() {
        const liveKey = (anthropicKeyInput?.value || "").trim();
        if (state.anthropicApiKey !== liveKey) {
            state.anthropicApiKey = liveKey;
        }
        return liveKey;
    }

    function getCurrentGroqApiKeySnapshot() {
        const liveKey = (groqKeyInput?.value || "").trim();
        if (state.groqApiKey !== liveKey) {
            state.groqApiKey = liveKey;
        }
        return liveKey;
    }

    function getCurrentGeminiApiKeySnapshot() {
        const liveKey = (geminiKeyInput?.value || "").trim();
        if (state.geminiApiKey !== liveKey) {
            state.geminiApiKey = liveKey;
        }
        return liveKey;
    }

    function getCurrentHuggingFaceTokenSnapshot() {
        const liveToken = (hfTokenInput?.value || "").trim();
        if (state.huggingFaceToken !== liveToken) {
            state.huggingFaceToken = liveToken;
        }
        return liveToken;
    }

    function getCurrentOpenRouterApiKeySnapshot() {
        const liveKey = (openrouterKeyInput?.value || "").trim();
        if (state.openrouterApiKey !== liveKey) {
            state.openrouterApiKey = liveKey;
        }
        return liveKey;
    }

    function getCurrentHuggingFaceCustomModelSnapshot() {
        const liveModelId = String(state.huggingFaceCustomModelId || "").trim();
        if (state.huggingFaceCustomModelId !== liveModelId) {
            state.huggingFaceCustomModelId = liveModelId;
        }
        return liveModelId;
    }

    function getHuggingFaceCustomModelOptionLabel() {
        const value = getCurrentHuggingFaceCustomModelSnapshot();
        return t("ai_styler.huggingface.custom_model.label", { model: value || "not set" });
    }

    function resolveHuggingFaceRequestModel(defaultModelName = "") {
        const selectedModel = String(defaultModelName || "").trim();
        if (isHuggingFaceCustomModelOption(selectedModel)) {
            return getCurrentHuggingFaceCustomModelSnapshot();
        }
        return selectedModel;
    }

    function getProviderApiKeySnapshot(provider) {
        if (provider === "openai") return getCurrentOpenAIApiKeySnapshot();
        if (provider === "anthropic") return getCurrentAnthropicApiKeySnapshot();
        if (provider === "groq") return getCurrentGroqApiKeySnapshot();
        if (provider === "gemini") return getCurrentGeminiApiKeySnapshot();
        if (provider === "huggingface") return getCurrentHuggingFaceTokenSnapshot();
        if (provider === "openrouter") return getCurrentOpenRouterApiKeySnapshot();
        return "";
    }

    function isCloudApiProvider(provider) {
        return provider === "openai" || provider === "anthropic" || provider === "groq" || provider === "gemini" || provider === "huggingface" || provider === "openrouter";
    }

    function isOllamaProviderOption(providerOptionId) {
        return providerOptionId === "ollama_local" || providerOptionId === "ollama_cloud";
    }

    function getProviderHelperLink(providerOptionId) {
        if (isOllamaProviderOption(providerOptionId)) {
            return OLLAMA_DOWNLOAD_URL;
        }
        const apiProvider = getApiProviderForProviderOption(providerOptionId);
        return PROVIDER_API_KEY_URLS[apiProvider] || "";
    }

    function getProviderKeyUiHost(provider) {
        if (provider === "openai") {
            return { wrap: openaiKeyWrap, row: openaiKeyRow, auxButton: openaiTestBtn };
        }
        if (provider === "anthropic") {
            return { wrap: anthropicKeyWrap, row: anthropicKeyRow, auxButton: anthropicTestBtn };
        }
        if (provider === "groq") {
            return { wrap: groqKeyWrap, row: groqKeyRow, auxButton: groqTestBtn };
        }
        if (provider === "gemini") {
            return { wrap: geminiKeyWrap, row: geminiKeyRow, auxButton: geminiTestBtn };
        }
        if (provider === "huggingface") {
            return { wrap: hfWrap, row: hfTokenRow, auxButton: hfTestBtn };
        }
        if (provider === "openrouter") {
            return { wrap: openrouterKeyWrap, row: openrouterKeyRow, auxButton: openrouterTestBtn };
        }
        return null;
    }

    function updateProviderHelperButton() {
        const providerOptionId = String(state.selectedProvider || providerSelect.value || getProviderOptionIdForModel(state.selectedModel) || "").trim();
        const activeApiProvider = getApiProviderForProviderOption(providerOptionId);
        const helperUrl = getProviderHelperLink(providerOptionId);
        if (providerOptionId === "coming_soon" || !helperUrl) {
            getOllamaBtn.classList.add("is-hidden");
            providerHelperWrap.classList.add("is-hidden");
            return;
        }

        const ollamaSelected = isOllamaProviderOption(providerOptionId);
        getOllamaBtn.classList.toggle("is-hidden", !ollamaSelected);

        if (ollamaSelected) {
            providerHelperWrap.classList.add("is-hidden");
            return;
        }

        const keyHost = getProviderKeyUiHost(activeApiProvider);
        if (!keyHost?.wrap) {
            providerHelperWrap.classList.add("is-hidden");
            return;
        }

        getApiKeyBtn.textContent = t("ai_styler.btn.get_api_key.label");
        getApiKeyBtn.title = t("ai_styler.btn.get_api_key.title");
        getApiKeyBtn.setAttribute("aria-label", t("ai_styler.btn.get_api_key.label"));
        const saveTokenLabel = t("ai_styler.actions.save_token_browser");
        saveTokenBtn.textContent = saveTokenLabel;
        saveTokenBtn.title = saveTokenLabel;
        saveTokenBtn.setAttribute("aria-label", saveTokenLabel);

        [openaiKeyRow, anthropicKeyRow, groqKeyRow, geminiKeyRow, hfTokenRow, openrouterKeyRow].forEach((row, index) => {
            const buttons = [openaiTestBtn, anthropicTestBtn, groqTestBtn, geminiTestBtn, hfTestBtn, openrouterTestBtn];
            const button = buttons[index];
            if (row && button && button.parentElement !== row) {
                row.appendChild(button);
            }
        });

        // Insert the helper button into the label row so it sits on the same
        // horizontal line as the "{Provider} API Key" label.
        const labelRow = keyHost.wrap.querySelector(".dsp-ai-presets-key-label-row");
        if (labelRow) {
            labelRow.appendChild(providerHelperWrap);
        } else {
            keyHost.wrap.insertBefore(providerHelperWrap, keyHost.row || keyHost.wrap.firstChild);
        }
        providerHelperWrap.classList.remove("is-hidden");

        if (getApiKeyBtn.parentElement !== providerHelperWrap) {
            providerHelperWrap.appendChild(getApiKeyBtn);
        }
        if (saveTokenBtn.parentElement !== providerHelperWrap) {
            providerHelperWrap.appendChild(saveTokenBtn);
        }
        if (keyHost.auxButton && keyHost.auxButton.parentElement !== providerHelperWrap) {
            providerHelperWrap.appendChild(keyHost.auxButton);
        }
    }

    function submitTokenSaveForm() {
        const providerOptionId = String(providerSelect.value || state.selectedProvider || getProviderOptionIdForModel(state.selectedModel) || "").trim();
        if (!providerOptionId) return;
        const apiProvider = getApiProviderForProviderOption(providerOptionId);
        if (!isCloudApiProvider(apiProvider)) return;
        const token = getProviderApiKeySnapshot(apiProvider);
        if (!token) return;

        tokenSaveUsernameInput.value = providerOptionId;
        tokenSavePasswordInput.value = token;

        try {
            if (typeof tokenSaveForm.requestSubmit === "function") {
                tokenSaveForm.requestSubmit();
            } else {
                tokenSaveForm.submit();
            }
        } catch (_error) {
            // Some browsers may ignore hidden-form submissions for password save prompts.
        } finally {
            setTimeout(() => {
                tokenSavePasswordInput.value = "";
            }, 0);
        }
    }

    function updateProviderKeyVisibility() {
        const provider = getCurrentProviderSnapshot(state.selectedModel);
        const isOpenAI = provider === "openai";
        const isAnthropic = provider === "anthropic";
        const isGroq = provider === "groq";
        const isGemini = provider === "gemini";
        const isHuggingFace = provider === "huggingface";
        const isOpenRouter = provider === "openrouter";

        openaiKeyWrap.classList.toggle("is-hidden", !isOpenAI);
        anthropicKeyWrap.classList.toggle("is-hidden", !isAnthropic);
        groqKeyWrap.classList.toggle("is-hidden", !isGroq);
        geminiKeyWrap.classList.toggle("is-hidden", !isGemini);
        hfWrap.classList.toggle("is-hidden", !isHuggingFace);
        openrouterKeyWrap.classList.toggle("is-hidden", !isOpenRouter);
        updateProviderHelperButton();
    }

    function getProviderDisplayName(provider) {
        if (provider === "openai") return t("ai_styler.provider.openai");
        if (provider === "anthropic") return t("ai_styler.provider.anthropic");
        if (provider === "groq") return t("ai_styler.provider.groq");
        if (provider === "gemini") return t("ai_styler.provider.gemini");
        if (provider === "huggingface") return t("ai_styler.provider.huggingface");
        if (provider === "openrouter") return t("ai_styler.provider.openrouter");
        return t("ai_styler.provider.ollama");
    }

    function getProviderCredentialPrompt(provider) {
        if (provider === "huggingface") {
            return {
                title: t("ai_styler.toast.token_required.title"),
                message: t("ai_styler.toast.hf_token_required.body"),
            };
        }
        return {
            title: t("ai_styler.toast.api_key_required.title"),
            message: t("ai_styler.toast.openai_key_required.body", { provider: getProviderDisplayName(provider) }),
        };
    }

    function focusProviderApiKeyInput(provider) {
        if (provider === "openai") {
            openaiKeyInput.focus();
            return;
        }
        if (provider === "anthropic") {
            anthropicKeyInput.focus();
            return;
        }
        if (provider === "groq") {
            groqKeyInput.focus();
            return;
        }
        if (provider === "gemini") {
            geminiKeyInput.focus();
            return;
        }
        if (provider === "huggingface") {
            hfTokenInput.focus();
            return;
        }
        if (provider === "openrouter") {
            openrouterKeyInput.focus();
        }
    }

    function getCurrentPromptSnapshot() {
        const raw = promptInput ? promptInput.value : "";
        const trimmed = (raw || "").trim();
        if (AI_PRESETS_DEBUG) {
            console.debug(
                "[AI Presets][promptSnapshot]",
                "isConnected:", promptInput?.isConnected,
                "element:", promptInput?.id || promptInput?.className,
                "raw:", JSON.stringify(raw),
                "trimmed:", JSON.stringify(trimmed),
                "length:", trimmed.length,
                "source: DOM .value",
            );
        }
        return trimmed;
    }

    function setCategoryFinalLLMResult(category, hasFinalResult) {
        if (!category) return;
        if (hasFinalResult) {
            state.categoryHasFinalLLMResult[category] = true;
        } else {
            delete state.categoryHasFinalLLMResult[category];
        }
    }

    function invalidateAllCategoryFinalLLMResults() {
        if (Object.keys(state.categoryHasFinalLLMResult || {}).length === 0) return;
        state.categoryHasFinalLLMResult = {};
    }

    function getCategoryQueryActionLabel() {
        return t("ai_styler.btn.query.label");
    }

    function persistLastLLMPrompt(promptText) {
        const normalizedPrompt = (promptText || "").trim();
        if (!normalizedPrompt) return false;
        if (typeof nodePromptBindings.setLastLLMPrompt !== "function") return false;
        try {
            return !!nodePromptBindings.setLastLLMPrompt(normalizedPrompt);
        } catch (err) {
            console.warn("[AI Presets] Failed to persist last LLM prompt into node JSON:", err);
            return false;
        }
    }

    function applyPersistedPromptToInput() {
        // Read prompt exclusively from __dsp_meta__.last_llm_prompt (node JSON).
        if (typeof nodePromptBindings.getLastLLMPrompt === "function") {
            try {
                const lastLLMPrompt = nodePromptBindings.getLastLLMPrompt();
                if (typeof lastLLMPrompt === "string" && lastLLMPrompt.trim()) {
                    promptInput.value = lastLLMPrompt.trim();
                    if (promptClearBtn) promptClearBtn.classList.toggle("is-hidden", !promptInput.value);
                    return { restored: true, source: "__dsp_meta__.last_llm_prompt", value: promptInput.value };
                }
            } catch (err) {
                console.warn("[AI Presets] Failed to load last LLM prompt from node JSON:", err);
            }
        }
        // No localStorage fallback — if node JSON has no prompt, start empty.
        return { restored: false, source: null, value: "" };
    }

    function openReadmeSection(anchor = "") {
        const fullUrl = `${AI_PRESETS_README_URL}${anchor || ""}`;
        try {
            const popup = window.open(fullUrl, "_blank", "noopener,noreferrer");
            if (!popup) {
                window.open(AI_PRESETS_README_URL, "_blank", "noopener,noreferrer");
            }
        } catch {
            window.open(AI_PRESETS_README_URL, "_blank", "noopener,noreferrer");
        }
    }

    function updateViewJsonButton() {
        syncSuggestionsEmptyState();

        if (typeof disposeHeaderRefineMenu === "function") {
            disposeHeaderRefineMenu();
            disposeHeaderRefineMenu = null;
        }
        if (typeof disposeHeaderAddMenu === "function") {
            disposeHeaderAddMenu();
            disposeHeaderAddMenu = null;
        }

        const existingActions = suggestionsHeader.querySelector(".dsp-ai-presets-suggestions-actions");
        if (existingActions) {
            existingActions.remove();
        }

        const actions = document.createElement("div");
        actions.className = "dsp-ai-presets-suggestions-actions";

        const makeHeaderActionButton = (text, title) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = text;
            btn.title = title;
            btn.className = "csp-small-btn";
            return btn;
        };

        const refineWrap = document.createElement("div");
        refineWrap.className = "dsp-ai-presets-header-menu-wrap";

        const refineMenuBtn = makeHeaderActionButton(computeHeaderRefineLabel() + " \u25BC", t("ai_styler.btn.refine_menu.title"));
        headerRefineBtn = refineMenuBtn;
        const refineMenu = document.createElement("div");
        refineMenu.className = "dsp-ai-presets-header-menu";

        const isBusy = state.batchRefineRunning || hasActiveWork();
        refineMenuBtn.disabled = isBusy;
        refineMenuBtn.classList.toggle("is-busy", isBusy);

        let menuOpen = false;
        let removeMenuListeners = () => {};
        const closeMenu = () => {
            menuOpen = false;
            refineMenu.classList.remove("is-open");
            removeMenuListeners();
            removeMenuListeners = () => {};
        };

        const openMenu = () => {
            if (state.batchRefineRunning || hasActiveWork()) return;
            menuOpen = true;
            refineMenu.classList.add("is-open");
            const onDocMouseDown = (event) => {
                if (refineWrap.contains(event.target)) return;
                closeMenu();
            };
            const onDocKeyDown = (event) => {
                if (event.key === "Escape") closeMenu();
            };
            document.addEventListener("mousedown", onDocMouseDown, true);
            document.addEventListener("keydown", onDocKeyDown, true);
            removeMenuListeners = () => {
                document.removeEventListener("mousedown", onDocMouseDown, true);
                document.removeEventListener("keydown", onDocKeyDown, true);
            };
        };

        const createRefineMenuItem = (label, mode) => {
            const item = document.createElement("button");
            item.type = "button";
            item.textContent = label;
            item.className = "dsp-ai-presets-header-menu-item";
            item.addEventListener("click", () => {
                closeMenu();
                void runBatchRefine(mode);
            });
            return item;
        };

        refineMenu.appendChild(createRefineMenuItem(t("ai_styler.refine_menu.missing"), "missing"));
        refineMenu.appendChild(createRefineMenuItem(t("ai_styler.refine_menu.low_score"), "low_score"));
        refineMenu.appendChild(createRefineMenuItem(t("ai_styler.refine_menu.all"), "all_selected"));

        refineMenuBtn.addEventListener("click", () => {
            if (refineMenuBtn.disabled) return;
            if (menuOpen) {
                closeMenu();
                return;
            }
            openMenu();
        });

        refineWrap.appendChild(refineMenuBtn);
        refineWrap.appendChild(refineMenu);

        // --- "Add" dropdown ---
        const addWrap = document.createElement("div");
        addWrap.className = "dsp-ai-presets-header-menu-wrap";

        const addMenuBtn = makeHeaderActionButton(t("ai_styler.btn.add_menu.label") + " \u25BC", t("ai_styler.btn.add_menu.title"));
        const addMenu = document.createElement("div");
        addMenu.className = "dsp-ai-presets-header-menu dsp-ai-presets-header-menu--wide";

        let addMenuOpen = false;
        let removeAddMenuListeners = () => {};
        const closeAddMenu = () => {
            addMenuOpen = false;
            addMenu.classList.remove("is-open");
            removeAddMenuListeners();
            removeAddMenuListeners = () => {};
        };
        const openAddMenu = () => {
            if (hasActiveWork()) return;
            addMenuOpen = true;
            addMenu.classList.add("is-open");
            const onDocMouseDown = (event) => {
                if (addWrap.contains(event.target)) return;
                closeAddMenu();
            };
            const onDocKeyDown = (event) => {
                if (event.key === "Escape") closeAddMenu();
            };
            document.addEventListener("mousedown", onDocMouseDown, true);
            document.addEventListener("keydown", onDocKeyDown, true);
            removeAddMenuListeners = () => {
                document.removeEventListener("mousedown", onDocMouseDown, true);
                document.removeEventListener("keydown", onDocKeyDown, true);
            };
        };

        const createAddMenuItem = (label, handler) => {
            const item = document.createElement("button");
            item.type = "button";
            item.textContent = label;
            item.className = "dsp-ai-presets-header-menu-item";
            item.addEventListener("click", () => {
                closeAddMenu();
                handler();
            });
            return item;
        };

        addMenu.appendChild(createAddMenuItem(t("ai_styler.add_menu.primary_categories"), () => {
            state.suggestionsManuallyCleared = false;
            addCategoriesToSuggestions(["aesthetic", "atmosphere", "lighting", "mood", "timeofday"]);
        }));
        addMenu.appendChild(createAddMenuItem(t("ai_styler.add_menu.applied_styles"), () => {
            const styledCategories = Object.keys(state.stagedSelection || {}).filter(
                (key) => typeof state.stagedSelection[key] === "string" && state.stagedSelection[key]
            );
            if (styledCategories.length > 0) {
                state.suggestionsManuallyCleared = false;
                addCategoriesToSuggestions(styledCategories);
            }
        }));

        addMenuBtn.addEventListener("click", () => {
            if (addMenuBtn.disabled) return;
            if (addMenuOpen) { closeAddMenu(); return; }
            openAddMenu();
        });

        addWrap.appendChild(addMenuBtn);
        addWrap.appendChild(addMenu);

        // --- "Clear" button ---
        const clearBtn = makeHeaderActionButton(t("ai_styler.btn.clear_suggestions.label"), t("ai_styler.btn.clear_suggestions.title"));
        clearBtn.addEventListener("click", () => {
            if (hasActiveWork()) return;
            setInlinePromptError("");
            clearSuggestionsList();
        });

        actions.appendChild(addWrap);
        actions.appendChild(clearBtn);
        actions.appendChild(refineWrap);

        suggestionsHeader.appendChild(actions);
        disposeHeaderRefineMenu = closeMenu;
        disposeHeaderAddMenu = closeAddMenu;
    }

    function getScopedCategoriesInSidebarOrder() {
        const selected = [];
        const seen = new Set();
        categoryList.querySelectorAll(".dsp-category-btn[data-category]").forEach((btn) => {
            const category = (btn.getAttribute("data-category") || "").trim();
            if (!category || !state.scopedCategories.has(category) || seen.has(category)) return;
            selected.push(category);
            seen.add(category);
        });
        state.scopedCategories.forEach((category) => {
            if (!category || seen.has(category)) return;
            selected.push(category);
            seen.add(category);
        });
        return selected;
    }

    function getCategoryCandidates(category) {
        return (state.stagedCandidates?.[category] || [])
            .slice(0, MAX_MODEL_CANDIDATES_PER_CATEGORY)
            .map((item) => {
                if (typeof item === "string") return { name: item, score: null };
                if (item && typeof item.name === "string") {
                    return { name: item.name, score: (typeof item.score === "number" ? item.score : null) };
                }
                return null;
            })
            .filter(Boolean);
    }

    function isCategoryMissingForBatchRefine(category) {
        const candidates = getCategoryCandidates(category);
        if (candidates.length === 0) return true;
        const localStatus = state.localSequentialStatusByCategory?.[category] || "";
        if (localStatus === "no_results" || localStatus === "http_error" || localStatus === "timeout" || localStatus === "cancelled" || localStatus === "omitted") {
            return true;
        }
        if (state.suggestionsErrorCategories?.has?.(category)) return true;
        if (state.categoryHttpError?.[category]) return true;
        return false;
    }

    function isCategoryLowScoreForBatchRefine(category, threshold = 0.9) {
        const candidates = getCategoryCandidates(category);
        if (candidates.length === 0) return false;
        const numericScores = candidates
            .map((candidate) => (typeof candidate.score === "number" ? Math.max(0, Math.min(1, candidate.score)) : null))
            .filter((score) => Number.isFinite(score));
        if (numericScores.length === 0) return false;
        const topScore = Math.max(...numericScores);
        return topScore < threshold;
    }

    function buildBatchRefineQueue(mode) {
        const selectedOrdered = getScopedCategoriesInSidebarOrder();
        const existingOrder = state.suggestionsCategories.filter((category) => state.scopedCategories.has(category));
        const queued = [];
        const seen = new Set();
        existingOrder.forEach((category) => {
            if (seen.has(category)) return;
            seen.add(category);
            queued.push(category);
        });
        selectedOrdered.forEach((category) => {
            if (seen.has(category)) return;
            seen.add(category);
            queued.push(category);
        });

        if (mode === "all_selected") return queued;
        if (mode === "missing") return queued.filter((category) => isCategoryMissingForBatchRefine(category));
        if (mode === "low_score") return queued.filter((category) => isCategoryLowScoreForBatchRefine(category, 0.9));
        return [];
    }

    function ensureCategoryVisibleForRefine(category) {
        if (!category) return;
        if (!state.suggestionsCategories.includes(category)) {
            state.suggestionsCategories.push(category);
        }

        if (state.localSequentialActive) {
            if (!Object.prototype.hasOwnProperty.call(state.localSequentialStatusByCategory, category)) {
                state.localSequentialStatusByCategory[category] = "queued";
            }

            let rowsContainer = suggestionsContent.querySelector("div");
            if (!rowsContainer) {
                suggestionsContent.innerHTML = `<div class="dsp-ai-presets-rows-container"></div>`;
                rowsContainer = suggestionsContent.querySelector("div");
            }

            if (rowsContainer && !getLocalSequentialRowElement(category)) {
                const row = document.createElement("div");
                row.className = "dsp-ai-presets-suggestion-row";
                row.setAttribute("data-category", category);
                rowsContainer.appendChild(row);
            }

            renderLocalSequentialSuggestionRow(category);
            return;
        }

        if (!Object.prototype.hasOwnProperty.call(state.stagedCandidates, category)) {
            state.stagedCandidates[category] = [];
        }

        state.suggestionsVisible = true;
        renderSuggestionCandidates(
            state.suggestionsModelName || state.selectedModel || "",
            state.stagedCandidates,
            state.suggestionsWarnings,
            state.suggestionsRawJson,
            state.suggestionsNotes,
            {
                categories: state.suggestionsCategories,
                errorCategories: Array.from(state.suggestionsErrorCategories),
            }
        );
    }

    async function runBatchRefine(mode) {
        if (state.batchRefineRunning || state.isGenerating || state.refiningCategories.size > 0) return;
        
        // -- Snapshot model + prompt at operation start --
        const selectedModelAtStart = getCurrentModelSnapshot();
        const providerOptionAtStart = getCurrentProviderOptionSnapshot(selectedModelAtStart);
        const providerAtStart = getCurrentProviderSnapshot(selectedModelAtStart);
        const requestModelAtStart = providerAtStart === "huggingface"
            ? resolveHuggingFaceRequestModel(selectedModelAtStart)
            : selectedModelAtStart;
        const providerApiKeyAtStart = isCloudApiProvider(providerAtStart)
            ? getProviderApiKeySnapshot(providerAtStart)
            : "";
        const requestTimeoutMsAtStart = getCurrentRequestTimeoutMsSnapshot();
        const promptAtStart = getCurrentPromptSnapshot();
        
        if (!selectedModelAtStart) {
            showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.model_required.body"));
            return;
        }
        if (isCloudApiProvider(providerAtStart) && !providerApiKeyAtStart) {
            const credentialPrompt = getProviderCredentialPrompt(providerAtStart);
            showToast("error", credentialPrompt.title, credentialPrompt.message);
            focusProviderApiKeyInput(providerAtStart);
            return;
        }
        if (!requestModelAtStart) {
            showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.hf_model_required.body"));
            return;
        }
        if (!ensureOllamaLocalRunning({ providerOptionId: providerOptionAtStart, modelName: selectedModelAtStart })) {
            return;
        }
        if (!promptAtStart) {
            showToast("warn", t("ai_styler.toast.prompt_required.title"), t("ai_styler.toast.prompt_required.body"));
            promptInput.focus();
            return;
        }

        const queue = buildBatchRefineQueue(mode);
        if (queue.length === 0) {
            showToast("info", t("ai_styler.toast.refine.title"), t("ai_styler.toast.refine.empty_queue"), 3500);
            return;
        }

        const modeLabel = mode === "missing"
            ? "missing"
            : mode === "low_score"
                ? "low-score"
                : "all selected";

        persistLastUsedProviderModel(
            providerOptionAtStart,
            selectedModelAtStart
        );
        persistLastLLMPrompt(promptAtStart);

        state.batchRefineRunning = true;
        updateViewJsonButton();
        updateTabActivityIndicator();
        updateGenerateButton();

        try {
            for (const category of queue) {
                ensureCategoryVisibleForRefine(category);
            }

            await tickerType(t("ai_styler.statusbar.batch_refine_start", { mode: modeLabel, count: queue.length }));
            for (const category of queue) {
                if (!state.batchRefineRunning) break;
                await refineCategoryCandidates(category, { 
                    fromBatch: true,
                    model: requestModelAtStart,
                    provider: providerAtStart,
                    apiKey: providerApiKeyAtStart,
                    timeoutMs: requestTimeoutMsAtStart,
                    prompt: promptAtStart,
                });
            }
        } finally {
            state.batchRefineRunning = false;
            updateViewJsonButton();
            updateTabActivityIndicator();
            updateGenerateButton();
            state.pendingSidebarSync = false;
        }
    }

    function setNodePromptStateBindings(bindings) {
        if (!bindings || typeof bindings !== "object") {
            nodePromptBindings.getLastLLMPrompt = null;
            nodePromptBindings.setLastLLMPrompt = null;
            return;
        }
        nodePromptBindings.getLastLLMPrompt = typeof bindings.getLastLLMPrompt === "function"
            ? bindings.getLastLLMPrompt
            : null;
        nodePromptBindings.setLastLLMPrompt = typeof bindings.setLastLLMPrompt === "function"
            ? bindings.setLastLLMPrompt
            : null;
    }

    function setStagedCategorySelection(category, value, options = {}) {
        if (options.invalidateLLMResult !== false) {
            setCategoryFinalLLMResult(category, false);
        }
        const next = cloneSelection(state.stagedSelection);
        if (value === null) {
            next[category] = null;
            state.stagedSkipSet.add(category);
        } else if (value === undefined || value === "") {
            delete next[category];
            state.stagedSkipSet.delete(category);
        } else {
            next[category] = value;
            state.stagedSkipSet.delete(category);
        }
        setStagedSelection(next);

        updateViewJsonButton();

        if (onSelectCallback) {
            onSelectCallback(category, value);
        } else {
            renderFromStaged();
        }
    }

    function logKeepSelectedNoStyles(category, reason = "no_styles", source = "query") {
        if (!category) return;
    }


    function handleSuggestionChipSelection(category, value, isCurrentlySelected) {
        if (!category || !value) return;
        if (isCurrentlySelected) {
            setStagedCategorySelection(category, null);
            return;
        }
        setStagedCategorySelection(category, value);
    }

    async function refineCategoryCandidates(categoryKey, options = {}) {
        const fromBatch = options?.fromBatch === true;
        
        // -- Snapshot model + prompt at operation start --
        const selectedModelAtStart = options?.model || getCurrentModelSnapshot();
        const providerOptionAtStart = options?.providerOption || getCurrentProviderOptionSnapshot(selectedModelAtStart);
        const providerAtStart = options?.provider || getCurrentProviderSnapshot(selectedModelAtStart);
        const requestModelAtStart = providerAtStart === "huggingface"
            ? resolveHuggingFaceRequestModel(selectedModelAtStart)
            : selectedModelAtStart;
        const providerApiKeyAtStart = isCloudApiProvider(providerAtStart)
            ? (typeof options?.apiKey === "string" ? options.apiKey : getProviderApiKeySnapshot(providerAtStart))
            : "";
        const requestTimeoutMsAtStart = Number.isFinite(Number(options?.timeoutMs))
            ? Math.max(1000, Math.floor(Number(options.timeoutMs)))
            : getCurrentRequestTimeoutMsSnapshot();
        const promptAtStart = options?.prompt || getCurrentPromptSnapshot();
        
        if (!promptAtStart) {
            console.warn("[AI Presets] Cannot refine: no prompt text");
            showToast("warn", t("ai_styler.toast.prompt_required.title"), t("ai_styler.toast.prompt_required.body"));
            promptInput.focus();
            return;
        }

        if (!selectedModelAtStart || !requestModelAtStart) {
            console.warn("[AI Presets] Cannot refine: no model selected");
            if (providerAtStart === "huggingface" && !requestModelAtStart) {
                showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.hf_model_required.body"));
            }
            return;
        }
        if (isCloudApiProvider(providerAtStart) && !providerApiKeyAtStart) {
            const credentialPrompt = getProviderCredentialPrompt(providerAtStart);
            showToast("error", credentialPrompt.title, credentialPrompt.message);
            focusProviderApiKeyInput(providerAtStart);
            return;
        }
        if (!fromBatch && !ensureOllamaLocalRunning({ providerOptionId: providerOptionAtStart, modelName: selectedModelAtStart })) {
            return;
        }

        if (state.runQueueIsRunning || state.isGenerating) {
            console.warn("[AI Presets] Cannot refine while queue is running");
            return;
        }

        if (state.refiningCategories.size > 0) {
            console.warn("[AI Presets] Cannot refine: another category refine is already running");
            return;
        }
        if (state.batchRefineRunning && !fromBatch) {
            console.warn("[AI Presets] Cannot run manual refine while batch refine is running");
            return;
        }
        persistLastUsedProviderModel(
            providerOptionAtStart,
            selectedModelAtStart
        );

        // Get style data for this category
        const styleByCategory = buildLocalStyleIndex(state.styleIndex || []);
        const categoryStyles = styleByCategory[categoryKey] || [];
        if (categoryStyles.length === 0) {
            console.warn(`[AI Presets] No styles available for category: ${categoryKey}`);
            return;
        }

        const allowedNames = categoryStyles.map((item) => item.title);
        if (!fromBatch) {
            persistLastLLMPrompt(promptAtStart);
        }
        const hasLocalSequentialRow = state.localSequentialActive && Object.prototype.hasOwnProperty.call(state.localSequentialStatusByCategory, categoryKey);
        const previousStatus = state.localSequentialStatusByCategory[categoryKey] || "done";
        let nextStatus = previousStatus;
        let shouldStaggerCandidates = false;
        let statusBarResult = "success";
        let statusBarReason = "";
        let finalStatusMessage = "";
        const refineStart = performance.now();
        const displayCategory = categoryKey.replace(/_/g, " ");
        const refineRunId = state.refineRunId + 1;
        state.refineRunId = refineRunId;
        const refineAbortController = new AbortController();
        state.refineAbortController = refineAbortController;

        state.refiningCategories.add(categoryKey);
        updateTabActivityIndicator();
        updateGenerateButton();
        state.lastRequestModel = requestModelAtStart;
        state.progressTotal = 1;
        state.progressDone = 0;
        setStatusBarProgress(0);
        startStatusTimer();
        if (hasLocalSequentialRow) {
            state.localSequentialStatusByCategory[categoryKey] = "running";
            setCategoryFinalLLMResult(categoryKey, false);
            delete state.categoryHttpError[categoryKey];
            renderAllLocalSequentialRows();
        } else if (state.suggestionsVisible) {
            renderSuggestionCandidates(
                state.suggestionsModelName,
                state.stagedCandidates,
                state.suggestionsWarnings,
                state.suggestionsRawJson,
                state.suggestionsNotes,
                {
                    categories: state.suggestionsCategories,
                    errorCategories: Array.from(state.suggestionsErrorCategories),
                }
            );
        }
        setInlinePromptError("");

        try {
            if (!isLatestRefineRun(refineRunId)) return;
            const refineMessages = buildRefineCategoryMessages({
                categoryKey,
                promptText: promptAtStart,
                styleData: categoryStyles,
                maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
            });
            let refineReply = "";
            const initialAttemptLabel = `(attempt 1/${RETRY_MAX_ATTEMPTS})`;
            setStatusBarProgress(12);
            await tickerType(t("ai_styler.statusbar.refining", { category: displayCategory, attempt: initialAttemptLabel }));

            const refineRequest = await requestLlmCategoryWithGlobalBackoff({
                provider: providerAtStart,
                model: requestModelAtStart,
                messages: refineMessages,
                apiKey: providerApiKeyAtStart,
                timeoutMs: requestTimeoutMsAtStart,
                signal: refineAbortController.signal,
                onRateLimited: async ({ nextAttempt, maxAttempts, error, delayMs }) => {
                    if (!isLatestRefineRun(refineRunId)) return;
                    const attemptProgress = Math.min(86, 12 + (nextAttempt * 24));
                    setStatusBarProgress(attemptProgress);
                    setStatusBarBulletState({ visible: true, variant: "ratelimit", pulsing: true, title: t("ai_styler.statusbar.rate_limited") });
                    const delaySec = (delayMs / 1000).toFixed(1);
                    await tickerType(t("ai_styler.statusbar.rate_limited_retry", { status: error.status, delay: delaySec, attempt: nextAttempt + 1, max: maxAttempts }), { extraClass: "dsp-ai-presets-status-bar-typed--ratelimit" });
                },
                onRateLimitWaitComplete: ({ attempt, maxAttempts }) => {
                    if (!isLatestRefineRun(refineRunId)) return;
                    setStatusBarBulletState({ visible: true, variant: "running", pulsing: false, title: t("ai_styler.statusbar.running") });
                    tickerType(t("ai_styler.statusbar.refining_attempt", { category: displayCategory, attempt: attempt + 1, max: maxAttempts }));
                },
            });
            if (!isLatestRefineRun(refineRunId)) return;

            if (!refineRequest.ok) {
                const normalizedFailure = reportLlmRequestFailure(refineRequest.error, {
                    provider: providerAtStart,
                    modelName: requestModelAtStart,
                    fallbackInlineText: refineRequest.errorLabel || "",
                });
                state.categoryHttpError[categoryKey] = normalizedFailure.statusTextForChip;
                nextStatus = refineRequest.reason === "timeout" ? "timeout" : "http_error";
                statusBarResult = "error";
                statusBarReason = normalizedFailure.statusTextForChip;
                finalStatusMessage = t("ai_styler.statusbar.refine_failed", { error: normalizedFailure.statusTextForChip, category: displayCategory });
                if (refineRequest.reason === "timeout") {
                    logKeepSelectedNoStyles(categoryKey, "timeout", "refine");
                } else {
                    logKeepSelectedNoStyles(categoryKey, `http_error:${normalizedFailure.statusTextForChip}`, "refine");
                }
            } else {
                refineReply = refineRequest.replyText;
            }

            if (refineReply) {
                setStatusBarProgress(90);
                let parsed = parseRefineCategoryReply({
                    replyText: refineReply,
                    categoryKey,
                    allowedNames,
                    categoryAliases: CATEGORY_ALIASES,
                    maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
                });

                if (!parsed.ok || parsed.candidates.length === 0) {
                    console.warn(`[AI Presets] Refine failed for ${categoryKey}: ${parsed.reason || "No valid candidates"}`);
                    nextStatus = "no_results";
                    finalStatusMessage = t("ai_styler.statusbar.no_suggestions_for", { category: displayCategory });
                    logKeepSelectedNoStyles(categoryKey, parsed.reason || "no_valid_styles", "refine");
                } else {
                    // Update candidates for this category
                    state.stagedCandidates[categoryKey] = parsed.candidates;
                    delete state.categoryHttpError[categoryKey];
                    if (AI_PRESETS_DEBUG && parsed.fallbackScoresApplied > 0) {
                        console.log(`Accepted response without scores; applied fallback scores (${parsed.fallbackScoresApplied} items)`);
                    }

                    nextStatus = "done";
                    shouldStaggerCandidates = hasLocalSequentialRow;

                    // Auto-select first candidate
                    const firstCandidate = parsed.candidates[0];
                    if (firstCandidate?.name) {
                        setStagedCategorySelection(categoryKey, firstCandidate.name, { invalidateLLMResult: false });
                    } else {
                        logKeepSelectedNoStyles(categoryKey, "apply_skipped_no_top_style", "refine");
                    }

                    finalStatusMessage = t("ai_styler.statusbar.suggestions_from", { count: parsed.candidates.length, category: displayCategory });
                }
            }
        } catch (err) {
            if (!isLatestRefineRun(refineRunId)) return;
            console.error(`[AI Presets] Refine error for ${categoryKey}:`, err);
            if (err?.name === "AbortError") {
                nextStatus = "cancelled";
                statusBarResult = "cancelled";
                statusBarReason = t("ai_styler.statusbar.cancelled");
                finalStatusMessage = t("ai_styler.statusbar.cancelled");
                logKeepSelectedNoStyles(categoryKey, "cancelled", "refine");
            } else {
                const normalizedFailure = reportLlmRequestFailure(err, {
                    provider: providerAtStart,
                    modelName: requestModelAtStart,
                });
                state.categoryHttpError[categoryKey] = normalizedFailure.statusTextForChip;
                nextStatus = "http_error";
                statusBarResult = "error";
                statusBarReason = normalizedFailure.statusTextForChip;
                finalStatusMessage = t("ai_styler.statusbar.refine_failed_exception", { category: displayCategory });
                logKeepSelectedNoStyles(categoryKey, `http_error:${statusBarReason}`, "refine");
            }
        } finally {
            if (state.refineAbortController === refineAbortController) {
                state.refineAbortController = null;
            }
            if (!isLatestRefineRun(refineRunId)) return;
            stopStatusTimer();
            const refineDuration = Math.round(performance.now() - refineStart);
            if (statusBarResult === "cancelled") {
                updateStatusBar("cancelled", { duration: refineDuration, reason: statusBarReason });
            } else if (statusBarResult === "error") {
                updateStatusBar("error", { duration: refineDuration, reason: statusBarReason });
            } else {
                updateStatusBar("success", { duration: refineDuration });
            }
            if (finalStatusMessage) {
                tickerType(finalStatusMessage);
            }

            state.refiningCategories.delete(categoryKey);
            updateTabActivityIndicator();
            updateGenerateButton();
            updateViewJsonButton();
            if (hasLocalSequentialRow) {
                state.localSequentialStatusByCategory[categoryKey] = nextStatus;
                setCategoryFinalLLMResult(categoryKey, nextStatus === "done" || nextStatus === "no_results");
                renderAllLocalSequentialRows(categoryKey);
                renderLocalSequentialSuggestionRow(categoryKey, { staggerCandidates: shouldStaggerCandidates });
            } else if (state.suggestionsVisible) {
                renderSuggestionCandidates(
                    state.suggestionsModelName,
                    state.stagedCandidates,
                    state.suggestionsWarnings,
                    state.suggestionsRawJson,
                    state.suggestionsNotes,
                    {
                        categories: state.suggestionsCategories,
                        errorCategories: Array.from(state.suggestionsErrorCategories),
                    }
                );
            }
            state.pendingSidebarSync = false;
        }
    }

    function getSuggestionCategoryLabelHtml(category) {
        return `
            <div
                class="dsp-ai-presets-category-badge"
                title="${escapeHtml(category)}"
                style="
                    display:flex;
                    align-items:center;
                    min-width:0;
                    pointer-events:none;
                "
            >
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;font-family:Arial,sans-serif;color:var(--styler-text);line-height:1;">${escapeHtml(category)}</span>
            </div>
        `;
    }

    function getLocalSequentialRowElement(category) {
        const rows = suggestionsContent.querySelectorAll(".dsp-ai-presets-suggestion-row[data-category]");
        for (const row of rows) {
            if ((row.getAttribute("data-category") || "") === category) {
                return row;
            }
        }
        return null;
    }

    function clearLocalSequentialChipTimer(category) {
        if (!category) return;
        const timerId = state.chipRenderTimersByCategory[category];
        if (timerId === undefined) return;
        clearTimeout(timerId);
        delete state.chipRenderTimersByCategory[category];
    }

    function invalidateLocalSequentialChipRendering() {
        state.chipRenderRunToken += 1;
        Object.keys(state.chipRenderTimersByCategory || {}).forEach((category) => {
            clearTimeout(state.chipRenderTimersByCategory[category]);
        });
        state.chipRenderTimersByCategory = {};
    }

    function getLocalSequentialChipStaggerDelayMs(totalChips) {
        if (Number(totalChips) > CHIP_STAGGER_FAST_THRESHOLD) {
            return CHIP_STAGGER_FAST_MS;
        }
        return CHIP_STAGGER_MS;
    }

    function getStylePromptTooltip(category, styleName) {
        const normalizedCategory = normalizeCategoryKey(category);
        const normalizedStyle = normalizeStyleName(styleName);
        if (!normalizedCategory || !normalizedStyle) return "";
        const byCategory = state.stylePromptTooltipLookupByCategory?.[normalizedCategory];
        if (!byCategory) return "";
        return byCategory.get(normalizedStyle) || "";
    }

    function isTerminalCategoryStatus(status) {
        return MANUAL_PICK_TERMINAL_STATES.has(status);
    }

    function renderAllLocalSequentialRows(excludeCategory = "") {
        if (!state.localSequentialActive) return;
        state.suggestionsCategories.forEach((category) => {
            if (!category || category === excludeCategory) return;
            renderLocalSequentialSuggestionRow(category);
        });
        updateHeaderRefineLabel();
    }

    function setRunQueueIsRunning(isRunning) {
        const running = !!isRunning;
        const changed = state.runQueueIsRunning !== running;
        state.runQueueIsRunning = running;
        if (changed) {
            renderAllLocalSequentialRows();
        }
    }

    function goToBrowserAndFocusCategory(categoryKey) {
        const category = String(categoryKey || "").trim();
        if (!category) return;

        const focusInBrowse = () => {
            const browseModule = manager?.getModule("browse");
            if (browseModule?._focusCategory) {
                browseModule._focusCategory(category);
            }
        };

        const browseTabBtn = container.querySelector('.dsp-tab[data-tab="browse"]');
        if (browseTabBtn) {
            browseTabBtn.click();
            requestAnimationFrame(() => {
                focusInBrowse();
            });
            return;
        }

        manager?.activate("browse");
        focusInBrowse();
    }

    function buildLocalSequentialCandidatePillHtml(category, candidate, selected, hasExplicitSkip) {
        const name = candidate.name;
        const score = candidate.score;
        const isSelected = selected === name && !hasExplicitSkip;
        const promptTooltip = getStylePromptTooltip(category, name);
        const tooltipAttr = promptTooltip ? ` title="${escapeHtml(promptTooltip)}"` : "";
        const scoreBadge = buildScoreBadgeHtml(score);

        return `
            <button
                type="button"
                class="dsp-ai-presets-local-candidate-pill"
                data-category="${escapeHtml(category)}"
                data-value="${escapeHtml(name)}"
                aria-pressed="${isSelected ? "true" : "false"}"
                ${tooltipAttr}
                style="
                    border:1px solid ${isSelected ? "var(--styler-primary-bg)" : "color-mix(in srgb, var(--styler-border) 60%, transparent)"};
                    background:${isSelected ? "var(--styler-primary-bg)" : "var(--styler-input-bg)"};
                    color:${isSelected ? "var(--styler-primary-text)" : "var(--styler-text)"};
                "
            >${escapeHtml(name)}${scoreBadge}</button>
        `;
    }

    function wireLocalSequentialCandidatePill(pill) {
        if (!pill) return;
        const isSelected = pill.getAttribute("aria-pressed") === "true";
        pill.onmouseenter = () => {
            if (!isSelected) {
                pill.style.background = "color-mix(in srgb, var(--styler-primary-bg) 28%, var(--styler-panel-bg-secondary))";
            }
        };
        pill.onmouseleave = () => {
            if (!isSelected) {
                pill.style.background = "var(--styler-input-bg)";
            }
        };
        pill.onclick = () => {
            const selectedCategory = pill.getAttribute("data-category") || "";
            const value = pill.getAttribute("data-value") || "";
            if (!selectedCategory || !value) return;
            const isCurrentlySelected = pill.getAttribute("aria-pressed") === "true";
            handleSuggestionChipSelection(selectedCategory, value, isCurrentlySelected);
            renderLocalSequentialSuggestionRow(selectedCategory);
        };
    }

    function applyChipDiffStaggered(category, nextCandidates, selected, hasExplicitSkip) {
        clearLocalSequentialChipTimer(category);
        const diffRunToken = ++state.chipRenderRunToken;
        const delayMs = getLocalSequentialChipStaggerDelayMs(nextCandidates.length);
        const row = getLocalSequentialRowElement(category);
        if (!row) return;
        const container = row.querySelector(".dsp-ai-presets-local-candidates");
        if (!container) return;

        // Clear placeholder status chips (e.g. "Pending") before inserting first result
        // to avoid visible layout jump at the end of staggered rendering.
        if (nextCandidates.length > 0) {
            container.querySelectorAll("span").forEach((sp) => {
                if (!sp.classList.contains("score-badge") && !sp.closest(".dsp-ai-presets-local-candidate-pill")) {
                    sp.remove();
                }
            });
        }

        const oldPills = Array.from(container.querySelectorAll(".dsp-ai-presets-local-candidate-pill"));
        const maxLen = Math.max(oldPills.length, nextCandidates.length);
        let idx = 0;

        const tick = () => {
            if (diffRunToken !== state.chipRenderRunToken) return;
            if (idx >= maxLen) {
                clearLocalSequentialChipTimer(category);
                return;
            }

            const existingPill = container.querySelectorAll(".dsp-ai-presets-local-candidate-pill")[idx];
            const nextCandidate = nextCandidates[idx];

            if (existingPill && nextCandidate) {
                const oldName = existingPill.getAttribute("data-value") || "";
                if (oldName !== nextCandidate.name) {
                    const newHtml = buildLocalSequentialCandidatePillHtml(category, nextCandidate, selected, hasExplicitSkip);
                    existingPill.insertAdjacentHTML("afterend", newHtml);
                    const newPill = existingPill.nextElementSibling;
                    existingPill.remove();
                    if (newPill) wireLocalSequentialCandidatePill(newPill);
                }
            } else if (existingPill && !nextCandidate) {
                existingPill.remove();
            } else if (!existingPill && nextCandidate) {
                const newPillHtml = buildLocalSequentialCandidatePillHtml(category, nextCandidate, selected, hasExplicitSkip);
                const browseButton = container.querySelector(".dsp-ai-presets-local-browse-btn");
                if (browseButton) {
                    browseButton.insertAdjacentHTML("beforebegin", newPillHtml);
                } else {
                    container.insertAdjacentHTML("beforeend", newPillHtml);
                }
                const inserted = browseButton
                    ? browseButton.previousElementSibling
                    : container.lastElementChild;
                if (inserted && inserted.classList.contains("dsp-ai-presets-local-candidate-pill")) {
                    wireLocalSequentialCandidatePill(inserted);
                }
            }

            idx++;
            if (idx < maxLen) {
                state.chipRenderTimersByCategory[category] = setTimeout(tick, delayMs);
            } else {
                tick(); // Final cleanup pass
            }
        };

        tick();
    }

    function renderLocalSequentialCandidatePillsStaggered(category, candidates, selected, hasExplicitSkip) {
        clearLocalSequentialChipTimer(category);
        const staggerRunToken = state.chipRenderRunToken;
        const delayMs = getLocalSequentialChipStaggerDelayMs(candidates.length);
        let idx = 0;

        const tick = () => {
            if (staggerRunToken !== state.chipRenderRunToken) return;

            const row = getLocalSequentialRowElement(category);
            if (!row) return;
            const container = row.querySelector(".dsp-ai-presets-local-candidates");
            if (!container) return;

            const candidate = candidates[idx];
            if (!candidate) {
                clearLocalSequentialChipTimer(category);
                return;
            }

            const newPillHtml = buildLocalSequentialCandidatePillHtml(category, candidate, selected, hasExplicitSkip);
            const browseButton = container.querySelector(".dsp-ai-presets-local-browse-btn");
            if (browseButton) {
                browseButton.insertAdjacentHTML("beforebegin", newPillHtml);
            } else {
                container.insertAdjacentHTML("beforeend", newPillHtml);
            }
            const insertedPill = browseButton
                ? browseButton.previousElementSibling
                : container.lastElementChild;
            if (insertedPill && insertedPill.classList.contains("dsp-ai-presets-local-candidate-pill")) {
                wireLocalSequentialCandidatePill(insertedPill);
            }

            idx += 1;
            if (idx < candidates.length) {
                state.chipRenderTimersByCategory[category] = setTimeout(tick, delayMs);
            } else {
                clearLocalSequentialChipTimer(category);
            }
        };

        tick();
    }

    function buildStatusBulletHtml(variant, title, pulsing = false) {
        const pulseClass = pulsing ? " is-pulsing" : "";
        return `<span class="dsp-ai-presets-local-status-icon dsp-ai-presets-status-bullet dsp-ai-presets-status-bullet--${variant}${pulseClass}" title="${escapeHtml(title)}"></span>`;
    }

    function buildLocalSequentialStatusIcon(status, hasSuggestions = false) {
        if (status === "running") {
            return buildStatusBulletHtml("running", t("ai_styler.status_icon.running"), true);
        }
        if (status === "done") {
            return hasSuggestions
                ? buildStatusBulletHtml("success", t("ai_styler.status_icon.done"))
                : buildStatusBulletHtml("neutral", t("ai_styler.status_icon.no_suggestions"));
        }
        if (status === "no_results") {
            return buildStatusBulletHtml("neutral", t("ai_styler.status_icon.no_suggestions"));
        }
        if (status === "cancelled") {
            return buildStatusBulletHtml("error", t("ai_styler.status_icon.cancelled"));
        }
        if (status === "http_error") {
            return buildStatusBulletHtml("error", t("ai_styler.status_icon.http_error"));
        }
        if (status === "timeout") {
            return buildStatusBulletHtml("neutral", t("ai_styler.status_icon.timeout"));
        }
        if (status === "omitted") {
            return buildStatusBulletHtml("neutral", t("ai_styler.status_icon.omitted"));
        }
        return buildStatusBulletHtml("neutral", t("ai_styler.status_icon.pending"));
    }

    function renderLocalSequentialSuggestionRow(category, options = {}) {
        if (!state.localSequentialActive) return;

        // Capture before clearing: if a chip animation is already in progress, any
        // re-render triggered externally (e.g. setRunQueueIsRunning) must not bulk-replace
        // the candidates zone and cancel the reveal mid-way.
        const chipAnimationInProgress = state.chipRenderTimersByCategory[category] !== undefined;
        clearLocalSequentialChipTimer(category);

        const row = getLocalSequentialRowElement(category);
        if (!row) return;

        const status = state.localSequentialStatusByCategory[category] || "queued";
        const isTerminal = isTerminalCategoryStatus(status);
        const isRefineDisabled = state.runQueueIsRunning || state.refiningCategories.size > 0;
        const rawCandidates = (state.stagedCandidates[category] || []).slice(0, MAX_MODEL_CANDIDATES_PER_CATEGORY);
        const candidates = rawCandidates.map((item) => {
            if (typeof item === "string") return { name: item, score: null };
            if (item && typeof item.name === "string") return { name: item.name, score: (typeof item.score === "number" ? item.score : null) };
            return null;
        }).filter(Boolean);

        const hasKey = Object.prototype.hasOwnProperty.call(state.stagedSelection, category);
        const hasExplicitSkip = (hasKey && state.stagedSelection[category] === null) || state.stagedSkipSet.has(category);
        let selected = null;
        if (hasKey && typeof state.stagedSelection[category] === "string") {
            selected = state.stagedSelection[category];
        } else if (!hasExplicitSkip && candidates.length > 0) {
            selected = candidates[0].name;
        }

        const categoryLabel = getSuggestionCategoryLabelHtml(category);

        const infoPill = (labelText, extraClass = "") => `
            <span
                class="${extraClass}"
                style="
                    border:none;
                    border-radius:4px;
                    padding:3px 9px;
                    font-size:11px;
                    font-family:Arial, sans-serif;
                    background:var(--styler-input-bg);
                    color:var(--styler-text-muted);
                    white-space:nowrap;
                    line-height:1.2;
                    display:inline-flex;
                    align-items:center;
                    cursor:default;
                    opacity:0.9;
                "
            >${escapeHtml(labelText)}</span>
        `;

        const errorPill = (labelText) => `
            <span
                style="
                    border:none;
                    border-radius:4px;
                    padding:3px 9px;
                    font-size:11px;
                    font-family:Arial, sans-serif;
                    background:rgba(244, 67, 54, 0.15);
                    color:var(--styler-error, #f44336);
                    white-space:nowrap;
                    line-height:1.2;
                    display:inline-flex;
                    align-items:center;
                    cursor:default;
                "
            >${escapeHtml(labelText)}</span>
        `;

        // --- Left zone: always show style chips (even during running/error) ---
        let candidateHtml = "";
        const shouldDiffStagger = status === "done" && candidates.length > 0
            && (options.staggerCandidates === true || chipAnimationInProgress);
        if (shouldDiffStagger) {
            // Will be patched in gradually below; keep existing chips in DOM
            candidateHtml = "";
        } else if (candidates.length > 0) {
            candidateHtml = candidates.map((candidate) => buildLocalSequentialCandidatePillHtml(category, candidate, selected, hasExplicitSkip)).join("");
        } else if (isTerminal && candidates.length === 0) {
            candidateHtml = infoPill(t("ai_styler.suggestions.no_suggestions"));
        }



        // --- Right zone: status pill + action buttons ---
        const statusPillHtml = "";

        const showBrowseButton = status !== "running" && status !== "queued";
        const browseButtonHtml = showBrowseButton ? `
            <button
                type="button"
                class="dsp-ai-presets-local-refine-btn dsp-ai-presets-local-browse-btn"
                data-category="${escapeHtml(category)}"
                title="${t("ai_styler.btn.browse_styles.title")}"
            >\u2026</button>
        ` : "";
        const showRefineButton = status !== "running";
        const refineButtonLabel = getCategoryQueryActionLabel(category);
        const refineButtonHtml = showRefineButton ? `
            <button
                type="button"
                class="dsp-ai-presets-local-refine-btn"
                data-category="${escapeHtml(category)}"
                title="${t("ai_styler.btn.refine.title", { category: escapeHtml(category) })}"
                ${isRefineDisabled ? "disabled" : ""}
            >${refineButtonLabel}</button>
        ` : "";
        const isRunningLocalCategory = status === "running"
            && state.isLocalQueryRun
            && state.activeCategory === category
            && !!state.activeCategoryAbortController
            && !state.activeCategoryAbortController.signal.aborted;
        const isOmitEnabled = isRunningLocalCategory
            && state.activeCategoryRequestId > 0
            && state.omitEnabledRequestId === state.activeCategoryRequestId;
        const omitButtonHtml = isRunningLocalCategory ? `
            <button
                type="button"
                class="dsp-ai-presets-local-refine-btn dsp-ai-presets-local-omit-btn"
                data-category="${escapeHtml(category)}"
                title="${t("ai_styler.btn.omit.title", { category: escapeHtml(category) })}"
                ${isOmitEnabled ? "" : "disabled"}
            >${t("ai_styler.btn.omit.label")}</button>
        ` : "";
        const statusIconHtml = buildLocalSequentialStatusIcon(status, candidates.length > 0);
        const actionButtonHtml = omitButtonHtml || refineButtonHtml;
        const browseInCandidateZoneHtml = showBrowseButton && candidates.length > 0 ? browseButtonHtml : "";
        const browseNearCategoryLabelHtml = showBrowseButton && candidates.length === 0 ? browseButtonHtml : "";
        const leftZoneHtml = `
            <div class="dsp-ai-presets-left-zone" style="display:flex;align-items:center;gap:4px;min-width:0;">
                ${statusIconHtml}
                ${categoryLabel}
                ${browseNearCategoryLabelHtml}
            </div>
        `;

        const rightZoneHtml = `<div class="dsp-ai-presets-right-zone" style="display:flex;gap:6px;align-items:center;flex-shrink:0;white-space:nowrap;">${actionButtonHtml}${statusPillHtml}</div>`;

        if (shouldDiffStagger) {
            // Preserve existing candidates container; only update label + right zone
            const existingCandidates = row.querySelector(".dsp-ai-presets-local-candidates");
            const oldRight = row.querySelector(".dsp-ai-presets-right-zone");
            if (oldRight) oldRight.remove();
            const oldLeftZone = row.querySelector(".dsp-ai-presets-left-zone");
            if (oldLeftZone) oldLeftZone.remove();
            const oldCategoryBadge = row.querySelector(".dsp-ai-presets-category-badge");
            if (oldCategoryBadge) oldCategoryBadge.remove();
            row.insertAdjacentHTML("afterbegin", leftZoneHtml);
            // Ensure candidates container exists
            if (!existingCandidates) {
                const leftZone = row.querySelector(".dsp-ai-presets-left-zone");
                if (leftZone) leftZone.insertAdjacentHTML("afterend", `<div class="dsp-ai-presets-local-candidates" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;min-width:0;">${browseInCandidateZoneHtml}</div>`);
            } else {
                existingCandidates.querySelectorAll(".dsp-ai-presets-local-browse-btn").forEach((btn) => btn.remove());
                if (browseInCandidateZoneHtml) {
                    existingCandidates.insertAdjacentHTML("beforeend", browseInCandidateZoneHtml);
                }
            }
            row.insertAdjacentHTML("beforeend", rightZoneHtml);
        } else {
            row.innerHTML = `
                ${leftZoneHtml}
                <div class="dsp-ai-presets-local-candidates" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;min-width:0;">
                    ${candidateHtml}
                    ${browseInCandidateZoneHtml}
                </div>
                ${rightZoneHtml}
            `;
        }

        const rowDefaultBg = status === "running" ? AI_PRESETS_QUERYING_ROW_BG : "";
        row.style.background = rowDefaultBg;
        row.onmouseenter = () => {
            row.style.background = status === "running" ? "rgba(0, 122, 255, 0.12)" : AI_PRESETS_QUERYING_ROW_BG;
        };
        row.onmouseleave = () => {
            row.style.background = rowDefaultBg;
        };

        row.querySelectorAll(".dsp-ai-presets-local-candidate-pill").forEach((pill) => wireLocalSequentialCandidatePill(pill));
        row.querySelectorAll(".dsp-ai-presets-local-refine-btn:not(.dsp-ai-presets-local-omit-btn)").forEach((btn) => {
            btn.onclick = async () => {
                if (btn.disabled) return;
                const categoryToRefine = btn.getAttribute("data-category") || "";
                if (!categoryToRefine) return;
                await refineCategoryCandidates(categoryToRefine);
            };
        });
        row.querySelectorAll(".dsp-ai-presets-local-omit-btn").forEach((btn) => {
            btn.onclick = () => {
                if (btn.disabled) return;
                const categoryToOmit = btn.getAttribute("data-category") || "";
                if (!categoryToOmit || categoryToOmit !== state.activeCategory) return;
                if (!state.isGenerating || !state.isLocalQueryRun) return;
                markCurrentCategoryOmitted();
            };
        });
        row.querySelectorAll(".dsp-ai-presets-local-browse-btn").forEach((btn) => {
            btn.onclick = () => {
                const categoryToBrowse = btn.getAttribute("data-category") || "";
                if (!categoryToBrowse) return;
                goToBrowserAndFocusCategory(categoryToBrowse);
            };
        });

        if (shouldDiffStagger) {
            applyChipDiffStaggered(category, candidates, selected, hasExplicitSkip);
        }
    }

    function startLocalSequentialSuggestions(modelName, categories = []) {
        const orderedCategories = Array.from(new Set((categories || []).filter((category) => typeof category === "string" && category.trim())));
        state.localSequentialActive = true;

        // Only set queued status for categories that will actually be queried;
        // preserve existing statuses (done, http_error, etc.) for other categories
        // so their suggestion rows remain intact.
        orderedCategories.forEach((category) => {
            state.localSequentialStatusByCategory[category] = "queued";
            setCategoryFinalLLMResult(category, false);
        });

        state.suggestionsVisible = true;
        state.suggestionsModelName = modelName || "";

        // Merge new categories into the existing suggestionsCategories list
        // (preserving order of existing ones, appending new ones at the end).
        const existingSet = new Set(state.suggestionsCategories || []);
        const merged = [...(state.suggestionsCategories || [])];
        orderedCategories.forEach((category) => {
            if (!existingSet.has(category)) {
                merged.push(category);
                existingSet.add(category);
            }
        });
        state.suggestionsCategories = merged;

        // Ensure the rows container exists; create only if missing.
        // Use a dedicated class so we never accidentally reuse the Quick Start
        // placeholder div (which is also a direct child div but has display:flex
        // without flex-direction:column, causing rows to lay out horizontally).
        let rowsContainer = suggestionsContent.querySelector(".dsp-ai-presets-rows-container");
        if (!rowsContainer) {
            suggestionsContent.innerHTML = `<div class="dsp-ai-presets-rows-container"></div>`;
            rowsContainer = suggestionsContent.querySelector(".dsp-ai-presets-rows-container");
        }

        // Add row elements only for categories that don't have one yet.
        merged.forEach((category) => {
            let row = getLocalSequentialRowElement(category);
            if (!row) {
                row = document.createElement("div");
                row.className = "dsp-ai-presets-suggestion-row";
                row.setAttribute("data-category", category);
                rowsContainer.appendChild(row);
            }
        });

        updateViewJsonButton();

        // Re-render all rows (queued categories show "Pending", existing ones keep their chips).
        merged.forEach((category) => {
            renderLocalSequentialSuggestionRow(category);
        });
    }

    function setLocalSequentialCategoryStatus(category, status) {
        if (!state.localSequentialActive) return;
        const prevStatus = state.localSequentialStatusByCategory[category];
        state.localSequentialStatusByCategory[category] = status;
        setCategoryFinalLLMResult(category, status === "done" || status === "no_results");
        // Track completed categories and progress only when a terminal state is reached.
        const isTerminal = status === "done" || status === "no_results" || status === "http_error" || status === "timeout" || status === "cancelled" || status === "omitted";
        const wasTerminal = prevStatus === "done" || prevStatus === "no_results" || prevStatus === "http_error" || prevStatus === "timeout" || prevStatus === "cancelled" || prevStatus === "omitted";
        if (isTerminal && !wasTerminal && state.progressTotal > 0) {
            state.completedCount += 1;
            state.progressDone = Math.min(state.progressDone + 1, state.progressTotal);
            setStatusBarProgress((state.progressDone / state.progressTotal) * 100);
        } else if (isTerminal && !wasTerminal) {
            state.completedCount += 1;
        }
        // Track with-results count: increments when a category finishes with valid candidates
        if (status === "done" && prevStatus !== "done") {
            state.withResultsCount += 1;
        }
        // Track failed count: increments when a category transitions to a terminal error.
        if ((status === "http_error" || status === "timeout") && prevStatus !== "http_error" && prevStatus !== "timeout") {
            state.failedCount += 1;
        }
        const shouldStaggerCandidates = status === "done" && prevStatus !== "done";
        renderLocalSequentialSuggestionRow(category, { staggerCandidates: shouldStaggerCandidates });
        if (isTerminal) updateHeaderRefineLabel();
    }

    /**
     * Enqueue a category during an active run.
     * Returns true if the category was added, false if already in queue.
     */
    function enqueueCategory(category) {
        if (!state.localSequentialActive || !state.runQueueIsRunning) return false;
        // Deduplicate: reject if already in queue in any state
        if (state.runQueue.includes(category)) return false;

        // Add to queue and state tracking
        state.runQueue.push(category);
        state.localSequentialStatusByCategory[category] = "queued";
        setCategoryFinalLLMResult(category, false);
        state.suggestionsCategories.push(category);

        // Update progress total (fill may move backward - expected)
        state.progressTotal = state.runQueue.length;
        setStatusBarProgress(state.progressTotal > 0 ? (state.progressDone / state.progressTotal) * 100 : 0);

        // Create and append the placeholder row
        const rowsContainer = suggestionsContent.querySelector("div");
        if (rowsContainer) {
            const row = document.createElement("div");
            row.className = "dsp-ai-presets-suggestion-row";
            row.setAttribute("data-category", category);
            rowsContainer.appendChild(row);
            renderLocalSequentialSuggestionRow(category);
        }

        return true;
    }

    /**
     * Dequeue a category that is still in "queued" status during an active run.
     * Returns true if the category was removed, false otherwise.
     */
    function dequeueCategory(category) {
        if (!state.localSequentialActive || !state.runQueueIsRunning) return false;
        const status = state.localSequentialStatusByCategory[category];
        if (status !== "queued") return false;

        // Remove from queue
        const idx = state.runQueue.indexOf(category);
        if (idx === -1) return false;
        state.runQueue.splice(idx, 1);

        // Clean up state
        delete state.localSequentialStatusByCategory[category];
        delete state.categoryHasFinalLLMResult[category];
        const catIdx = state.suggestionsCategories.indexOf(category);
        if (catIdx !== -1) state.suggestionsCategories.splice(catIdx, 1);
        delete state.stagedCandidates[category];
        delete state.categoryHttpError[category];
        state.suggestionsErrorCategories.delete(category);

        // Update progress total (fill may move forward - expected)
        state.progressTotal = state.runQueue.length;
        setStatusBarProgress(state.progressTotal > 0 ? (state.progressDone / state.progressTotal) * 100 : 0);
        clearLocalSequentialChipTimer(category);

        // Remove the placeholder row
        const row = getLocalSequentialRowElement(category);
        if (row) row.remove();
        syncSuggestionsEmptyState();

        return true;
    }

    function updateLocalSequentialRawJson(rawRepliesByCategory = {}) {
        state.suggestionsRawJson = JSON.stringify(rawRepliesByCategory || {}, null, 2);
        updateViewJsonButton();
    }

    function renderSuggestionCandidates(modelName, candidateMap, warningLines = [], rawJsonText = "", normalizedNotes = [], options = {}) {
        invalidateLocalSequentialChipRendering();
        state.localSequentialActive = false;
        state.localSequentialStatusByCategory = {};

        const errorCategories = new Set(Array.isArray(options.errorCategories) ? options.errorCategories : []);
        // Always show all categories that have results - never filter by scopedCategories.
        // scopedCategories controls what gets sent to the LLM, not what is displayed.
        const categories = Array.isArray(options.categories)
            ? Array.from(new Set(options.categories.filter((category) => typeof category === "string" && category.trim())))
            : Object.keys(candidateMap || {}).sort();

        state.suggestionsVisible = true;
        state.suggestionsModelName = modelName || "";
        state.suggestionsRawJson = rawJsonText || "";
        state.suggestionsWarnings = Array.isArray(warningLines) ? warningLines : [];
        state.suggestionsNotes = Array.isArray(normalizedNotes) ? normalizedNotes : [];
        state.suggestionsCategories = categories;
        state.suggestionsErrorCategories = errorCategories;

        const warningBlock = state.suggestionsWarnings.length > 0
            ? `<div style="margin-top:4px;color:var(--styler-text-muted);">${escapeHtml(state.suggestionsWarnings.join(" | "))}</div>`
            : "";

        const noteBlock = state.suggestionsNotes.length > 0
            ? `<div style="margin-top:4px;">${escapeHtml(t("ai_styler.note.normalized_values", { count: state.suggestionsNotes.length, names: state.suggestionsNotes.join(", ") }))}</div>`
            : "";

        const sectionsHtml = state.suggestionsCategories.map((category) => {
            const rawCandidates = (candidateMap[category] || []).slice(0, MAX_MODEL_CANDIDATES_PER_CATEGORY);
            // Normalize candidates to {name, score?} format
            const candidates = rawCandidates.map((item) => {
                if (typeof item === "string") return { name: item, score: null };
                if (item && typeof item.name === "string") return { name: item.name, score: (typeof item.score === "number" ? item.score : null) };
                return null;
            }).filter(Boolean);

            const hasKey = Object.prototype.hasOwnProperty.call(state.stagedSelection, category);
            const hasExplicitSkip = (hasKey && state.stagedSelection[category] === null) || state.stagedSkipSet.has(category);
            const isError = state.suggestionsErrorCategories.has(category);
            const stagedSelectedName = hasKey && typeof state.stagedSelection[category] === "string"
                ? state.stagedSelection[category]
                : null;

            if (stagedSelectedName && !hasExplicitSkip) {
                const stagedSelectedNorm = normalizeStyleName(stagedSelectedName);
                const alreadyListed = candidates.some((candidate) => normalizeStyleName(candidate.name) === stagedSelectedNorm);
                if (!alreadyListed) {
                    candidates.unshift({ name: stagedSelectedName, score: null });
                }
            }

            let selected = null;
            if (stagedSelectedName) {
                selected = stagedSelectedName;
            } else if (!hasExplicitSkip && candidates.length > 0) {
                selected = candidates[0].name;
            }

            const candidatePills = candidates.map((candidate) => {
                const name = candidate.name;
                const score = candidate.score;
                const isSelected = selected === name && !hasExplicitSkip;
                const promptTooltip = getStylePromptTooltip(category, name);
                const tooltipAttr = promptTooltip ? ` title="${escapeHtml(promptTooltip)}"` : "";
                const scoreBadge = buildScoreBadgeHtml(score);

                return `
                    <button
                        type="button"
                        class="dsp-ai-presets-candidate-pill"
                        data-category="${escapeHtml(category)}"
                        data-value="${escapeHtml(name)}"
                        aria-pressed="${isSelected ? "true" : "false"}"
                        ${tooltipAttr}
                        style="
                            border:1px solid ${isSelected ? "var(--styler-primary-bg)" : "color-mix(in srgb, var(--styler-border) 60%, transparent)"};
                            background:${isSelected ? "var(--styler-primary-bg)" : "var(--styler-input-bg)"};
                            color:${isSelected ? "var(--styler-primary-text)" : "var(--styler-text)"};
                        "
                    >${escapeHtml(name)}${scoreBadge}</button>
                `;
            }).join("");

            const errorPill = `
                <span
                    class="dsp-ai-presets-candidate-error"
                    title="${t("ai_styler.error.style_resolution_failed", { category: escapeHtml(category) })}"
                    style="
                        width:20px;
                        height:20px;
                        min-width:20px;
                        flex:0 0 auto;
                        border:none;
                        border-radius:3px;
                        padding:0;
                        font-size:12px;
                        font-weight:bold;
                        font-family:Arial, sans-serif;
                        line-height:1;
                        display:inline-flex;
                        align-items:center;
                        justify-content:center;
                        background:transparent;
                        color:var(--styler-error);
                        opacity:0.7;
                    "
                >!</span>
            `;

            const trailingControl = isError ? errorPill : "";
            const categoryLabel = getSuggestionCategoryLabelHtml(category);

            const hasSelection = selected !== null && !hasExplicitSkip;

            return `
                <div
                    class="dsp-ai-presets-suggestion-row"
                    data-category="${escapeHtml(category)}"
                    data-has-selection="${hasSelection ? "true" : "false"}"
                    style="
                        display:grid;
                        grid-template-columns:auto 1fr auto;
                        align-items:center;
                        gap:10px;
                        margin:0;
                        padding:4px 8px;
                        transition:background 100ms ease-out;
                        min-height:28px;
                    "
                >
                    ${categoryLabel}
                    <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;min-width:0;">
                        ${candidatePills || `<span style="font-size:11px;color:var(--styler-text-muted);font-family:Arial,sans-serif;">${t("ai_styler.suggestions.no_suggestions")}</span>`}
                    </div>
                    <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">${trailingControl}</div>
                </div>
            `;
        }).join("");

        suggestionsContent.innerHTML = `
            <div class="dsp-ai-presets-rows-container" style="display:flex;flex-direction:column;gap:2px;margin:0;padding:0;">${sectionsHtml || buildSuggestionsQuickStartHtml()}</div>
            ${noteBlock}
            ${warningBlock}
        `;

        updateViewJsonButton();

        suggestionsContent.querySelectorAll(".dsp-ai-presets-candidate-pill").forEach((pill) => {
            const isSelected = pill.getAttribute("aria-pressed") === "true";
            pill.addEventListener("mouseenter", () => {
                if (!isSelected) {
                    pill.style.background = "color-mix(in srgb, var(--styler-primary-bg) 28%, var(--styler-panel-bg-secondary))";
                }
            });
            pill.addEventListener("mouseleave", () => {
                if (!isSelected) {
                    pill.style.background = "var(--styler-input-bg)";
                }
            });
            pill.addEventListener("click", () => {
                const category = pill.getAttribute("data-category") || "";
                const value = pill.getAttribute("data-value") || "";
                if (!category || !value) return;
                const isCurrentlySelected = pill.getAttribute("aria-pressed") === "true";
                handleSuggestionChipSelection(category, value, isCurrentlySelected);
                // Targeted update: refresh only the pills in this category row
                const row = pill.closest(".dsp-ai-presets-suggestion-row");
                if (!row) return;
                const newSelected = isCurrentlySelected ? null : value;
                row.querySelectorAll(".dsp-ai-presets-candidate-pill").forEach((p) => {
                    const pValue = p.getAttribute("data-value") || "";
                    const shouldSelect = newSelected !== null && pValue === newSelected;
                    p.setAttribute("aria-pressed", shouldSelect ? "true" : "false");
                    p.style.border = `1px solid ${shouldSelect ? "var(--styler-primary-bg)" : "color-mix(in srgb, var(--styler-border) 60%, transparent)"}`;
                    p.style.background = shouldSelect ? "var(--styler-primary-bg)" : "var(--styler-input-bg)";
                    p.style.color = shouldSelect ? "var(--styler-primary-text)" : "var(--styler-text)";
                });
                row.setAttribute("data-has-selection", newSelected !== null ? "true" : "false");
                renderFromStaged();
            });
        });

        // Row hover - subtle sidebar-style highlight
        suggestionsContent.querySelectorAll(".dsp-ai-presets-suggestion-row").forEach((row) => {
            row.addEventListener("mouseenter", () => {
                row.style.background = AI_PRESETS_QUERYING_ROW_BG;
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = "";
            });
        });
    }

    function renderSelectionError(modelName, heading, lines = [], parsedObject = null, extractedText = "", rawReply = "") {
        const detailsHtml = lines.length > 0
            ? `<ul style="margin:6px 0 8px 16px;padding:0;">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
            : "";

        const parsedSection = parsedObject
            ? `<details open><summary>${t("ai_styler.debug.parsed_json")}</summary><pre>${escapeHtml(JSON.stringify(parsedObject, null, 2))}</pre></details>`
            : "";

        const extractedSection = extractedText
            ? `<details><summary>${t("ai_styler.debug.extracted_json")}</summary><pre>${escapeHtml(extractedText)}</pre></details>`
            : "";

        const rawSection = rawReply
            ? `<details><summary>${t("ai_styler.debug.raw_reply")}</summary><pre>${escapeHtml(rawReply)}</pre></details>`
            : "";

        const errorHtml = `
            <div style="margin-bottom:8px;padding:8px;border-radius:var(--styler-card-radius);background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.3);">
                <div><strong>${t("ai_styler.error.prefix")}</strong> ${escapeHtml(heading)}</div>
                ${detailsHtml}
                ${parsedSection}
                ${extractedSection}
                ${rawSection}
            </div>
        `;

        // Prepend the error to existing suggestions content instead of replacing
        // so that persistent suggestion rows are not destroyed.
        const existingRows = suggestionsContent.querySelector("div");
        if (existingRows && state.suggestionsVisible) {
            existingRows.insertAdjacentHTML("beforebegin", errorHtml);
        } else {
            suggestionsContent.innerHTML = errorHtml;
        }
    }

    function getSafeSelectorValue(value) {
        const raw = String(value || "");
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
            return CSS.escape(raw);
        }
        return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function getSidebarSelectionLabelElement(category) {
        if (!categoryList || !category) return null;
        const safeCategory = getSafeSelectorValue(category);
        return categoryList.querySelector(`.dsp-category-btn[data-category="${safeCategory}"] .dsp-category-selection-label`);
    }

    function setSidebarSelectionLabelText(category, text) {
        const labelEl = getSidebarSelectionLabelElement(category);
        if (!labelEl) return;
        labelEl.textContent = text || "";
        labelEl.title = text || "";
        if (text) {
            labelEl.setAttribute("data-active-typing-id", "0");
        } else {
            labelEl.removeAttribute("data-active-typing-id");
        }
    }

    function cancelSidebarChipTypingForCategory(category) {
        if (!category) return;
        const nextVersion = (state.sidebarTypingVersionByCategory[category] || 0) + 1;
        state.sidebarTypingVersionByCategory[category] = nextVersion;
        state.sidebarTypingQueue = state.sidebarTypingQueue.filter((task) => task.category !== category);
    }

    function stopSidebarChipTypingForCurrentRun() {
        state.sidebarTypingRunToken += 1;

        if (state.sidebarTypingActiveTask) {
            setSidebarSelectionLabelText(state.sidebarTypingActiveTask.category, state.sidebarTypingActiveTask.finalText);
        }

        state.sidebarTypingQueue.forEach((task) => {
            setSidebarSelectionLabelText(task.category, task.finalText);
        });

        state.sidebarTypingQueue = [];
        state.sidebarTypingActiveTask = null;
        state.sidebarTypingIsProcessing = false;
    }

    function enqueueSidebarChipTyping(category, finalText, contextRunToken = state.sidebarTypingRunToken) {
        const normalizedText = String(finalText || "");
        if (!category || !normalizedText) return;

        const nextVersion = (state.sidebarTypingVersionByCategory[category] || 0) + 1;
        state.sidebarTypingVersionByCategory[category] = nextVersion;

        state.sidebarTypingQueue = state.sidebarTypingQueue.filter((task) => task.category !== category);
        state.sidebarTypingQueue.push({
            category,
            finalText: normalizedText,
            contextRunToken,
            typingVersion: nextVersion,
        });

        processSidebarChipTypingQueue();
    }

    async function typeTextIntoElement(element, text, options = {}) {
        const finalText = String(text || "");
        const charDelayMs = Number(options.charDelayMs) > 0 ? Number(options.charDelayMs) : SIDEBAR_CHIP_TYPE_CHAR_DELAY_MS;
        const contextRunToken = options.contextRunToken;
        const category = options.category;
        const typingVersion = options.typingVersion;

        element.textContent = "";
        element.title = finalText;
        element.setAttribute("data-active-typing-id", String(typingVersion));

        for (let idx = 1; idx <= finalText.length; idx += 1) {
            if (contextRunToken !== state.sidebarTypingRunToken) return;
            if ((state.sidebarTypingVersionByCategory[category] || 0) !== typingVersion) return;

            const liveElement = getSidebarSelectionLabelElement(category);
            if (!liveElement) return;

            if (liveElement.getAttribute("data-active-typing-id") !== String(typingVersion)) {
                liveElement.setAttribute("data-active-typing-id", String(typingVersion));
            }

            liveElement.textContent = finalText.slice(0, idx);
            liveElement.title = finalText;

            if (idx < finalText.length) {
                await sleep(charDelayMs);
            }
        }

        const finalElement = getSidebarSelectionLabelElement(category);
        if (!finalElement) return;
        if (contextRunToken !== state.sidebarTypingRunToken) return;
        if ((state.sidebarTypingVersionByCategory[category] || 0) !== typingVersion) return;

        finalElement.textContent = finalText;
        finalElement.title = finalText;
        finalElement.removeAttribute("data-active-typing-id");
    }

    async function processSidebarChipTypingQueue() {
        if (state.sidebarTypingIsProcessing) return;
        state.sidebarTypingIsProcessing = true;

        try {
            while (state.sidebarTypingQueue.length > 0) {
                const task = state.sidebarTypingQueue.shift();
                if (!task) continue;
                if (task.contextRunToken !== state.sidebarTypingRunToken) continue;

                state.sidebarTypingActiveTask = task;

                const element = getSidebarSelectionLabelElement(task.category);
                if (element) {
                    await typeTextIntoElement(element, task.finalText, {
                        charDelayMs: SIDEBAR_CHIP_TYPE_CHAR_DELAY_MS,
                        contextRunToken: task.contextRunToken,
                        category: task.category,
                        typingVersion: task.typingVersion,
                    });
                }

                state.sidebarTypingActiveTask = null;

                if (state.sidebarTypingQueue.length > 0) {
                    await sleep(SIDEBAR_CHIP_TYPE_STAGGER_MS);
                }
            }
        } finally {
            state.sidebarTypingActiveTask = null;
            state.sidebarTypingIsProcessing = false;
        }
    }

    function cloneSelection(selection) {
        return { ...(selection || {}) };
    }

    function setStagedSelection(nextSelection) {
        state.stagedSelection = cloneSelection(nextSelection);
    }

    function computeHeaderRefineLabel() {
        return t("ai_styler.btn.refine_menu.label");
    }

    function updateHeaderRefineLabel() {
        if (headerRefineBtn && headerRefineBtn.isConnected) {
            headerRefineBtn.textContent = computeHeaderRefineLabel() + " \u25BC";
        }
    }

    function updateSelectedCountBadge() {
        const selectedCount = Object.keys(state.stagedSelection).filter((key) => state.stagedSelection[key]).length;
        const hasActiveStyles = selectedCount > 0;
        selectedCountBadge.firstChild.textContent = `${hasActiveStyles ? formatStylesActiveChipText(selectedCount) : t("ai_styler.badge.no_styles_active")} `;
        selectedCountBadge.classList.toggle("is-active", hasActiveStyles);
        clearAllBtn.classList.toggle("is-inactive", !hasActiveStyles);
        clearAllBtn.disabled = !hasActiveStyles;
        if (hasActiveStyles) {
            clearAllBtn.title = t("ai_styler.btn.clear_all.title");
            clearAllBtn.setAttribute("aria-label", t("ai_styler.btn.clear_all.aria_label"));
            clearAllBtn.removeAttribute("aria-hidden");
            clearAllBtn.removeAttribute("tabindex");
        } else {
            clearAllBtn.removeAttribute("title");
            clearAllBtn.removeAttribute("aria-label");
            clearAllBtn.setAttribute("aria-hidden", "true");
            clearAllBtn.setAttribute("tabindex", "-1");
        }
        updateHeaderRefineLabel();
    }

    function hasRunningProcess() {
        return state.isGenerating || state.runQueueIsRunning || state.refiningCategories.size > 0 || state.batchRefineRunning;
    }

    function syncSuggestionsFromSidebarState() {
        if (state.suggestionsManuallyCleared) return;
        if (hasRunningProcess()) {
            state.pendingSidebarSync = true;
            return;
        }

        const selectedCategories = getScopedCategoriesInSidebarOrder();
        const selectedSet = new Set(selectedCategories);

        Object.keys(state.stagedCandidates || {}).forEach((category) => {
            if (!selectedSet.has(category)) {
                delete state.stagedCandidates[category];
            }
        });
        Object.keys(state.categoryHttpError || {}).forEach((category) => {
            if (!selectedSet.has(category)) {
                delete state.categoryHttpError[category];
            }
        });
        state.suggestionsErrorCategories = new Set(
            Array.from(state.suggestionsErrorCategories || []).filter((category) => selectedSet.has(category))
        );
        // Always clean up localSequential status for removed categories
        Object.keys(state.localSequentialStatusByCategory || {}).forEach((category) => {
            if (!selectedSet.has(category)) {
                delete state.localSequentialStatusByCategory[category];
                delete state.categoryHasFinalLLMResult[category];
                clearLocalSequentialChipTimer(category);
            }
        });

        if (selectedCategories.length === 0) {
            // No scoped categories — keep existing suggestion rows intact.
            // Only update the view-JSON button; never clear suggestionsVisible,
            // suggestionsCategories, or suggestionsContent here.
            updateViewJsonButton();
            return;
        }

        // Always use incremental (localSequential) rendering to avoid full
        // innerHTML replacement that destroys chip styles and event handlers.
        if (!state.localSequentialActive) {
            state.localSequentialActive = true;
            invalidateLocalSequentialChipRendering();
        }

        state.suggestionsVisible = true;
        state.suggestionsCategories = selectedCategories.slice();

        let rowsContainer = suggestionsContent.querySelector("div");
        if (!rowsContainer) {
            suggestionsContent.innerHTML = `<div class="dsp-ai-presets-rows-container"></div>`;
            rowsContainer = suggestionsContent.querySelector("div");
        }
        if (!rowsContainer) {
            updateViewJsonButton();
            return;
        }

        Array.from(rowsContainer.querySelectorAll(".dsp-ai-presets-suggestion-row[data-category]")).forEach((row) => {
            const category = row.getAttribute("data-category") || "";
            if (!selectedSet.has(category)) {
                row.remove();
            }
        });

        selectedCategories.forEach((category) => {
            if (!Object.prototype.hasOwnProperty.call(state.stagedCandidates, category)) {
                state.stagedCandidates[category] = [];
            }
            if (!Object.prototype.hasOwnProperty.call(state.localSequentialStatusByCategory, category)) {
                let nextStatus = "no_results";
                if (state.categoryHttpError?.[category]) {
                    nextStatus = /^timeout$/i.test(state.categoryHttpError[category]) ? "timeout" : "http_error";
                } else if (state.suggestionsErrorCategories.has(category)) {
                    nextStatus = "http_error";
                } else if ((state.stagedCandidates?.[category] || []).length > 0) {
                    nextStatus = "done";
                }
                state.localSequentialStatusByCategory[category] = nextStatus;
            }

            let row = getLocalSequentialRowElement(category);
            if (!row) {
                row = document.createElement("div");
                row.className = "dsp-ai-presets-suggestion-row";
                row.setAttribute("data-category", category);
            }

            rowsContainer.appendChild(row);
            renderLocalSequentialSuggestionRow(category);
        });

        updateViewJsonButton();
    }

    /**
     * Auto-populate Suggestions panel with all sidebar categories that already
     * have an applied style.  Called once on activation (Req #2).
     * For each category, if a style is applied, a "current style" chip is
     * injected into its stagedCandidates so the row shows the applied value
     * immediately (Req #3).
     */
    function autoPopulateSuggestionsFromSidebar() {
        if (state.suggestionsManuallyCleared) return;
        const styledCategories = Object.keys(state.stagedSelection || {}).filter(
            (key) => typeof state.stagedSelection[key] === "string" && state.stagedSelection[key]
        );
        if (styledCategories.length === 0) return;

        let changed = false;
        const existingCatSet = new Set(state.suggestionsCategories || []);

        styledCategories.forEach((category) => {
            // Scope the category so it shows as active in the sidebar
            if (!state.scopedCategories.has(category)) {
                state.scopedCategories.add(category);
            }

            // Add to suggestionsCategories if not already there
            if (!existingCatSet.has(category)) {
                state.suggestionsCategories.push(category);
                existingCatSet.add(category);
                setCategoryFinalLLMResult(category, false);
                changed = true;
            }

            // Inject the current applied style as the first candidate chip (Req #3)
            const appliedStyle = state.stagedSelection[category];
            if (appliedStyle) {
                const existing = state.stagedCandidates[category] || [];
                const alreadyHas = existing.some((item) => {
                    const name = typeof item === "string" ? item : item?.name;
                    return name === appliedStyle;
                });
                if (!alreadyHas) {
                    state.stagedCandidates[category] = [{ name: appliedStyle, score: null }, ...existing];
                    changed = true;
                }
            }

            // Set status to done so the row renders with chips
            if (!state.localSequentialStatusByCategory[category]) {
                state.localSequentialStatusByCategory[category] = "done";
                changed = true;
            }
        });

        if (changed) {
            state.suggestionsVisible = true;
            state.localSequentialActive = true;
            renderFromStaged();
            syncSuggestionsFromSidebarState();
        }
    }

    function addCategoriesToSuggestions(categoriesToAdd) {
        if (!Array.isArray(categoriesToAdd) || categoriesToAdd.length === 0) return;

        let changed = false;
        const existingCatSet = new Set(state.suggestionsCategories || []);

        categoriesToAdd.forEach((category) => {
            if (!category || existingCatSet.has(category)) return;

            state.suggestionsCategories.push(category);
            existingCatSet.add(category);
            changed = true;

            // Scope the category in the sidebar
            if (!state.scopedCategories.has(category)) {
                state.scopedCategories.add(category);
            }

            // Inject applied style chip if a style is already selected
            const appliedStyle = state.stagedSelection[category];
            if (appliedStyle) {
                upsertCurrentStyleCandidate(category, appliedStyle);
            }

            // Set status to done so the row renders
            if (!state.localSequentialStatusByCategory[category]) {
                state.localSequentialStatusByCategory[category] = "done";
            }
        });

        if (changed) {
            state.suggestionsVisible = true;
            state.localSequentialActive = true;
            renderLocalSequentialRowsFromState();
            renderFromStaged();
            updateViewJsonButton();
        }
    }

    function clearSuggestionsList() {
        state.suggestionsCategories = [];
        state.stagedCandidates = {};
        state.suggestionsVisible = false;
        state.localSequentialActive = false;
        state.localSequentialStatusByCategory = {};
        state.categoryHasFinalLLMResult = {};
        state.categoryHttpError = {};
        state.suggestionsErrorCategories = new Set();
        state.suggestionsWarnings = [];
        state.suggestionsNotes = [];
        state.suggestionsRawJson = "";
        setInlinePromptError("");

        // Golden rule: sidebar scope ↔ suggestions list must stay in sync.
        // Clearing suggestions means no category should remain scoped.
        state.scopedCategories.clear();

        // Mark that the user explicitly cleared suggestions.
        // Blocks all automatic re-population paths (autoPopulate on tab switch,
        // syncSuggestionsFromSidebarState via render) until the user explicitly
        // adds categories via the Add menu or triggers a new Query/Refine run.
        state.suggestionsManuallyCleared = true;

        suggestionsContent.innerHTML = "";
        setSuggestionText(state.suggestionText || "Results will appear here.");
        renderFromStaged();
        updateViewJsonButton();
        captureModuleSnapshot();
    }

    function toggleScopeCategory(category) {
        const wasScoped = state.scopedCategories.has(category);
        if (wasScoped) {
            state.scopedCategories.delete(category);
        } else {
            state.scopedCategories.add(category);
        }

        renderFromStaged();

        if (wasScoped) {
            // Un-scoping → remove from suggestions immediately, unless the
            // category is currently being queried/refined.
            if (state.suggestionsCategories.includes(category)) {
                const isCategoryBusy =
                    state.refiningCategories.has(category) ||
                    (state.isGenerating && state.activeCategory === category) ||
                    state.localSequentialStatusByCategory[category] === "running";

                if (!isCategoryBusy) {
                    state.suggestionsCategories = state.suggestionsCategories.filter((c) => c !== category);
                    delete state.stagedCandidates[category];
                    delete state.localSequentialStatusByCategory[category];
                    delete state.categoryHasFinalLLMResult[category];
                    delete state.categoryHttpError[category];
                    state.suggestionsErrorCategories.delete(category);
                    clearLocalSequentialChipTimer(category);
                    const row = getLocalSequentialRowElement(category);
                    if (row) row.remove();
                }
            }
        } else {
            // Scoping is always user-initiated (only reachable via the sidebar
            // category button click handler in renderFromStaged).
            // A new manual selection lifts the "cleared" guard so the category
            // is added to Suggestions immediately, satisfying the requirement
            // that manual selections after Clear do repopulate Suggestions.
            state.suggestionsManuallyCleared = false;
            addCategoriesToSuggestions([category]);
        }

        updateViewJsonButton();
    }

    function renderFromStaged() {
        const categoriesMap = {};
        state.styleIndex.forEach((item) => {
            if (!categoriesMap[item.category]) categoriesMap[item.category] = [];
            categoriesMap[item.category].push(item);
        });
        const categories = Object.keys(categoriesMap).sort();
        const previousLabelsByCategory = state.sidebarSelectionLabelByCategory || {};
        const nextLabelsByCategory = {};
        const changedLabels = [];

        categoryList.innerHTML = "";
        const density = computeCategoryDensity(categoryList.clientHeight, Math.max(1, categories.length));

        categories.forEach((category) => {
            const isScoped = state.scopedCategories.has(category);
            const selectedStyleName = state.stagedSelection[category] || null;
            const btn = makeCategoryBtn(
                category,
                selectedStyleName,
                isScoped,  // Show as active/selected when in scope
                density,
                selectedStyleName ? () => {
                    // Centralized: updates stagedSelection + stagedSkipSet, then
                    // either calls onSelectCallback (which triggers full render
                    // cycle including suggestions) or renderFromStaged (sidebar only).
                    setStagedCategorySelection(category, null);
                    // When no external callback, re-render suggestion row manually
                    // so the chip deselects in sync with the sidebar.
                    if (!onSelectCallback && state.suggestionsVisible && state.stagedCandidates[category]) {
                        renderLocalSequentialSuggestionRow(category);
                    }
                } : null,
                { showClearButton: !!selectedStyleName }
            );

            if (selectedStyleName) {
                const selectionLabel = btn.querySelector(".dsp-category-selection-label");
                const labelText = selectionLabel ? String(selectionLabel.textContent || "") : "";
                if (labelText) {
                    nextLabelsByCategory[category] = labelText;
                    if (state.sidebarTypingInitialized && previousLabelsByCategory[category] !== labelText) {
                        changedLabels.push({ category, labelText });
                    }
                }
            }

            // Click toggles scope (but not when clicking the clear X button)
            btn.addEventListener("click", (e) => {
                // Don't toggle scope if the clear button was clicked
                if (e.target.closest(".dsp-category-clear-btn")) return;
                toggleScopeCategory(category);
            });

            if (state.sidebarLoadingCategories.has(category)) {
                const spinner = document.createElement("span");
                spinner.textContent = "\u23F3";
                spinner.title = t("ai_styler.sidebar.loading_styles.title");
                spinner.style.flex = "0 0 auto";
                spinner.style.width = "18px";
                spinner.style.height = "18px";
                spinner.style.display = "inline-flex";
                spinner.style.alignItems = "center";
                spinner.style.justifyContent = "center";
                spinner.style.fontSize = "11px";
                spinner.style.lineHeight = "1";
                spinner.style.border = "1px solid var(--styler-border)";
                spinner.style.borderRadius = "999px";
                spinner.style.background = "var(--styler-input-bg)";
                spinner.style.color = "var(--styler-text-muted)";
                spinner.style.marginLeft = "4px";
                spinner.style.pointerEvents = "none";
                btn.appendChild(spinner);
            }
            categoryList.appendChild(btn);
        });

        updateSelectedCountBadge();

        if (state.sidebarTypingInitialized) {
            Object.keys(previousLabelsByCategory).forEach((category) => {
                if (!nextLabelsByCategory[category]) {
                    cancelSidebarChipTypingForCategory(category);
                }
            });
            // Always set labels instantly — the telex/typewriter effect has been
            // removed from the sidebar to prevent animation on restore/rehydrate.
            changedLabels.forEach(({ category, labelText }) => {
                setSidebarSelectionLabelText(category, labelText);
            });
        } else {
            state.sidebarTypingInitialized = true;
        }

        state.sidebarSelectionLabelByCategory = nextLabelsByCategory;
    }

    function updateModelStatus() {
        const currentModel = (state.selectedModel || modelSelect.value || "").trim();
        const provider = getCurrentProviderSnapshot(currentModel);
        if (provider === "openai" || provider === "anthropic" || provider === "groq" || provider === "gemini" || provider === "huggingface") {
            const hasKey = !!getProviderApiKeySnapshot(provider);
            modelStatus.style.display = hasKey ? "inline-flex" : "none";
            modelStatus.textContent = t("ai_styler.model_status.ready");
            modelStatus.style.background = "rgba(76, 175, 80, 0.15)";
            modelStatus.style.color = "rgb(76, 175, 80)";
            modelStatus.removeAttribute("title");
            return;
        }

        modelStatus.style.display = "inline-flex";
        if (state.connecting) {
            modelStatus.textContent = t("ai_styler.model_status.connecting");
            modelStatus.style.background = "rgba(128, 128, 128, 0.15)";
            modelStatus.style.color = "var(--styler-text-muted)";
            modelStatus.removeAttribute("title");
            return;
        }
        if (state.connected) {
            modelStatus.textContent = t("ai_styler.model_status.ready_caps");
            modelStatus.style.background = "rgba(76, 175, 80, 0.15)";
            modelStatus.style.color = "rgb(76, 175, 80)";
            modelStatus.removeAttribute("title");
            return;
        }

        modelStatus.textContent = t("ai_styler.model_status.not_running");
        modelStatus.style.background = "rgba(244, 67, 54, 0.12)";
        modelStatus.style.color = "var(--styler-error, #f44336)";
        if (state.error && state.error.includes("CORS")) {
            modelStatus.title = t("ai_styler.model_status.not_running_cors");
        } else {
            modelStatus.removeAttribute("title");
        }
    }

    function getProviderPricingState(providerOptionId) {
        if (providerOptionId === "openai" || providerOptionId === "anthropic") {
            return { label: t("ai_styler.pricing.no_free_tier"), isFreeTier: false };
        }
        if (providerOptionId === "gemini" || providerOptionId === "groq" || providerOptionId === "huggingface" || providerOptionId === "ollama_local" || providerOptionId === "ollama_cloud" || providerOptionId === "openrouter") {
            return { label: t("ai_styler.pricing.free_tier"), isFreeTier: true };
        }
        return null;
    }

    function updateProviderPricingBadge(providerOptionId) {
        const pricingState = getProviderPricingState(providerOptionId);
        if (!pricingState) {
            providerPricingBadge.style.display = "none";
            return;
        }
        providerPricingBadge.textContent = pricingState.label;
        providerPricingBadge.style.display = "inline-block";
        if (pricingState.isFreeTier) {
            providerPricingBadge.style.background = "rgba(76, 175, 80, 0.16)";
            providerPricingBadge.style.color = "rgb(76, 175, 80)";
        } else {
            providerPricingBadge.style.background = "rgba(255, 193, 7, 0.18)";
            providerPricingBadge.style.color = "#e6a700";
        }
    }

    function updateProviderBadge() {
        const model = state.selectedModel || "";
        const selectedProviderId = String(state.selectedProvider || providerSelect.value || getProviderOptionIdForModel(model) || "").trim();
        const resolvedProviderOptionId = String(getProviderOptionIdForModel(model) || selectedProviderId || "").trim();
        updateProviderPricingBadge(resolvedProviderOptionId);
        if (!model) {
            providerBadge.style.display = "none";
            warningBadge.style.display = "none";
            warningBadge.title = "";
            return;
        }

        if (!resolvedProviderOptionId) {
            providerBadge.style.display = "none";
            warningBadge.style.display = "none";
            warningBadge.title = "";
            return;
        }

        const isCloud = resolvedProviderOptionId !== "ollama_local";
        providerBadge.textContent = isCloud ? t("ai_styler.badge.provider.cloud") : t("ai_styler.badge.provider.local");
        providerBadge.style.display = "inline-block";

        if (isCloud) {
            providerBadge.style.background = "rgba(33, 150, 243, 0.15)";
            providerBadge.style.color = "rgb(33, 150, 243)";
            warningBadge.style.display = "none";
            warningBadge.title = "";
            return;
        } else {
            providerBadge.style.background = "rgba(156, 39, 176, 0.15)";
            providerBadge.style.color = "rgb(156, 39, 176)";
        }

        // Compatibility badge for local models
        const compat = model ? classifyLocalModel(model) : null;
        if (compat === "incompatible") {
            warningBadge.textContent = t("ai_styler.badge.model_warning.incompatible");
            warningBadge.title = t("ai_styler.badge.model_warning.incompatible.title", { model: RECOMMENDED_LOCAL_MODEL });
            warningBadge.style.display = "inline-block";
            warningBadge.style.background = "rgba(244, 67, 54, 0.15)";
            warningBadge.style.color = "var(--styler-error, #f44336)";
        } else if (compat === "not_recommended") {
            warningBadge.textContent = t("ai_styler.badge.model_warning.not_recommended");
            warningBadge.title = t("ai_styler.badge.model_warning.not_recommended.title", { model: RECOMMENDED_LOCAL_MODEL });
            warningBadge.style.display = "inline-block";
            warningBadge.style.background = "rgba(255, 193, 7, 0.18)";
            warningBadge.style.color = "#e6a700";
        } else {
            warningBadge.style.display = "none";
            warningBadge.title = "";
        }
    }

    function updateGenerateButton() {
        const selectedModel = (state.selectedModel || modelSelect.value || "").trim();
        const provider = getCurrentProviderSnapshot(selectedModel);
        const showCancelAction = state.isGenerating || isRefineProcessActive();
        updateSetupNotices();
        const isOpenAISelected = provider === "openai";
        const isAnthropicSelected = provider === "anthropic";
        const isGroqSelected = provider === "groq";
        const isGeminiSelected = provider === "gemini";
        const isHuggingFaceSelected = provider === "huggingface";
        const isOpenRouterSelected = provider === "openrouter";
        const isCloudApiSelected = isOpenAISelected || isAnthropicSelected || isGroqSelected || isGeminiSelected || isHuggingFaceSelected || isOpenRouterSelected;
        const providerHasApiKey = !isCloudApiSelected || !!getProviderApiKeySnapshot(provider);
        const hasSelectableModel = Array.from(modelSelect?.options || []).some(
            (option) => !option.disabled && String(option.value || "").trim()
        );
        
        // Disable/enable form controls
        promptInput.disabled = state.isGenerating;
        providerSelect.disabled = state.isGenerating;
        modelSelect.disabled = state.isGenerating || !hasSelectableModel;
        openaiKeyInput.disabled = state.isGenerating || !isOpenAISelected;
        openaiTestBtn.disabled = state.isGenerating || !isOpenAISelected || !providerHasApiKey;
        anthropicKeyInput.disabled = state.isGenerating || !isAnthropicSelected;
        anthropicTestBtn.disabled = state.isGenerating || !isAnthropicSelected || !providerHasApiKey;
        groqKeyInput.disabled = state.isGenerating || !isGroqSelected;
        groqTestBtn.disabled = state.isGenerating || !isGroqSelected || !providerHasApiKey;
        geminiKeyInput.disabled = state.isGenerating || !isGeminiSelected;
        geminiTestBtn.disabled = state.isGenerating || !isGeminiSelected || !providerHasApiKey;
        hfTokenInput.disabled = state.isGenerating || !isHuggingFaceSelected;
        hfTestBtn.disabled = state.isGenerating || !isHuggingFaceSelected || !providerHasApiKey;
        openrouterKeyInput.disabled = state.isGenerating || !isOpenRouterSelected;
        openrouterTestBtn.disabled = state.isGenerating || !isOpenRouterSelected || !providerHasApiKey;
        
        // Update button text and styling based on state
        if (showCancelAction) {
            generateBtn.disabled = false;  // Keep clickable to allow cancel
            generateBtn.textContent = t("ai_styler.btn.cancel_query.label");
            generateBtn.dataset.cancelMode = "true";
            generateBtn.style.opacity = "1";
            generateBtn.style.cursor = "pointer";
            // Danger background using theme error token; keep default border
            generateBtn.style.setProperty("background", "var(--styler-error)", "important");
            generateBtn.style.setProperty("color", "#fff", "important");
            generateBtn.style.borderColor = "var(--styler-border)";
            generateBtn.style.transition = "filter 120ms ease";
            // Hover: slightly lighter via brightness
            generateBtn.onmouseenter = () => {
                generateBtn.style.setProperty("filter", "brightness(1.15)", "important");
            };
            generateBtn.onmouseleave = () => {
            generateBtn.style.setProperty("filter", "none", "important");
            };
        } else {
            // Keep Query clickable and validate on click via toasts instead of disabling.
            generateBtn.disabled = false;
            generateBtn.textContent = t("ai_styler.btn.query.label");
            delete generateBtn.dataset.cancelMode;
            // Reset to normal styling
            generateBtn.style.removeProperty("background");
            generateBtn.style.removeProperty("color");
            generateBtn.style.removeProperty("border-color");
            generateBtn.style.removeProperty("filter");
            generateBtn.style.background = "";
            generateBtn.style.color = "";
            generateBtn.style.borderColor = "";
            generateBtn.style.filter = "";
            generateBtn.style.transition = "";
            generateBtn.onmouseenter = null;
            generateBtn.onmouseleave = null;
            generateBtn.style.opacity = "1";
            generateBtn.style.cursor = "pointer";
            // Restore default apply button styling
            generateBtn.style.background = "var(--styler-primary-bg)";
            generateBtn.style.color = "var(--styler-primary-text)";
            generateBtn.style.borderColor = "var(--styler-border)";
        }
        
        // Update input styling
        promptInput.style.opacity = promptInput.disabled ? "0.6" : "1";
        providerSelect.style.opacity = providerSelect.disabled ? "0.6" : "1";
        modelSelect.style.opacity = modelSelect.disabled ? "0.6" : "1";
        openaiKeyInput.style.opacity = openaiKeyInput.disabled ? "0.6" : "1";
        openaiTestBtn.style.opacity = openaiTestBtn.disabled ? "0.6" : "1";
        anthropicKeyInput.style.opacity = anthropicKeyInput.disabled ? "0.6" : "1";
        anthropicTestBtn.style.opacity = anthropicTestBtn.disabled ? "0.6" : "1";
        groqKeyInput.style.opacity = groqKeyInput.disabled ? "0.6" : "1";
        groqTestBtn.style.opacity = groqTestBtn.disabled ? "0.6" : "1";
        geminiKeyInput.style.opacity = geminiKeyInput.disabled ? "0.6" : "1";
        geminiTestBtn.style.opacity = geminiTestBtn.disabled ? "0.6" : "1";
        hfTokenInput.style.opacity = hfTokenInput.disabled ? "0.6" : "1";
        hfTestBtn.style.opacity = hfTestBtn.disabled ? "0.6" : "1";
        openrouterKeyInput.style.opacity = openrouterKeyInput.disabled ? "0.6" : "1";
        openrouterTestBtn.style.opacity = openrouterTestBtn.disabled ? "0.6" : "1";

        if (!state.isGenerating || !state.isLocalQueryRun) {
            hideOmitButton();
        }

        updateTabActivityIndicator();
    }

    function updateTabActivityIndicator() {
        // Find the tab bar container to animate its border
        const tabBar = container.querySelector(".dsp-tab-bar");

        // Clean up previous "busy" class on the tab button itself (revert to normal)
        const tabBtn = container.querySelector('.dsp-tab[data-tab="ai-presets"]');
        if (tabBtn) {
            tabBtn.classList.remove("dsp-tab-busy");
            const dot = tabBtn.querySelector(".dsp-ai-presets-tab-activity");
            if (dot) dot.remove();
        }

        if (!tabBar) return;

        // One-time cleanup of leftover DOM from earlier progress-track attempts
        const oldTrack = tabBar.querySelector(".dsp-modal-progress-track");
        if (oldTrack) oldTrack.remove();

        const active = hasBusyIndicatorWork();

        // Toggle the separator pulse on the tab bar container
        if (active) {
            tabBar.classList.add("dsp-tab-bar-pulse");
        } else {
            tabBar.classList.remove("dsp-tab-bar-pulse");
        }
    }

    function getProviderOptionDisplayName(providerId) {
        if (providerId === "openai") return t("ai_styler.provider.openai");
        if (providerId === "anthropic") return t("ai_styler.provider.anthropic");
        if (providerId === "groq") return t("ai_styler.provider.groq");
        if (providerId === "gemini") return t("ai_styler.provider.gemini");
        if (providerId === "huggingface") return t("ai_styler.provider.huggingface");
        if (providerId === "ollama_cloud") return t("ai_styler.provider.ollama_cloud");
        if (providerId === "ollama_local") return t("ai_styler.provider.ollama_local");
        return t("ai_styler.provider.fallback");
    }

    function normalizeDiscoveredModelList(models, providerId, fetchedAt = Date.now()) {
        return modelFns.normalizeDiscoveredModelList(models, providerId, fetchedAt);
    }

    function isOpenAIStylerHardExcluded(modelIdLower) {
        if (!modelIdLower) return true;
        return OPENAI_STYLER_EXCLUDED_TOKENS.some((token) => modelIdLower.includes(token));
    }

    function isOpenAIStylerLegacyExcluded(modelIdLower) {
        if (!modelIdLower) return true;
        return modelIdLower.startsWith("gpt-3.5")
            || modelIdLower.startsWith("gpt-3.5-turbo-instruct")
            || modelIdLower === "davinci-002"
            || modelIdLower === "babbage-002";
    }

    function isOpenAIStylerAllowedFamily(modelIdLower) {
        if (!modelIdLower) return false;
        return modelIdLower.startsWith("gpt-5")
            || modelIdLower.startsWith("gpt-4.1")
            || modelIdLower.startsWith("gpt-4o")
            || /^o\d/.test(modelIdLower);
    }

    function getOpenAISnapshotAlias(modelId) {
        const id = String(modelId || "").trim();
        const match = id.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/);
        if (!match) {
            return { alias: id, isSnapshot: false };
        }
        return { alias: match[1], isSnapshot: true };
    }

    function isOpenAIChatLatestAlias(modelIdLower) {
        return modelIdLower.endsWith("-chat-latest");
    }

    function isOpenAIAdvancedModel(modelIdLower) {
        return /^o\d/.test(modelIdLower);
    }

    function isOpenAIBudgetModel(modelIdLower) {
        return modelIdLower.includes("-mini") || modelIdLower.includes("-nano");
    }

    function pickPrioritizedModels(pool, priorityOrder, maxItems, selectedSet) {
        const byId = new Map(pool.map((entry) => [entry.id, entry]));
        const picked = [];

        priorityOrder.forEach((id) => {
            if (picked.length >= maxItems) return;
            if (selectedSet.has(id)) return;
            if (!byId.has(id)) return;
            picked.push(byId.get(id));
            selectedSet.add(id);
        });

        pool
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach((entry) => {
                if (picked.length >= maxItems) return;
                if (selectedSet.has(entry.id)) return;
                picked.push(entry);
                selectedSet.add(entry.id);
            });

        return picked;
    }

    function buildOpenAIStylerModelCatalog(rawModels) {
        return modelFns.buildOpenAIStylerModelCatalog(rawModels);
    }

    function resolveOpenAIModelForUI(modelId, openAiCatalog) {
        return modelFns.resolveOpenAIModelForUI(modelId, openAiCatalog);
    }

    function isGroqStylerHardExcluded(modelIdLower) {
        if (!modelIdLower) return true;
        return GROQ_STYLER_EXCLUDED_TOKENS.some((token) => modelIdLower.includes(token));
    }

    function isGroqStylerAllowedFamily(modelIdLower) {
        if (!modelIdLower) return false;
        return modelIdLower.startsWith("llama-3.3-70b-versatile")
            || modelIdLower.startsWith("qwen/qwen3-32b")
            || modelIdLower.startsWith("meta-llama/llama-4-maverick")
            || modelIdLower.startsWith("meta-llama/llama-4-scout")
            || modelIdLower.startsWith("moonshotai/kimi-k2-instruct")
            || modelIdLower.startsWith("llama-3.1-8b-instant")
            || modelIdLower.startsWith("groq/compound-mini")
            || modelIdLower.startsWith("groq/compound");
    }

    function getGroqSnapshotAlias(modelId) {
        const id = String(modelId || "").trim();
        if (/^moonshotai\/kimi-k2-instruct-\d+$/i.test(id)) {
            return { alias: "moonshotai/kimi-k2-instruct", isSnapshot: true };
        }
        const match = id.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/);
        if (match) {
            return { alias: match[1], isSnapshot: true };
        }
        return { alias: id, isSnapshot: false };
    }

    function buildGroqStylerModelCatalog(rawModels) {
        return modelFns.buildGroqStylerModelCatalog(rawModels);
    }

    function resolveGroqModelForUI(modelId, groqCatalog) {
        return modelFns.resolveGroqModelForUI(modelId, groqCatalog);
    }

    function normalizeGoogleModelId(modelId) {
        const raw = String(modelId || "").trim();
        if (!raw) return "";
        return raw.startsWith("models/") ? raw.slice(7) : raw;
    }

    function hasGeminiGenerateContentSupport(methods) {
        if (!Array.isArray(methods) || methods.length === 0) return true;
        return methods.some((method) => String(method || "").trim() === "generateContent");
    }

    function hasGeminiPredictSignature(methods) {
        if (!Array.isArray(methods) || methods.length === 0) return false;
        const normalized = methods.map((method) => String(method || "").trim()).filter(Boolean);
        return normalized.includes("predict") || normalized.includes("predictLongRunning");
    }

    function isGeminiBidiOnly(methods) {
        if (!Array.isArray(methods) || methods.length === 0) return false;
        const normalized = methods.map((method) => String(method || "").trim()).filter(Boolean);
        return normalized.includes("bidiGenerateContent") && !normalized.includes("generateContent");
    }

    function isGeminiPreviewOrLatestModel(modelIdLower) {
        if (!modelIdLower) return false;
        return modelIdLower.includes("-exp");
    }

    function isGeminiStylerHardExcluded(modelIdLower) {
        if (!modelIdLower) return true;
        return GEMINI_STYLER_EXCLUDED_TOKENS.some((token) => modelIdLower.includes(token));
    }

    function isGeminiStylerAllowedFamily(modelIdLower) {
        if (!modelIdLower) return false;
        if (modelIdLower.startsWith("gemma-")) return false;
        return modelIdLower.startsWith("gemini-");
    }

    function buildGoogleAiStylerModelCatalog(rawModels) {
        return modelFns.buildGoogleAiStylerModelCatalog(rawModels);
    }

    function resolveGeminiModelForUI(modelId, geminiCatalog) {
        return modelFns.resolveGeminiModelForUI(modelId, geminiCatalog);
    }

    function hasHuggingFaceExcludedKeyword(textValue) {
        const lower = String(textValue || "").toLowerCase();
        if (!lower) return false;
        return HUGGINGFACE_STYLER_EXCLUDED_KEYWORDS.some((token) => lower.includes(token));
    }

    function isHuggingFaceStylerModel(entry) {
        const id = String(entry?.modelId || entry?.id || "").trim();
        if (!id) return false;
        if (entry?.active === false) return false;

        const idLower = id.toLowerCase();
        if (hasHuggingFaceExcludedKeyword(idLower)) return false;

        const pipelineTag = String(entry?.pipeline_tag || "").trim().toLowerCase();
        if (pipelineTag && HUGGINGFACE_STYLER_EXCLUDED_PIPELINE_TAGS.has(pipelineTag)) return false;
        if (pipelineTag && HUGGINGFACE_STYLER_ALLOWED_PIPELINE_TAGS.has(pipelineTag)) return true;
        if (pipelineTag) return false;

        const tags = Array.isArray(entry?.tags)
            ? entry.tags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean)
            : [];
        if (tags.some((tag) => hasHuggingFaceExcludedKeyword(tag))) return false;

        const hasAllowedTag = tags.some((tag) =>
            HUGGINGFACE_STYLER_ALLOWED_TAG_KEYWORDS.some((keyword) => tag.includes(keyword))
        );
        if (hasAllowedTag) return true;

        return idLower.includes("instruct") || idLower.includes("chat");
    }

    function buildHuggingFaceStylerModelList(rawModels) {
        return modelFns.buildHuggingFaceStylerModelList(rawModels);
    }

    function registerDynamicProviderModels(providerId, models) {
        const targetSet = {
            openai: OPENAI_MODEL_SET,
            anthropic: ANTHROPIC_MODEL_SET,
            groq: GROQ_MODEL_SET,
            gemini: GEMINI_MODEL_SET,
            huggingface: HUGGINGFACE_MODEL_SET,
        }[providerId] || null;
        if (!targetSet) return;
        (models || []).forEach((entry) => {
            const id = String(entry?.id || "").trim();
            if (!id) return;
            targetSet.add(id);
        });
    }

    function loadProviderModelCacheEntry(providerId) {
        return modelFns.loadProviderModelCacheEntry(providerId, {
            getPersistedJSON,
        });
    }

    function persistProviderModelCacheEntry(providerId, models, fetchedAt = Date.now()) {
        return modelFns.persistProviderModelCacheEntry(
            {
                state,
                dynamicModelSetsByProvider: {
                    openai: OPENAI_MODEL_SET,
                    anthropic: ANTHROPIC_MODEL_SET,
                    groq: GROQ_MODEL_SET,
                    gemini: GEMINI_MODEL_SET,
                    huggingface: HUGGINGFACE_MODEL_SET,
                    openrouter: OPENROUTER_MODEL_SET,
                },
                setPersistedJSON,
            },
            providerId,
            models,
            fetchedAt
        );
    }

    function loadProviderModelCachesFromStorage() {
        return modelFns.loadProviderModelCachesFromStorage({
            state,
            dynamicModelSetsByProvider: {
                openai: OPENAI_MODEL_SET,
                anthropic: ANTHROPIC_MODEL_SET,
                groq: GROQ_MODEL_SET,
                gemini: GEMINI_MODEL_SET,
                huggingface: HUGGINGFACE_MODEL_SET,
                openrouter: OPENROUTER_MODEL_SET,
            },
            getPersistedJSON,
        });
    }

    function getModelsForProvider(providerId, builtInModels) {
        return modelFns.getModelsForProvider({ state }, providerId, builtInModels);
    }

    function updateModelRefreshButtonState() {
        const busy = !!state.refreshingProviderId;
        modelRefreshBtn.disabled = busy;
        modelRefreshBtn.textContent = busy ? t("ai_styler.btn.refresh_models.label_busy") : t("ai_styler.btn.refresh_models.label");
        modelRefreshBtn.title = busy ? t("ai_styler.btn.refresh_models.title_busy") : t("ai_styler.btn.refresh_models.title");
        modelRefreshBtn.setAttribute("aria-label", busy ? t("ai_styler.btn.refresh_models.title_busy") : t("ai_styler.btn.refresh_models.title"));
    }

    function extractDiscoveryErrorDetail(payload) {
        if (!payload || typeof payload !== "object") return "";
        const candidates = [
            payload?.error?.message,
            payload?.error?.detail,
            payload?.message,
            payload?.detail,
            typeof payload?.error === "string" ? payload.error : "",
        ];
        for (const candidate of candidates) {
            const value = String(candidate || "").trim();
            if (value) return value.replace(/\s+/g, " ");
        }
        return "";
    }

    async function fetchModelDiscoveryJson(url, headers = {}) {
        return modelFns.fetchModelDiscoveryJson(url, headers, fetch, getCurrentRequestTimeoutMsSnapshot());
    }

    async function discoverModelsForProvider(providerId) {
        return modelFns.discoverModelsForProvider(providerId, {
            getProviderApiKeySnapshot,
            ollamaFetchModels,
            requestTimeoutMs: getCurrentRequestTimeoutMsSnapshot(),
            fetchImpl: fetch,
        });
    }

    function getRefreshFailureMessage(err) {
        return modelFns.getRefreshFailureMessage(err);
    }

    async function refreshModelsForProvider(providerId) {
        if (!ensureOllamaLocalRunning({ providerOptionId: providerId })) {
            return;
        }
        return withBusyRequest(() => modelFns.refreshModelsForProvider({
            providerId,
            state,
            dynamicModelSetsByProvider: {
                openai: OPENAI_MODEL_SET,
                anthropic: ANTHROPIC_MODEL_SET,
                groq: GROQ_MODEL_SET,
                gemini: GEMINI_MODEL_SET,
                huggingface: HUGGINGFACE_MODEL_SET,
                openrouter: OPENROUTER_MODEL_SET,
            },
            providerSelectValue: providerSelect.value,
            modelSelectValue: modelSelect.value,
            getApiProviderForProviderOption,
            getProviderApiKeySnapshot,
            focusProviderApiKeyInput,
            showToast,
            updateModelRefreshButtonState,
            populateModelSelect,
            updateModelStatus,
            updateGenerateButton,
            requestTimeoutMs: getCurrentRequestTimeoutMsSnapshot(),
            setPersistedJSON,
            ollamaFetchModels,
            fetchImpl: fetch,
        }));
    }

    loadProviderModelCachesFromStorage();

    function buildProviderModelCatalog() {
        const localModels = state.connected
            ? state.models.filter((name) => typeof name === "string" && !name.endsWith("-cloud"))
            : [];
        const cloudModels = state.connected
            ? state.models.filter((name) => typeof name === "string" && name.endsWith("-cloud"))
            : [];

        const localEmptyLabel = state.connecting
            ? t("ai_styler.model_list.loading")
            : state.connected
                ? t("ai_styler.model_list.no_local_models")
                : t("ai_styler.model_list.ollama_not_running");
        const cloudEmptyLabel = state.connecting
            ? t("ai_styler.model_list.loading")
            : state.connected
                ? t("ai_styler.model_list.no_cloud_models")
                : t("ai_styler.model_list.unavailable_until_ollama");
        const openAiRawModels = getModelsForProvider(
            "openai",
            OPENAI_MODEL_OPTIONS.map((modelName) => ({ id: modelName, label: modelName }))
        );
        const openAiStylerCatalog = buildOpenAIStylerModelCatalog(openAiRawModels);
        state.openAiStylerCatalog = openAiStylerCatalog;
        const groqRawModels = getModelsForProvider(
            "groq",
            GROQ_MODEL_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))
        );
        const groqStylerCatalog = buildGroqStylerModelCatalog(groqRawModels);
        state.groqStylerCatalog = groqStylerCatalog;
        const geminiRawModels = getModelsForProvider(
            "gemini",
            GEMINI_MODEL_OPTIONS.map((entry) => ({
                id: entry.id,
                label: entry.label,
                supportedGenerationMethods: ["generateContent"],
            }))
        );
        const geminiStylerCatalog = buildGoogleAiStylerModelCatalog(geminiRawModels);
        state.geminiStylerCatalog = geminiStylerCatalog;

        const providers = [
            {
                id: "ollama_local",
                label: t("ai_styler.provider.ollama_local"),
                models: getModelsForProvider(
                    "ollama_local",
                    localModels.map((modelName) => ({ id: modelName, label: formatModelDropdownLabel(modelName) }))
                ),
                emptyLabel: localEmptyLabel,
            },
            {
                id: "ollama_cloud",
                label: t("ai_styler.provider.ollama_cloud"),
                models: getModelsForProvider(
                    "ollama_cloud",
                    cloudModels.map((modelName) => ({ id: modelName, label: modelName }))
                ),
                emptyLabel: cloudEmptyLabel,
            },
            {
                id: "openai",
                label: t("ai_styler.provider.openai_api"),
                models: openAiStylerCatalog.visibleFlatModels,
                modelGroups: openAiStylerCatalog.visibleGroups,
                emptyLabel: t("ai_styler.model_list.no_openai_models"),
            },
            {
                id: "anthropic",
                label: t("ai_styler.provider.anthropic_api"),
                models: getModelsForProvider(
                    "anthropic",
                    ANTHROPIC_MODEL_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))
                ),
                emptyLabel: t("ai_styler.model_list.no_anthropic_models"),
            },
            {
                id: "groq",
                label: t("ai_styler.provider.groq_cloud"),
                models: groqStylerCatalog.visibleFlatModels,
                modelGroups: groqStylerCatalog.visibleGroups,
                emptyLabel: t("ai_styler.model_list.no_groq_models"),
            },
            {
                id: "gemini",
                label: t("ai_styler.provider.gemini_cloud"),
                models: geminiStylerCatalog.visibleFlatModels,
                modelGroups: geminiStylerCatalog.visibleGroups,
                emptyLabel: t("ai_styler.model_list.no_gemini_models"),
            },
            {
                id: "huggingface",
                label: t("ai_styler.provider.huggingface_cloud"),
                models: getModelsForProvider(
                    "huggingface",
                    HUGGINGFACE_MODEL_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))
                ),
                emptyLabel: t("ai_styler.model_list.no_huggingface_models"),
            },
            {
                id: "openrouter",
                label: t("ai_styler.provider.openrouter_api"),
                models: getModelsForProvider(
                    "openrouter",
                    OPENROUTER_MODEL_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))
                ),
                emptyLabel: t("ai_styler.model_list.no_openrouter_models"),
            },
        ];

        providers.sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" }));
        return providers;
    }

    function populateModelSelect(preferredProviderId = "") {
        const providers = buildProviderModelCatalog();
        const enabledProviders = providers.filter((entry) => !entry.disabled);
        const providerById = new Map(providers.map((entry) => [entry.id, entry]));

        let selectedProviderId = String(
            preferredProviderId
            || state.selectedProvider
            || getProviderOptionIdForModel(state.selectedModel)
            || ""
        ).trim();
        if (!selectedProviderId || !providerById.has(selectedProviderId) || providerById.get(selectedProviderId)?.disabled) {
            const fromModel = getProviderOptionIdForModel(state.selectedModel);
            if (fromModel && providerById.has(fromModel) && !providerById.get(fromModel)?.disabled) {
                selectedProviderId = fromModel;
            } else if (
                !preferredProviderId
                && !state.selectedProvider
                && providerById.has("ollama_local")
                && !providerById.get("ollama_local")?.disabled
            ) {
                selectedProviderId = "ollama_local";
            } else {
                selectedProviderId = enabledProviders[0]?.id || "";
            }
        }

        const selectedProviderEntry = providerById.get(selectedProviderId) || enabledProviders[0] || null;
        selectedProviderId = selectedProviderEntry?.id || "";

        let availableModels = Array.isArray(selectedProviderEntry?.models) ? selectedProviderEntry.models.slice() : [];
        const uniqueAvailableModels = [];
        const seenAvailableModelIds = new Set();
        availableModels.forEach((entry) => {
            const id = String(entry?.id || "").trim();
            if (!id || seenAvailableModelIds.has(id)) return;
            seenAvailableModelIds.add(id);
            uniqueAvailableModels.push({ id, label: id });
        });
        availableModels = selectedProviderId === "openrouter"
            ? uniqueAvailableModels
            : uniqueAvailableModels.sort((a, b) => a.id.localeCompare(b.id));
        if (selectedProviderId === "huggingface") {
            availableModels = availableModels.filter((entry) => !isHuggingFaceCustomModelOption(entry.id));
            availableModels.push({
                id: HUGGINGFACE_CUSTOM_MODEL_OPTION_ID,
                label: getHuggingFaceCustomModelOptionLabel(),
            });
        }
        const openAiCatalog = selectedProviderId === "openai" ? state.openAiStylerCatalog : null;
        const groqCatalog = selectedProviderId === "groq" ? state.groqStylerCatalog : null;
        const geminiCatalog = selectedProviderId === "gemini" ? state.geminiStylerCatalog : null;
        if (selectedProviderId === "openrouter") {
            const needle = typeof state.openrouterModelFilter === "string" ? state.openrouterModelFilter.toLowerCase() : "";
            availableModels = needle
                ? availableModels.filter((entry) => entry.id.toLowerCase().includes(needle))
                : availableModels.slice(0, OPENROUTER_DEFAULT_DISPLAY_COUNT);
        }
        const preSelectionModelId = String(state.selectedModel || "").trim();
        const preSelectionProviderId = String(
            state.selectedProvider || getProviderOptionIdForModel(preSelectionModelId) || ""
        ).trim();
        let selectedModelId = String(state.selectedModel || "").trim();
        if (selectedProviderId === "openai") {
            const resolved = resolveOpenAIModelForUI(selectedModelId, openAiCatalog);
            if (resolved) {
                selectedModelId = resolved;
            }
        }
        if (selectedProviderId === "groq") {
            const resolved = resolveGroqModelForUI(selectedModelId, groqCatalog);
            if (resolved) {
                selectedModelId = resolved;
            }
        }
        if (selectedProviderId === "gemini") {
            const resolved = resolveGeminiModelForUI(selectedModelId, geminiCatalog);
            if (resolved) {
                selectedModelId = resolved;
            }
        }
        let hasSelectedModel = availableModels.some((entry) => entry.id === selectedModelId);
        if (
            selectedProviderId === "openai"
            && !hasSelectedModel
            && selectedModelId
            && openAiCatalog?.supportedModelIds?.has(selectedModelId)
        ) {
            if (!availableModels.some((entry) => entry.id === selectedModelId)) {
                availableModels.push({ id: selectedModelId, label: selectedModelId });
                availableModels.sort((a, b) => a.id.localeCompare(b.id));
            }
            hasSelectedModel = true;
        }
        if (!hasSelectedModel) {
            const fallbackToProviderDefault = (
                preSelectionModelId
                && preSelectionProviderId === selectedProviderId
            );
            const defaultModelForProvider = fallbackToProviderDefault
                ? getDefaultModelForProviderOption(selectedProviderId, availableModels)
                : "";
            if (defaultModelForProvider && availableModels.some((entry) => entry.id === defaultModelForProvider)) {
                selectedModelId = defaultModelForProvider;
            } else {
                const lastModelForProvider = String(state.lastSelectedModelByProvider[selectedProviderId] || "").trim();
                let resolvedLastModelForProvider = lastModelForProvider;
                if (selectedProviderId === "openai") {
                    const resolvedLastModel = resolveOpenAIModelForUI(lastModelForProvider, openAiCatalog);
                    if (resolvedLastModel) {
                        resolvedLastModelForProvider = resolvedLastModel;
                    }
                } else if (selectedProviderId === "groq") {
                    const resolvedLastModel = resolveGroqModelForUI(lastModelForProvider, groqCatalog);
                    if (resolvedLastModel) {
                        resolvedLastModelForProvider = resolvedLastModel;
                    }
                } else if (selectedProviderId === "gemini") {
                    const resolvedLastModel = resolveGeminiModelForUI(lastModelForProvider, geminiCatalog);
                    if (resolvedLastModel) {
                        resolvedLastModelForProvider = resolvedLastModel;
                    }
                }
                if (resolvedLastModelForProvider && availableModels.some((entry) => entry.id === resolvedLastModelForProvider)) {
                    selectedModelId = resolvedLastModelForProvider;
                } else {
                    selectedModelId = availableModels[0]?.id || "";
                }
            }
        }

        state.selectedProvider = selectedProviderId;
        state.selectedModel = selectedModelId;
        if (selectedProviderId && selectedModelId) {
            if (!(selectedProviderId === "huggingface" && isHuggingFaceCustomModelOption(selectedModelId))) {
                state.lastSelectedModelByProvider[selectedProviderId] = selectedModelId;
                if (selectedProviderId === "huggingface") {
                    state.lastHuggingFaceNonCustomModel = selectedModelId;
                }
            }
        }

        providerSelect.innerHTML = "";
        providers.forEach((entry) => {
            const option = document.createElement("option");
            option.value = entry.id;
            option.textContent = entry.label;
            option.disabled = !!entry.disabled;
            providerSelect.appendChild(option);
        });
        providerSelect.value = selectedProviderId;

        modelSelect.innerHTML = "";
        if (availableModels.length > 0) {
            availableModels.forEach((entry) => {
                const option = document.createElement("option");
                option.value = entry.id;
                option.textContent = selectedProviderId === "huggingface" && isHuggingFaceCustomModelOption(entry.id)
                    ? (entry.label || getHuggingFaceCustomModelOptionLabel())
                    : entry.id;
                modelSelect.appendChild(option);
            });
            if (selectedProviderId === "openrouter") {
                const filterOpt = document.createElement("option");
                filterOpt.value = OPENROUTER_FILTER_OTHER_ID;
                filterOpt.textContent = "Filter / Other\u2026";
                modelSelect.appendChild(filterOpt);
            }
            modelSelect.value = state.selectedModel || availableModels[0].id;
            modelSelect.disabled = false;
        } else {
            if (selectedProviderId === "openrouter") {
                const filterOpt = document.createElement("option");
                filterOpt.value = OPENROUTER_FILTER_OTHER_ID;
                filterOpt.textContent = "Filter / Other\u2026";
                modelSelect.appendChild(filterOpt);
                modelSelect.value = OPENROUTER_FILTER_OTHER_ID;
                modelSelect.disabled = false;
            } else {
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = selectedProviderEntry?.emptyLabel || t("ai_styler.model_list.no_models");
                placeholder.disabled = true;
                placeholder.selected = true;
                modelSelect.appendChild(placeholder);
                modelSelect.value = "";
                modelSelect.disabled = true;
            }
        }

        if (
            selectedProviderId === "openai"
            && preSelectionModelId
            && preSelectionModelId !== state.selectedModel
            && preSelectionProviderId === "openai"
            && state.lastOpenAiInvalidFallbackModel !== preSelectionModelId
        ) {
            const wasSupported = !!resolveOpenAIModelForUI(preSelectionModelId, openAiCatalog);
            if (!wasSupported) {
                state.lastOpenAiInvalidFallbackModel = preSelectionModelId;
                showToast(
                    "warn",
                    t("ai_styler.toast.openai_model_updated.title"),
                    t("ai_styler.toast.openai_model_updated.body", { old: preSelectionModelId, new: state.selectedModel || OPENAI_MODEL_DEFAULT })
                );
            }
        }
        if (
            selectedProviderId === "groq"
            && preSelectionModelId
            && preSelectionModelId !== state.selectedModel
            && preSelectionProviderId === "groq"
            && state.lastGroqInvalidFallbackModel !== preSelectionModelId
        ) {
            const wasSupported = !!resolveGroqModelForUI(preSelectionModelId, groqCatalog);
            if (!wasSupported) {
                state.lastGroqInvalidFallbackModel = preSelectionModelId;
                showToast(
                    "warn",
                    t("ai_styler.toast.groq_model_updated.title"),
                    t("ai_styler.toast.groq_model_updated.body", { old: preSelectionModelId, new: state.selectedModel || GROQ_MODEL_DEFAULT })
                );
            }
        }
        if (
            selectedProviderId === "gemini"
            && preSelectionModelId
            && preSelectionModelId !== state.selectedModel
            && preSelectionProviderId === "gemini"
            && state.lastGeminiInvalidFallbackModel !== preSelectionModelId
        ) {
            const wasSupported = !!resolveGeminiModelForUI(preSelectionModelId, geminiCatalog);
            if (!wasSupported) {
                state.lastGeminiInvalidFallbackModel = preSelectionModelId;
                showToast(
                    "warn",
                    t("ai_styler.toast.gemini_model_updated.title"),
                    t("ai_styler.toast.gemini_model_updated.body", { old: preSelectionModelId, new: state.selectedModel || GEMINI_MODEL_DEFAULT })
                );
            }
        }

        updateProviderKeyVisibility();
        updateProviderBadge();
        updateModelStatus();
    }
    async function fetchOllamaModels() {
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        state.connecting = true;
        state.connected = false;
        state.error = null;
        state.models = [];
        updateModelStatus();
        populateModelSelect();
        updateGenerateButton();

        try {
            const names = await withBusyRequest(() => ollamaFetchModels({ timeoutMs: requestTimeoutMs }));

            state.models = names;
            state.connected = true;
            persistProviderModelCacheEntry(
                "ollama_local",
                state.models
                    .filter((name) => typeof name === "string" && !name.endsWith("-cloud"))
                    .map((name) => ({ id: name, label: formatModelDropdownLabel(name) })),
                Date.now()
            );
            persistProviderModelCacheEntry(
                "ollama_cloud",
                state.models
                    .filter((name) => typeof name === "string" && name.endsWith("-cloud"))
                    .map((name) => ({ id: name, label: name })),
                Date.now()
            );
            const availableModels = new Set([
                ...state.models,
                ...OPENAI_MODEL_SET,
                ...ANTHROPIC_MODEL_SET,
                ...GROQ_MODEL_SET,
                ...GEMINI_MODEL_SET,
                ...HUGGINGFACE_MODEL_SET,
            ]);
            // Restore persisted model if available and still in the list,
            // otherwise default to recommended model, then fall back to first
            const savedModel = getPersistedSetting(PERSIST_KEY_MODEL, "");
            if (savedModel && availableModels.has(savedModel)) {
                state.selectedModel = savedModel;
            } else if (state.selectedModel && availableModels.has(state.selectedModel)) {
                // Keep currently selected model when still available.
            } else if (state.models.includes(RECOMMENDED_LOCAL_MODEL)) {
                state.selectedModel = RECOMMENDED_LOCAL_MODEL;
            } else if (!state.selectedModel || !state.models.includes(state.selectedModel)) {
                state.selectedModel = state.models[0] || "";
            }
        } catch (err) {
            state.connected = false;
            state.error = normalizeConnectivityError(err);
            state.models = [];
            const savedModel = getPersistedSetting(PERSIST_KEY_MODEL, "");
            if (!isOpenAIModelName(state.selectedModel) && !isAnthropicModelName(state.selectedModel) && !isGroqModelName(state.selectedModel) && !isGeminiModelName(state.selectedModel) && !isHuggingFaceModelName(state.selectedModel)) {
                state.selectedModel = (isOpenAIModelName(savedModel) || isAnthropicModelName(savedModel) || isGroqModelName(savedModel) || isGeminiModelName(savedModel) || isHuggingFaceModelName(savedModel)) ? savedModel : "";
            }
        } finally {
            state.connecting = false;
            updateModelStatus();
            populateModelSelect();
            updateGenerateButton();
            // If offline and tab is active, begin health-check polling
            if (!state.connected && state.ollamaTabActive) {
                startOllamaPolling();
            }
        }
    }

    function shouldRefreshModelsOnTabActivate() {
        // Avoid re-hitting /api/tags on every tab focus when the current model context is already valid.
        if (state.connecting || state.refreshingProviderId) return false;
        if (state.connected && !state.error) return false;
        return true;
    }

    // --- Ollama auto-detection polling (Offline->Online) ---

    function stopOllamaPolling() {
        if (state.ollamaPollingTimer !== null) {
            clearTimeout(state.ollamaPollingTimer);
            state.ollamaPollingTimer = null;
        }
    }

    function startOllamaPolling() {
        stopOllamaPolling();
        if (state.connected || state.connecting) return;
        state.ollamaPollingInterval = OLLAMA_POLL_INITIAL_MS;
        scheduleOllamaPoll();
    }

    function scheduleOllamaPoll() {
        if (state.connected || !state.ollamaTabActive) return;
        state.ollamaPollingTimer = setTimeout(async () => {
            state.ollamaPollingTimer = null;
            if (state.connected || state.connecting || !state.ollamaTabActive) return;

            const pollTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
            const isUp = await withBusyRequest(() => ollamaHealthPing({ timeoutMs: pollTimeoutMs }));
            if (isUp && !state.connected && !state.connecting) {
                // Ollama just came online - fetch models
                await fetchOllamaModels();
                // If connected now, polling is no longer needed
                if (state.connected) return;
            }

            // Still offline: backoff and retry
            if (!state.connected && state.ollamaTabActive) {
                state.ollamaPollingInterval = Math.min(
                    state.ollamaPollingInterval * OLLAMA_POLL_BACKOFF,
                    OLLAMA_POLL_MAX_MS
                );
                scheduleOllamaPoll();
            }
        }, state.ollamaPollingInterval);
    }

    function renderCategoryList() {
        state.styleIndex = getStyleIndex() || [];
        state.stylePromptTooltipLookupByCategory = buildStylePromptTooltipLookup(state.styleIndex);
        renderFromStaged();
    }

    function setOnSelect(cb) {
        onSelectCallback = cb;
    }

    function setOnApply(cb) {
        onApplyCallback = cb;
    }

    function setOnCancel(cb) {
        onCancelCallback = cb;
    }

    function render(selection, options = {}) {
        const prevSelection = cloneSelection(state.stagedSelection);
        setStagedSelection(selection || {});
        renderCategoryList();

        // Bidirectional sync (Req #4): detect categories whose style status
        // changed between the previous and current selection.
        syncSuggestionRowsWithSelection(prevSelection, selection || {});

        if (options.preserveExistingSuggestions && state.suggestionsVisible) {
            if (hasRunningProcess()) {
                // During Query/Refine runs, keep the live per-row DOM untouched.
                // Re-rendering here can materialize full candidate lists at once
                // and bypass the incremental chip reveal performed on status transitions.
                updateViewJsonButton();
                captureModuleSnapshot();
                return;
            }
            if (state.localSequentialActive) {
                renderLocalSequentialRowsFromState();
            } else {
                renderSuggestionCandidates(
                    state.suggestionsModelName || state.selectedModel || "",
                    state.stagedCandidates,
                    state.suggestionsWarnings,
                    state.suggestionsRawJson,
                    state.suggestionsNotes,
                    {
                        categories: state.suggestionsCategories,
                        errorCategories: Array.from(state.suggestionsErrorCategories),
                    }
                );
            }
            updateViewJsonButton();
            captureModuleSnapshot();
            return;
        }
        syncSuggestionsFromSidebarState();
        captureModuleSnapshot();
    }

    /**
     * Chip-sync helper called on every render() pass.
     * Keeps applied-style chips in existing Suggestions rows up-to-date when
     * the sidebar selection changes (e.g. user picks / clears a style in Browse).
     * Invariants enforced here:
     *   - Category already in Suggestions + gained a style → update its chip
     *   - Category already in Suggestions + lost its style → remove its row
     *   - Category NOT in Suggestions → never touched (no auto-add, no auto-scope)
     *   - scopedCategories is never modified here (selection is user-controlled)
     */
    function syncSuggestionRowsWithSelection(prevSel, nextSel) {
        if (!state.suggestionsVisible) return;

        const prevStyled = new Set(
            Object.keys(prevSel || {}).filter((k) => typeof prevSel[k] === "string" && prevSel[k])
        );
        const nextStyled = new Set(
            Object.keys(nextSel || {}).filter((k) => typeof nextSel[k] === "string" && nextSel[k])
        );
        const existingCatSet = new Set(state.suggestionsCategories || []);

        // Categories that gained a style: update chip only if already in Suggestions.
        // Never auto-add categories to Suggestions or auto-scope them — Suggestions
        // must only contain categories the user explicitly added (Add menu, Query/Refine,
        // or toggleScopeCategory). Every render() call passes the full pipeline selection
        // through here, which would silently import unrelated styled categories otherwise.
        nextStyled.forEach((category) => {
            if (!existingCatSet.has(category)) return;
            // Category already in Suggestions — refresh its applied-style chip.
            upsertCurrentStyleCandidate(category, nextSel[category]);
        });

        // Categories that lost their style: remove their row from Suggestions.
        // Do NOT touch scopedCategories — selection state is entirely user-controlled
        // and must not be changed as a side-effect of a style being cleared.
        prevStyled.forEach((category) => {
            if (!nextStyled.has(category) && existingCatSet.has(category)) {
                // Remove from suggestionsCategories
                state.suggestionsCategories = state.suggestionsCategories.filter((c) => c !== category);
                // Clean up state for removed category
                delete state.stagedCandidates[category];
                delete state.localSequentialStatusByCategory[category];
                delete state.categoryHasFinalLLMResult[category];
                delete state.categoryHttpError[category];
                clearLocalSequentialChipTimer(category);
                // Remove DOM row
                const row = getLocalSequentialRowElement(category);
                if (row) row.remove();
            }
        });

        // Categories whose style changed: update chip
        nextStyled.forEach((category) => {
            if (prevStyled.has(category) && prevSel[category] !== nextSel[category]) {
                setCategoryFinalLLMResult(category, false);
                upsertCurrentStyleCandidate(category, nextSel[category]);
                if (state.localSequentialActive) {
                    renderLocalSequentialSuggestionRow(category);
                }
            }
        });
    }

    /**
     * Ensure the applied style appears as a candidate chip in Suggestions (Req #3 / #5).
     * If the style already exists, no duplicate is created (idempotent).
     * If a different "current style" was previously injected, it is replaced.
     */
    function upsertCurrentStyleCandidate(category, styleName) {
        if (!styleName) return;
        const candidates = state.stagedCandidates[category] || [];
        const alreadyHas = candidates.some((item) => {
            const name = typeof item === "string" ? item : item?.name;
            return name === styleName;
        });
        if (!alreadyHas) {
            // Prepend the current style as the first chip
            state.stagedCandidates[category] = [{ name: styleName, score: null }, ...candidates];
        }
        if (!state.localSequentialStatusByCategory[category]) {
            state.localSequentialStatusByCategory[category] = "done";
            setCategoryFinalLLMResult(category, false);
        }
    }

    function applyGeneratedCandidateSelection(candidateSelection) {
        const newCandidates = {};
        const newSelection = {};
        const appliedCountByCategory = {};
        let updatedCount = 0;

        Object.entries(candidateSelection || {}).forEach(([category, candidates]) => {
            const ranked = Array.isArray(candidates)
                ? candidates
                    .map((item) => {
                        if (typeof item === "string") {
                            const name = item.trim();
                            if (!name) return null;
                            return { name, score: null };
                        }
                        if (item && typeof item.name === "string") {
                            const name = item.name.trim();
                            if (!name) return null;
                            const score = (typeof item.score === "number" && Number.isFinite(item.score))
                                ? (item.score > 1 || item.score < 0
                                    ? Math.max(0, Math.min(100, item.score)) / 100
                                    : Math.max(0, Math.min(1, item.score)))
                                : null;
                            return { name, score };
                        }
                        return null;
                    })
                    .filter(Boolean)
                    .slice(0, MAX_MODEL_CANDIDATES_PER_CATEGORY)
                : [];

            if (ranked.length === 0) return;

            newCandidates[category] = ranked;
            newSelection[category] = ranked[0].name;
            appliedCountByCategory[category] = ranked.length;
            state.stagedSkipSet.delete(category);
            updatedCount += 1;
        });

        // Merge new candidates into existing (preserve previous categories)
        Object.assign(state.stagedCandidates, newCandidates);

        // Merge new selections into existing staged selection
        const mergedSelection = cloneSelection(state.stagedSelection);
        Object.assign(mergedSelection, newSelection);

        if (onSelectCallback) {
            Object.entries(newSelection).forEach(([category, value]) => {
                if (typeof value === "string" && value.trim()) {
                    onSelectCallback(category, value);
                }
            });
        } else {
            setStagedSelection(mergedSelection);
            renderFromStaged();
        }

        try {
            categoryList.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch {
            categoryList.scrollIntoView();
        }

        return { updatedCount, appliedCountByCategory };
    }

    providerSelect.addEventListener("change", () => {
        const preferredProviderId = String(providerSelect.value || "").trim();
        populateModelSelect(preferredProviderId);
        updateGenerateButton();
    });

    modelSelect.addEventListener("change", async () => {
        const selectedValue = String(modelSelect.value || "").trim();
        const selectedProvider = String(providerSelect.value || getProviderOptionIdForModel(selectedValue) || state.selectedProvider || "").trim();

        if (selectedProvider === "openrouter" && selectedValue === OPENROUTER_FILTER_OTHER_ID) {
            const previousModel = String(state.selectedModel || "").trim();
            const filterInput = await showPrompt(
                "Filter OpenRouter Models",
                "Enter a filter string to search model IDs (leave empty to show all):",
                state.openrouterModelFilter || "",
                { type: "default" }
            );
            if (filterInput === null) {
                // Cancelled – restore previous selection without rebuilding the list
                const prevOption = Array.from(modelSelect.options).find(
                    (opt) => opt.value === previousModel && opt.value !== OPENROUTER_FILTER_OTHER_ID
                );
                if (prevOption) {
                    modelSelect.value = previousModel;
                } else {
                    const firstReal = Array.from(modelSelect.options).find(
                        (opt) => opt.value && opt.value !== OPENROUTER_FILTER_OTHER_ID
                    );
                    if (firstReal) {
                        modelSelect.value = firstReal.value;
                        state.selectedModel = firstReal.value;
                    }
                }
                return;
            }
            const normalized = filterInput.trim();
            state.openrouterModelFilter = normalized || null;
            populateModelSelect(selectedProvider);
            return;
        }

        if (selectedProvider === "huggingface" && isHuggingFaceCustomModelOption(selectedValue)) {
            const fallbackModel = (() => {
                const preferred = String(state.lastHuggingFaceNonCustomModel || "").trim();
                if (preferred && Array.from(modelSelect.options).some((option) => String(option.value || "").trim() === preferred)) {
                    return preferred;
                }
                const fallbackPreferred = String(state.lastSelectedModelByProvider.huggingface || "").trim();
                if (
                    fallbackPreferred
                    && !isHuggingFaceCustomModelOption(fallbackPreferred)
                    && Array.from(modelSelect.options).some((option) => String(option.value || "").trim() === fallbackPreferred)
                ) {
                    return fallbackPreferred;
                }
                const firstNonCustom = Array.from(modelSelect.options).find((option) => {
                    const value = String(option.value || "").trim();
                    return value && !isHuggingFaceCustomModelOption(value);
                });
                return firstNonCustom ? String(firstNonCustom.value || "").trim() : "";
            })();

            const currentCustom = getCurrentHuggingFaceCustomModelSnapshot();
            const customModel = await showPrompt(
                t("ai_styler.prompt.hf_custom_model.title"),
                t("ai_styler.prompt.hf_custom_model.message"),
                currentCustom,
                { type: "default" }
            );
            const normalizedCustomModel = String(customModel || "").trim();

            if (!normalizedCustomModel) {
                if (fallbackModel) {
                    modelSelect.value = fallbackModel;
                    state.selectedModel = fallbackModel;
                    state.lastSelectedModelByProvider.huggingface = fallbackModel;
                    state.lastHuggingFaceNonCustomModel = fallbackModel;
                } else {
                    modelSelect.value = "";
                    state.selectedModel = "";
                }
                state.selectedProvider = "huggingface";
                showToast("warn", t("ai_styler.toast.custom_model_required.title"), t("ai_styler.toast.custom_model_required.body"));
                persistLastUsedProviderModel(state.selectedProvider, state.selectedModel);
                updateProviderKeyVisibility();
                updateProviderBadge();
                updateModelStatus();
                updateGenerateButton();
                return;
            }

            state.huggingFaceCustomModelId = normalizedCustomModel;
            setPersistedSetting(PERSIST_KEY_HF_CUSTOM_MODEL, normalizedCustomModel);
            const customOption = Array.from(modelSelect.options).find((option) => isHuggingFaceCustomModelOption(option.value));
            if (customOption) {
                customOption.textContent = getHuggingFaceCustomModelOptionLabel();
            }
            modelSelect.value = HUGGINGFACE_CUSTOM_MODEL_OPTION_ID;
            state.selectedProvider = "huggingface";
            state.selectedModel = HUGGINGFACE_CUSTOM_MODEL_OPTION_ID;
            persistLastUsedProviderModel(state.selectedProvider, state.selectedModel);
            updateProviderKeyVisibility();
            updateProviderBadge();
            updateModelStatus();
            updateGenerateButton();
            return;
        }

        state.selectedModel = selectedValue;
        state.selectedProvider = selectedProvider;
        if (state.selectedProvider && state.selectedModel) {
            state.lastSelectedModelByProvider[state.selectedProvider] = state.selectedModel;
            if (state.selectedProvider === "huggingface" && !isHuggingFaceCustomModelOption(state.selectedModel)) {
                state.lastHuggingFaceNonCustomModel = state.selectedModel;
            }
        }
        persistLastUsedProviderModel(state.selectedProvider, state.selectedModel);
        updateProviderKeyVisibility();
        updateProviderBadge();
        updateModelStatus();
        updateGenerateButton();
    });

    modelRefreshBtn.addEventListener("click", async () => {
        const providerId = String(state.selectedProvider || providerSelect.value || "").trim();
        persistLastUsedProviderModel(providerId, String(state.selectedModel || modelSelect.value || "").trim());
        if (providerId === "openrouter") {
            state.openrouterModelFilter = null;
        }
        await refreshModelsForProvider(providerId);
    });

    getOllamaBtn.addEventListener("click", () => {
        persistLastUsedProviderModel(
            String(state.selectedProvider || providerSelect.value || "").trim(),
            String(state.selectedModel || modelSelect.value || "").trim()
        );
        window.open(OLLAMA_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
    });

    if (getApiKeyBtn) {
        getApiKeyBtn.addEventListener("click", () => {
            const providerId = String(state.selectedProvider || providerSelect.value || "").trim();
            const url = getProviderHelperLink(providerId);
            if (url) {
                window.open(url, "_blank", "noopener,noreferrer");
            } else {
                showToast("warn", t("ai_styler.toast.no_link.title"), t("ai_styler.toast.no_link.body"));
            }
        });
    }
    if (saveTokenBtn) {
        saveTokenBtn.addEventListener("click", () => {
            submitTokenSaveForm();
        });
    }

    openaiKeyInput.addEventListener("input", () => {
        state.openaiApiKey = (openaiKeyInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    anthropicKeyInput.addEventListener("input", () => {
        state.anthropicApiKey = (anthropicKeyInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    groqKeyInput.addEventListener("input", () => {
        state.groqApiKey = (groqKeyInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    geminiKeyInput.addEventListener("input", () => {
        state.geminiApiKey = (geminiKeyInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    hfTokenInput.addEventListener("input", () => {
        state.huggingFaceToken = (hfTokenInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    openrouterKeyInput.addEventListener("input", () => {
        state.openrouterApiKey = (openrouterKeyInput.value || "").trim();
        updateModelStatus();
        updateGenerateButton();
    });

    timeoutInput.addEventListener("input", () => {
        applyRequestTimeoutSeconds(timeoutInput.value, { persist: false });
    });

    timeoutInput.addEventListener("change", () => {
        applyRequestTimeoutSeconds(timeoutInput.value, { persist: true });
    });

    timeoutInput.addEventListener("blur", () => {
        applyRequestTimeoutSeconds(timeoutInput.value, { persist: true });
    });

    openaiTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isOpenAIModelName(selectedModel)) {
            showToast("warn", t("ai_styler.toast.openai_test.title"), t("ai_styler.toast.openai_test.wrong_model"));
            return;
        }

        const apiKey = getCurrentOpenAIApiKeySnapshot();
        if (!apiKey) {
            showToast("error", t("ai_styler.toast.api_key_required.title"), t("ai_styler.toast.openai_key_required.body"));
            openaiKeyInput.focus();
            return;
        }

        const previousDisabled = openaiTestBtn.disabled;
        const previousLabel = openaiTestBtn.textContent;
        openaiTestBtn.disabled = true;
        openaiTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("openai", selectedModel);
            await openaiTestApiKey({
                apiKey,
                model: selectedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.openai_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "openai",
                modelName: selectedModel,
                toastSummary: t("ai_styler.toast.openai_test.title"),
            });
        } finally {
            releaseBusy();
            openaiTestBtn.disabled = previousDisabled;
            openaiTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    anthropicTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isAnthropicModelName(selectedModel)) {
            showToast("warn", t("ai_styler.toast.anthropic_test.title"), t("ai_styler.toast.anthropic_test.wrong_model"));
            return;
        }

        const apiKey = getCurrentAnthropicApiKeySnapshot();
        if (!apiKey) {
            showToast("error", t("ai_styler.toast.api_key_required.title"), t("ai_styler.toast.anthropic_key_required.body"));
            anthropicKeyInput.focus();
            return;
        }

        const previousDisabled = anthropicTestBtn.disabled;
        const previousLabel = anthropicTestBtn.textContent;
        anthropicTestBtn.disabled = true;
        anthropicTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("anthropic", selectedModel);
            await anthropicTestApiKey({
                apiKey,
                model: selectedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.anthropic_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "anthropic",
                modelName: selectedModel,
                toastSummary: t("ai_styler.toast.anthropic_test.title"),
            });
        } finally {
            releaseBusy();
            anthropicTestBtn.disabled = previousDisabled;
            anthropicTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    groqTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isGroqModelName(selectedModel)) {
            showToast("warn", t("ai_styler.toast.groq_test.title"), t("ai_styler.toast.groq_test.wrong_model"));
            return;
        }

        const apiKey = getCurrentGroqApiKeySnapshot();
        if (!apiKey) {
            showToast("error", t("ai_styler.toast.api_key_required.title"), t("ai_styler.toast.groq_key_required.body"));
            groqKeyInput.focus();
            return;
        }

        const previousDisabled = groqTestBtn.disabled;
        const previousLabel = groqTestBtn.textContent;
        groqTestBtn.disabled = true;
        groqTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("groq", selectedModel);
            await groqTestApiKey({
                apiKey,
                model: selectedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.groq_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "groq",
                modelName: selectedModel,
                toastSummary: t("ai_styler.toast.groq_test.title"),
            });
        } finally {
            releaseBusy();
            groqTestBtn.disabled = previousDisabled;
            groqTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    geminiTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isGeminiModelName(selectedModel)) {
            showToast("warn", t("ai_styler.toast.gemini_test.title"), t("ai_styler.toast.gemini_test.wrong_model"));
            return;
        }

        const apiKey = getCurrentGeminiApiKeySnapshot();
        if (!apiKey) {
            showToast("error", t("ai_styler.toast.api_key_required.title"), t("ai_styler.toast.gemini_key_required.body"));
            geminiKeyInput.focus();
            return;
        }

        const previousDisabled = geminiTestBtn.disabled;
        const previousLabel = geminiTestBtn.textContent;
        geminiTestBtn.disabled = true;
        geminiTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("gemini", selectedModel);
            await geminiTestApiKey({
                apiKey,
                model: selectedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.gemini_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "gemini",
                modelName: selectedModel,
                toastSummary: t("ai_styler.toast.gemini_test.title"),
            });
        } finally {
            releaseBusy();
            geminiTestBtn.disabled = previousDisabled;
            geminiTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    hfTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isHuggingFaceModelName(selectedModel) && !isHuggingFaceCustomModelOption(selectedModel)) {
            showToast("warn", t("ai_styler.toast.hf_test.title"), t("ai_styler.toast.hf_test.wrong_model"));
            return;
        }

        const token = getCurrentHuggingFaceTokenSnapshot();
        if (!token) {
            showToast("error", t("ai_styler.toast.token_required.title"), t("ai_styler.toast.hf_token_required.body"));
            hfTokenInput.focus();
            return;
        }

        const resolvedModel = resolveHuggingFaceRequestModel(selectedModel);
        if (!resolvedModel) {
            showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.hf_model_required.body"));
            return;
        }

        const previousDisabled = hfTestBtn.disabled;
        const previousLabel = hfTestBtn.textContent;
        hfTestBtn.disabled = true;
        hfTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("huggingface", selectedModel);
            await huggingFaceTestApiKey({
                apiKey: token,
                model: resolvedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.hf_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "huggingface",
                modelName: resolvedModel || selectedModel,
                toastSummary: t("ai_styler.toast.hf_test.title"),
            });
        } finally {
            releaseBusy();
            hfTestBtn.disabled = previousDisabled;
            hfTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    openrouterTestBtn.addEventListener("click", async () => {
        const selectedModel = getCurrentModelSnapshot();
        const requestTimeoutMs = getCurrentRequestTimeoutMsSnapshot();
        if (!isOpenRouterModelName(selectedModel)) {
            showToast("warn", t("ai_styler.toast.openrouter_test.title"), t("ai_styler.toast.openrouter_test.wrong_model"));
            return;
        }

        const apiKey = getCurrentOpenRouterApiKeySnapshot();
        if (!apiKey) {
            showToast("error", t("ai_styler.toast.api_key_required.title"), t("ai_styler.toast.openrouter_key_required.body"));
            openrouterKeyInput.focus();
            return;
        }

        const previousDisabled = openrouterTestBtn.disabled;
        const previousLabel = openrouterTestBtn.textContent;
        openrouterTestBtn.disabled = true;
        openrouterTestBtn.textContent = t("ai_styler.btn.testing.label");
        setInlinePromptError("");
        const releaseBusy = beginBusyRequest();

        try {
            persistLastUsedProviderModel("openrouter", selectedModel);
            await openrouterTestApiKey({
                apiKey,
                model: selectedModel,
                timeoutMs: requestTimeoutMs,
            });
            showToast("success", t("ai_styler.toast.openrouter_test.title"), t("ai_styler.toast.test_success.body"));
        } catch (err) {
            reportLlmRequestFailure(err, {
                provider: "openrouter",
                modelName: selectedModel,
                toastSummary: t("ai_styler.toast.openrouter_test.title"),
            });
        } finally {
            releaseBusy();
            openrouterTestBtn.disabled = previousDisabled;
            openrouterTestBtn.textContent = previousLabel;
            updateGenerateButton();
            updateModelStatus();
        }
    });

    promptInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            if (!generateBtn.disabled) {
                generateBtn.click();
            }
        }
    });

    promptInput.addEventListener("input", () => {
        if (promptClearBtn) promptClearBtn.classList.toggle("is-hidden", !promptInput.value);
        invalidateAllCategoryFinalLLMResults();
        if (state.localSequentialActive) {
            renderAllLocalSequentialRows();
        } else {
            updateHeaderRefineLabel();
        }
    });

    if (promptClearBtn) {
        promptClearBtn.addEventListener("click", () => {
            promptInput.value = "";
            promptClearBtn.classList.add("is-hidden");
            promptInput.focus();
        });
    }

    // Prompt is persisted to node JSON only on Query/Refine (persistLastLLMPrompt).
    // No debounced localStorage save — the node JSON is the sole source of truth.

    if (modelHelpBtn) {
        modelHelpBtn.addEventListener("click", async () => {
            const confirmed = await showConfirm(
                t("ai_styler.confirm.model_help.title"),
                t("ai_styler.confirm.model_help.body"),
                { type: "default", confirmText: t("ai_styler.confirm.model_help.confirm"), cancelText: t("ai_styler.confirm.model_help.cancel") }
            );
            if (!confirmed) return;
            openReadmeSection(AI_PRESETS_README_MODEL_ANCHOR);
        });
    }

    if (promptHelpBtn) {
        promptHelpBtn.addEventListener("click", () => {
            openReadmeSection(AI_PRESETS_README_PROMPT_ANCHOR);
        });
    }

    if (randomizePromptBtn) {
        randomizePromptBtn.addEventListener("click", () => {
            void applyRandomPromptCandidate(promptInput);
        });
    }

    clearAllBtn.addEventListener("click", () => {
        setInlinePromptError("");
        const keys = Object.keys(state.stagedSelection || {});
        state.scopedCategories.clear();
        setStagedSelection({});
        renderFromStaged();
        syncSuggestionsFromSidebarState();
        if (keys.length === 0) return;
        keys.forEach((category) => state.stagedSkipSet.add(category));
        if (onSelectCallback) keys.forEach((category) => onSelectCallback(category, null));
    });

    applyBtn.addEventListener("click", () => {
        let appliedCount = Object.keys(state.stagedSelection || {}).filter((key) => state.stagedSelection[key]).length;
        if (onApplyCallback) {
            const result = onApplyCallback();
            if (typeof result === "number") appliedCount = result;
        }
        showToast("success", t("ai_styler.toast.apply.title"), t("ai_styler.toast.apply.body", { count: appliedCount }));
    });

    cancelBtn.addEventListener("click", () => {
        state.stagedSkipSet.clear();
        if (onCancelCallback) {
            onCancelCallback();
        }
    });

    generateBtn.addEventListener("click", async () => {
        if (cancelActiveRefineProcess()) {
            return;
        }

        // If currently generating, cancel instead
        if (state.isGenerating && state.abortController) {
            invalidateLocalSequentialChipRendering();
            stopSidebarChipTypingForCurrentRun();
            state.abortController.abort();
            if (state.activeCategoryAbortController && !state.activeCategoryAbortController.signal.aborted) {
                state.activeCategoryAbortController.abort();
            }
            return;
        }
        
        // Prevent re-entrancy during async pre-flight checks
        if (state.isGenerating) return;

        const runId = state.generateRunId + 1;
        state.generateRunId = runId;

        // -- Snapshot model + prompt at operation start --
        const selectedModelAtStart = getCurrentModelSnapshot();
        const providerOptionAtStart = getCurrentProviderOptionSnapshot(selectedModelAtStart);
        const providerAtStart = getCurrentProviderSnapshot(selectedModelAtStart);
        const requestModelAtStart = providerAtStart === "huggingface"
            ? resolveHuggingFaceRequestModel(selectedModelAtStart)
            : selectedModelAtStart;
        const providerApiKeyAtStart = isCloudApiProvider(providerAtStart)
            ? getProviderApiKeySnapshot(providerAtStart)
            : "";
        const requestTimeoutMsAtStart = getCurrentRequestTimeoutMsSnapshot();
        const promptAtStart = getCurrentPromptSnapshot();

        if (!selectedModelAtStart) {
            showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.model_required.body"));
            return;
        }

        if (isCloudApiProvider(providerAtStart) && !providerApiKeyAtStart) {
            const credentialPrompt = getProviderCredentialPrompt(providerAtStart);
            showToast("error", credentialPrompt.title, credentialPrompt.message);
            focusProviderApiKeyInput(providerAtStart);
            return;
        }
        if (!requestModelAtStart) {
            showToast("error", t("ai_styler.toast.model_required.title"), t("ai_styler.toast.hf_model_required.body"));
            return;
        }

        if (providerOptionAtStart === "ollama_local" && state.connecting) {
            showToast("info", t("ai_styler.toast.models_loading.title"), t("ai_styler.toast.models_loading.body"));
            return;
        }
        if (!ensureOllamaLocalRunning({ providerOptionId: providerOptionAtStart, modelName: selectedModelAtStart })) {
            return;
        }

        // Block generation for incompatible local models
        if (providerAtStart === "ollama" && classifyLocalModel(selectedModelAtStart) === "incompatible") {
            showToast("error", t("ai_styler.toast.incompatible_model.title"), t("ai_styler.toast.incompatible_model.body", { model: RECOMMENDED_LOCAL_MODEL }), 6000);
            return;
        }

        if (!promptAtStart) {
            showToast("warn", t("ai_styler.toast.prompt_required.title"), t("ai_styler.toast.prompt_required.body"));
            promptInput.focus();
            return;
        }

        // Require at least 1 scoped category - never auto-select; user must select manually
        if (state.scopedCategories.size === 0) {
            showToast("warn", t("ai_styler.toast.no_categories.title"), t("ai_styler.toast.no_categories.body"), 5000);
            return;
        }

        // User explicitly triggered a new generate run — lift the cleared guard.
        state.suggestionsManuallyCleared = false;
        syncSuggestionsFromSidebarState();

        // Lock early to prevent re-entrancy during async pre-flight checks
        const isLocalModel = providerAtStart === "ollama" && isLocalModelName(selectedModelAtStart);
        state.isGenerating = true;
        updateGenerateButton();

        // Check if ComfyUI is busy and show confirmation dialog (LOCAL models only)
        if (isLocalModel) {
            const isBusy = await checkComfyUIBusy();
            if (isBusy) {
                const confirmed = await showConfirm(
                  t("ai_styler.confirm.comfyui_busy.title"),
                  t("ai_styler.confirm.comfyui_busy.body"),
                  { type: "default" },
                );

                if (!confirmed) {
                    state.isGenerating = false;
                    updateGenerateButton();
                    return;
                }
            }
        }

        const styleByCategory = buildLocalStyleIndex(state.styleIndex || []);

        const queryCategoriesSnapshot = (state.suggestionsCategories || []).filter((category) => state.scopedCategories.has(category));

        // Query iterates over currently visible Suggestions categories (synced from sidebar state).
        const categoryStylesForRun = {};
        for (const category of queryCategoriesSnapshot) {
            const styles = styleByCategory[category];
            if (styles && styles.length > 0) {
                categoryStylesForRun[category] = styles;
            }
        }

        if (Object.keys(categoryStylesForRun).length === 0) {
            setSuggestionText(t("ai_styler.suggestions.no_catalog"));
            state.isGenerating = false;
            updateGenerateButton();
            return;
        }

        persistLastUsedProviderModel(
            providerOptionAtStart,
            selectedModelAtStart
        );
        persistLastLLMPrompt(promptAtStart);

        resetGenerateSession();

        // Create new AbortController for this request
        state.abortController = new AbortController();
        state.isGenerating = true;
        state.isLocalQueryRun = isLocalModel;
        state.omittedCategoryRequestIds.clear();
        state.activeCategory = "";
        state.activeCategoryRequestId = 0;
        state.lastRequestModel = requestModelAtStart;
        updateGenerateButton();
        state.suggestionText = t("ai_styler.suggestions.loading");

        const sequenceStart = performance.now();

        try {
            startStatusTimer();
            tickerType(t("ai_styler.statusbar.starting"));

            const scopedCategories = queryCategoriesSnapshot.filter((category) => !!categoryStylesForRun[category]?.length);
            if (scopedCategories.length === 0) {
                stopStatusTimer();
                updateStatusBar("ready");
                setSuggestionText(t("ai_styler.suggestions.no_catalog"));
                return;
            }

            const rawRepliesByCategory = {};
            let totalUpdatedCount = 0;

            // Initialize the dynamic run queue
            state.runQueue = [...scopedCategories];
            state.runQueueIndex = 0;
            // In-flight guard: defensive check to prevent concurrent queue executions
            if (state.runQueueIsRunning) {
                console.warn("[AI Presets] Queue runner guard: already active, skipping");
                return;
            }
            setRunQueueIsRunning(true);
            state.progressTotal = scopedCategories.length;
            state.progressDone = 0;

            startLocalSequentialSuggestions(requestModelAtStart, scopedCategories);

            // Process queue with while-loop so dynamically added categories are picked up
            while (state.runQueueIndex < state.runQueue.length) {
                if (!isLatestRun(runId)) return;
                if (state.abortController?.signal?.aborted) {
                    const abortErr = new Error("Request cancelled by user.");
                    abortErr.name = "AbortError";
                    throw abortErr;
                }

                const category = state.runQueue[state.runQueueIndex];
                state.runQueueIndex += 1;

                // Skip if category was dequeued (status removed) between enqueue and processing
                if (!state.localSequentialStatusByCategory[category]) continue;

                setLocalSequentialCategoryStatus(category, "running");

                const displayCategory = category.replace(/_/g, " ");

                // Resolve style data - may be a dynamically enqueued category
                const categoryStyles = categoryStylesForRun[category] || styleByCategory[category] || [];
                if (!categoryStyles || categoryStyles.length === 0) {
                    setLocalSequentialCategoryStatus(category, "no_results");
                    logKeepSelectedNoStyles(category, "no_allowed_styles", "query");
                    continue;
                }

                const candidateMessages = buildRefineCategoryMessages({
                    categoryKey: category,
                    promptText: promptAtStart,
                    styleData: categoryStyles,
                    maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
                });
                const queryTimeoutMs = requestTimeoutMsAtStart;

                let candidateReply = null;
                let categoryFailed = false;
                let categoryOmitted = false;
                let categoryFailureReason = "";
                const attemptLabel = `(attempt 1/${RETRY_MAX_ATTEMPTS})`;
                const qSummary = buildStatusSummary();
                const qSummaryPart = qSummary ? ` \u2014 ${qSummary}` : "";
                tickerType(t("ai_styler.statusbar.querying_category", { category: displayCategory, attempt: attemptLabel, summary: qSummaryPart }));

                const { requestId: categoryRequestId, signal: categoryRequestSignal } = beginCategoryRequest(category);
                try {
                    const requestResult = await requestLlmCategoryWithGlobalBackoff({
                        provider: providerAtStart,
                        model: requestModelAtStart,
                        messages: candidateMessages,
                        apiKey: providerApiKeyAtStart,
                        timeoutMs: queryTimeoutMs,
                        signal: categoryRequestSignal,
                        maxAttempts: RETRY_MAX_ATTEMPTS,
                        onRateLimited: async ({ nextAttempt, maxAttempts, error, delayMs }) => {
                            setStatusBarBulletState({ visible: true, variant: "ratelimit", pulsing: true, title: t("ai_styler.statusbar.rate_limited") });
                            const delaySec = (delayMs / 1000).toFixed(1);
                            await tickerType(t("ai_styler.statusbar.rate_limited_retry", { status: error.status, delay: delaySec, attempt: nextAttempt + 1, max: maxAttempts }), { extraClass: "dsp-ai-presets-status-bar-typed--ratelimit" });
                        },
                        onRateLimitWaitComplete: ({ attempt, maxAttempts }) => {
                            setStatusBarBulletState({ visible: true, variant: "running", pulsing: false, title: t("ai_styler.statusbar.running") });
                            const resumeSummary = buildStatusSummary();
                            const resumeSummaryPart = resumeSummary ? ` \u2014 ${resumeSummary}` : "";
                            tickerType(t("ai_styler.statusbar.querying_attempt", { category: displayCategory, attempt: attempt + 1, max: maxAttempts, summary: resumeSummaryPart }));
                        },
                    });

                    if (!isLatestRun(runId) || state.omittedCategoryRequestIds.has(categoryRequestId)) {
                        categoryOmitted = true;
                    } else if (requestResult.ok) {
                        candidateReply = requestResult.replyText;
                    } else {
                        const normalizedFailure = reportLlmRequestFailure(requestResult.error, {
                            provider: providerAtStart,
                            modelName: requestModelAtStart,
                            fallbackInlineText: requestResult.errorLabel || "",
                        });
                        state.categoryHttpError[category] = normalizedFailure.statusTextForChip;
                        if (requestResult.reason === "timeout") {
                            setLocalSequentialCategoryStatus(category, "timeout");
                            categoryFailureReason = "timeout";
                        } else {
                            setLocalSequentialCategoryStatus(category, "http_error");
                            categoryFailureReason = `http_error:${normalizedFailure.statusTextForChip}`;
                        }
                        await tickerType(t("ai_styler.statusbar.skipping_category", { error: normalizedFailure.statusTextForChip, category: displayCategory }));
                        categoryFailed = true;
                    }
                } catch (reqErr) {
                    if (state.omittedCategoryRequestIds.has(categoryRequestId)) {
                        categoryOmitted = true;
                    } else {
                        if (reqErr?.name === "AbortError") throw reqErr;
                        const normalizedFailure = reportLlmRequestFailure(reqErr, {
                            provider: providerAtStart,
                            modelName: requestModelAtStart,
                        });
                        state.categoryHttpError[category] = normalizedFailure.statusTextForChip;
                        setLocalSequentialCategoryStatus(category, "http_error");
                        categoryFailureReason = `http_error:${normalizedFailure.statusTextForChip}`;
                        await tickerType(t("ai_styler.statusbar.skipping_category", { error: normalizedFailure.statusTextForChip, category: displayCategory }));
                        categoryFailed = true;
                    }
                } finally {
                    endCategoryRequest(categoryRequestId);
                }
                if (categoryOmitted) {
                    logKeepSelectedNoStyles(category, "omitted", "query");
                    continue;
                }
                if (categoryFailed) {
                    logKeepSelectedNoStyles(category, categoryFailureReason || "request_failed", "query");
                    continue;
                }

                if (!isLatestRun(runId)) return;

                rawRepliesByCategory[category] = candidateReply;
                updateLocalSequentialRawJson(rawRepliesByCategory);

                const allowedNames = categoryStyles.map((item) => item.title);
                const parsedSelection = parseRefineCategoryReply({
                    replyText: candidateReply,
                    categoryKey: category,
                    allowedNames,
                    categoryAliases: CATEGORY_ALIASES,
                    maxCandidates: MAX_MODEL_CANDIDATES_PER_CATEGORY,
                });

                if (!parsedSelection.ok || parsedSelection.candidates.length === 0) {
                    console.warn(`[AI Presets] Parse failed: ${category}: ${parsedSelection.reason || "Invalid JSON reply"}`);
                    setLocalSequentialCategoryStatus(category, "no_results");
                    logKeepSelectedNoStyles(category, parsedSelection.reason || "parse_failed", "query");
                    await tickerType(t("ai_styler.statusbar.no_results_for", { category: displayCategory }));
                    continue;
                }

                const categoryCandidates = parsedSelection.candidates;
                if (AI_PRESETS_DEBUG && parsedSelection.fallbackScoresApplied > 0 && categoryCandidates.length > 0) {
                    console.log(`Accepted response without scores; applied fallback scores (${parsedSelection.fallbackScoresApplied} items)`);
                }

                const result = applyGeneratedCandidateSelection({ [category]: categoryCandidates });
                totalUpdatedCount += result.updatedCount;

                setLocalSequentialCategoryStatus(category, "done");

                // Ticker: show result count for this category.
                const rSummary = buildStatusSummary();
                const rSummaryPart = rSummary ? ` \u2014 ${rSummary}` : "";
                await tickerType(t("ai_styler.statusbar.suggestions_from", { count: categoryCandidates.length, category: displayCategory }) + rSummaryPart);
            }

            if (totalUpdatedCount > 0) {
                showToast("success", t("ai_styler.toast.query_success.title"), totalUpdatedCount === 1 ? t("ai_styler.toast.query_success.body_singular", { count: totalUpdatedCount }) : t("ai_styler.toast.query_success.body_plural", { count: totalUpdatedCount }));
            }

            stopStatusTimer();
            // Clear the loading text so it doesn't leak into later syncs
            state.suggestionText = "Results will appear here.";
            const finalStatus = state.failedCount > 0 ? "error" : "success";
            updateStatusBar(finalStatus, { duration: Math.round(performance.now() - sequenceStart) });
            // Ticker: type full final summary
            const fSummary = buildStatusSummary();
            const fSummaryPart = fSummary ? ` \u2014 ${fSummary}` : "";
            const fSelectedPart = totalUpdatedCount > 0
                ? (totalUpdatedCount === 1 ? t("ai_styler.toast.query_success.body_singular", { count: totalUpdatedCount }) : t("ai_styler.toast.query_success.body_plural", { count: totalUpdatedCount }))
                : t("ai_styler.statusbar.no_styles_selected");
            const doneLabel = state.failedCount > 0 ? t("ai_styler.statusbar.done_warnings") : t("ai_styler.statusbar.done");
            tickerType(`${doneLabel} \u2014 ${fSelectedPart}${fSummaryPart}`);
        } catch (err) {
            if (!isLatestRun(runId)) return;
            invalidateLocalSequentialChipRendering();

            // Mark remaining queued items as cancelled
            for (const cat of state.runQueue) {
                if (state.localSequentialStatusByCategory[cat] === "queued" || state.localSequentialStatusByCategory[cat] === "running") {
                    state.localSequentialStatusByCategory[cat] = "cancelled";
                    renderLocalSequentialSuggestionRow(cat);
                }
            }

            stopStatusTimer();
            const duration = Math.round(performance.now() - sequenceStart);
            if (err.name === "AbortError") {
                stopSidebarChipTypingForCurrentRun();
                updateStatusBar("cancelled", { duration });
                tickerType(t("ai_styler.statusbar.cancelled"));
            } else {
                updateStatusBar("error", { duration, reason: "Error" });
                const shortReason = err?.message ? err.message.slice(0, 60) : "Unknown error";
                tickerType(t("ai_styler.statusbar.error_reason", { reason: shortReason }));
            }

            // Check if this was a cancellation
            if (err.name === "AbortError") {
                if (!state.suggestionsVisible) {
                    setSuggestionText(t("ai_styler.suggestions.cancelled"));
                }
                showToast("info", t("ai_styler.toast.cancelled.title"), t("ai_styler.toast.cancelled.body"));
                return;
            }

            const normalizedFailure = reportLlmRequestFailure(err, {
                provider: providerAtStart,
                modelName: requestModelAtStart,
            });
            if (!state.localSequentialActive || !state.suggestionsVisible) {
                renderSelectionError(
                    requestModelAtStart,
                    t("ai_styler.statusbar.error"),
                    [normalizedFailure.inlineErrorText],
                    null,
                    "",
                    ""
                );
            }
        } finally {
            if (isLatestRun(runId)) {
                state.isGenerating = false;
                state.abortController = null;
                state.isLocalQueryRun = false;
                state.activeCategory = "";
                state.activeCategoryRequestId = 0;
                state.activeCategoryAbortController = null;
                state.activeCategoryAbortCleanup = null;
                state.omittedCategoryRequestIds.clear();
                state.runQueue = [];
                state.runQueueIndex = 0;
                state.runAllowedStyles = null;
                setRunQueueIsRunning(false);
                // Clear any deferred sidebar sync that accumulated during the run.
                state.pendingSidebarSync = false;
                updateProviderKeyVisibility();
                updateModelStatus();
                updateGenerateButton();
                updateViewJsonButton();
                // Refresh the snapshot so that returning to this tab after a
                // background completion restores the correct post-run state and
                // does not replay stale "running" statuses captured mid-run.
                captureModuleSnapshot();
            }
        }
    });

    const resizeObserver = new ResizeObserver(() => {
        renderCategoryList();
    });
    resizeObserver.observe(categoryList);

    renderCategoryList();
    populateModelSelect();
    updateModelRefreshButtonState();
    updateModelStatus();
    updateGenerateButton();
    setSuggestionText(state.suggestionText);
    updateStatusBar("ready");
    updateViewJsonButton();

    const moduleDef = manager?.getModule("ai-presets");
    if (moduleDef) {
        moduleDef._setOnSelect = setOnSelect;
        moduleDef._setOnApply = setOnApply;
        moduleDef._setOnCancel = setOnCancel;
        moduleDef._render = render;
        moduleDef._refreshModels = fetchOllamaModels;
        moduleDef._startOllamaPolling = startOllamaPolling;
        moduleDef._stopOllamaPolling = stopOllamaPolling;
        moduleDef._hasActiveWork = hasActiveWork;
        moduleDef._cancelActiveWorkForClose = cancelActiveWorkForClose;
        moduleDef._captureModuleSnapshot = captureModuleSnapshot;
        moduleDef._restoreModuleSnapshot = restoreModuleSnapshot;
        moduleDef._handleTabDeactivate = handleTabDeactivate;
        moduleDef._autoPopulateSuggestionsFromSidebar = autoPopulateSuggestionsFromSidebar;
        moduleDef._state = state;
        moduleDef._promptInput = promptInput;
        moduleDef._setNodePromptBindings = setNodePromptStateBindings;
        moduleDef._applyPersistedPrompt = () => applyPersistedPromptToInput();
        moduleDef._refreshPlaceholder = () => refreshPromptPlaceholder(promptInput);
        moduleDef._updateTabActivityIndicator = updateTabActivityIndicator;
        moduleDef._shouldRefreshModelsOnTabActivate = shouldRefreshModelsOnTabActivate;
    }

    applyPersistedPromptToInput();
    void refreshPromptPlaceholder(promptInput);

    fetchOllamaModels();
}

registerModule({
    id: "ai-presets",
    labelKey: "tabs.ai_styler",
    order: 10,
    slot: "overlay",
    buildUI: buildAiPresetsHtml,
    initUI: initAiPresets,
    onActivate: async ({ manager }) => {
        activationCounter++;
        const moduleDef = manager?.getModule("ai-presets");
        if (!moduleDef) return;

        if (moduleDef._state) moduleDef._state.ollamaTabActive = true;

        // If background work is still running, skip snapshot restore — the live
        // state is already up-to-date and restoring a stale snapshot would
        // overwrite results that arrived while the tab was inactive.
        const workRunning = moduleDef._hasActiveWork && moduleDef._hasActiveWork();
        if (!workRunning) {
            if (moduleDef._restoreModuleSnapshot) moduleDef._restoreModuleSnapshot();
        }

        const shouldRefreshModels = moduleDef._shouldRefreshModelsOnTabActivate
            ? moduleDef._shouldRefreshModelsOnTabActivate()
            : true;
        if (shouldRefreshModels && moduleDef._refreshModels) moduleDef._refreshModels();
        if (moduleDef._applyPersistedPrompt) moduleDef._applyPersistedPrompt();

        if (moduleDef._autoPopulateSuggestionsFromSidebar && !workRunning) {
            moduleDef._autoPopulateSuggestionsFromSidebar();
        }

        if (moduleDef._refreshPlaceholder) {
            await moduleDef._refreshPlaceholder();
        }
    },
    onDeactivate: ({ manager }) => {
        const moduleDef = manager?.getModule("ai-presets");
        if (!moduleDef) return;
        if (moduleDef._state) moduleDef._state.ollamaTabActive = false;
        if (moduleDef._stopOllamaPolling) moduleDef._stopOllamaPolling();
        if (moduleDef._handleTabDeactivate) {
            void moduleDef._handleTabDeactivate();
        } else if (moduleDef._captureModuleSnapshot) {
            moduleDef._captureModuleSnapshot();
        }
    },
});


