const MODEL_CACHE_KEY_PREFIX = "dsp_llm_models_cache:";
const MODEL_DISCOVERY_TIMEOUT_MS = 15000;
const MODEL_REFRESH_REQUIRED_KEY_PROVIDER_IDS = new Set(["openai", "anthropic", "groq", "gemini"]);

export const OPENAI_MODEL_DEFAULT = "gpt-5.2";
export const ANTHROPIC_MODEL_DEFAULT = "claude-3-7-sonnet-latest";
export const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash";
export const HUGGINGFACE_MODEL_DEFAULT = "Qwen/Qwen2.5-7B-Instruct";
export const GROQ_MODEL_DEFAULT = "llama-3.3-70b-versatile";

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
const HUGGINGFACE_EXCLUDED_MODEL_IDS = new Set([
    "dphn/dolphin-2.9.1-yi-1.5-34b",
    "facebook/opt-125m",
    "openai-community/gpt2",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]);
const HUGGINGFACE_ALLOWED_QWEN_MODEL_ID = "qwen/qwen3-8b";

const GROQ_STYLER_EXCLUDED_TOKENS = ["whisper", "guard", "prompt-guard", "safeguard", "arabic", "saudi"];
const GROQ_STYLER_RECOMMENDED_PRIORITY = [
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "moonshotai/kimi-k2-instruct",
];
const GROQ_STYLER_BUDGET_PRIORITY = ["llama-3.1-8b-instant", "groq/compound-mini", "groq/compound"];

function getProviderModelCacheStorageKey(providerId) {
    return `${MODEL_CACHE_KEY_PREFIX}${providerId}`;
}

function getProviderOptionDisplayName(providerId) {
    if (providerId === "openai") return "OpenAI";
    if (providerId === "anthropic") return "Anthropic";
    if (providerId === "groq") return "Groq";
    if (providerId === "gemini") return "Gemini";
    if (providerId === "huggingface") return "Hugging Face";
    if (providerId === "ollama_cloud") return "Ollama (Cloud)";
    if (providerId === "ollama_local") return "Ollama (Local)";
    return "Provider";
}

function normalizeDiscoveredModelList(models, providerId, fetchedAt = Date.now()) {
    const list = Array.isArray(models) ? models : [];
    const normalized = [];
    const seen = new Set();

    list.forEach((entry) => {
        let id = "";
        let label = "";
        let active = true;
        let supportedGenerationMethods = [];
        if (typeof entry === "string") {
            id = entry.trim();
            label = id;
        } else if (entry && typeof entry === "object") {
            id = String(entry.id || entry.name || entry.model || "").trim();
            label = String(entry.label || entry.display_name || entry.displayName || entry.name || id).trim();
            active = entry.active !== false;
            supportedGenerationMethods = Array.isArray(entry.supportedGenerationMethods)
                ? entry.supportedGenerationMethods
                    .map((method) => String(method || "").trim())
                    .filter(Boolean)
                : [];
        }
        if (!id || seen.has(id)) return;
        seen.add(id);
        normalized.push({
            id,
            label: label || id,
            provider: providerId,
            fetchedAt,
            active,
            supportedGenerationMethods,
        });
    });

    return normalized;
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
    const normalized = normalizeDiscoveredModelList(rawModels, "openai", 0);
    const supportedModelIds = new Set();
    const aliasBySnapshot = {};
    const snapshotsByAlias = {};
    const visibleAliasEntries = new Map();

    normalized.forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        const idLower = id.toLowerCase();
        if (isOpenAIStylerHardExcluded(idLower)) return;
        if (isOpenAIStylerLegacyExcluded(idLower)) return;
        if (!isOpenAIStylerAllowedFamily(idLower)) return;

        supportedModelIds.add(id);

        const { alias, isSnapshot } = getOpenAISnapshotAlias(id);
        if (isSnapshot) {
            aliasBySnapshot[id] = alias;
            if (!snapshotsByAlias[alias]) snapshotsByAlias[alias] = [];
            snapshotsByAlias[alias].push(id);
            return;
        }

        visibleAliasEntries.set(alias, {
            id: alias,
            label: alias,
        });
    });

    Object.keys(snapshotsByAlias).forEach((alias) => {
        snapshotsByAlias[alias] = snapshotsByAlias[alias]
            .slice()
            .sort((a, b) => a.localeCompare(b));
    });

    const visibleAliasList = Array.from(visibleAliasEntries.values())
        .filter((entry) => !isOpenAIChatLatestAlias(entry.id.toLowerCase()));
    const recommendedPool = visibleAliasList.filter((entry) => {
        const lower = entry.id.toLowerCase();
        return !isOpenAIAdvancedModel(lower) && !isOpenAIBudgetModel(lower);
    });
    const budgetPool = visibleAliasList.filter((entry) => {
        const lower = entry.id.toLowerCase();
        return !isOpenAIAdvancedModel(lower) && isOpenAIBudgetModel(lower);
    });
    const advancedPool = visibleAliasList.filter((entry) => isOpenAIAdvancedModel(entry.id.toLowerCase()));

    const selectedVisible = new Set();
    const recommended = pickPrioritizedModels(
        recommendedPool,
        OPENAI_STYLER_RECOMMENDED_PRIORITY,
        5,
        selectedVisible
    );
    const budget = pickPrioritizedModels(
        budgetPool,
        OPENAI_STYLER_BUDGET_PRIORITY,
        5,
        selectedVisible
    );
    const advanced = [];

    let totalVisible = recommended.length + budget.length;
    if (totalVisible < 6) {
        const advancedCandidates = pickPrioritizedModels(
            advancedPool,
            OPENAI_STYLER_ADVANCED_PRIORITY,
            2,
            selectedVisible
        );
        advanced.push(...advancedCandidates);
        totalVisible = recommended.length + budget.length + advanced.length;
    }

    const visibleGroups = [];
    if (recommended.length > 0) {
        visibleGroups.push({
            label: "Recomendado",
            hint: "Mas caro / Mejor calidad",
            models: recommended,
        });
    }
    if (budget.length > 0) {
        visibleGroups.push({
            label: "Barato",
            hint: "Mas barato / Mas rapido",
            models: budget,
        });
    }
    if (advanced.length > 0) {
        visibleGroups.push({
            label: "Avanzado",
            hint: "Uso avanzado",
            models: advanced,
        });
    }

    const visibleFlatModels = visibleGroups.flatMap((group) =>
        group.models.map((entry) => ({
            id: entry.id,
            label: entry.label,
            group: group.label,
            hint: group.hint,
        }))
    );

    return {
        supportedModelIds,
        visibleGroups,
        visibleFlatModels,
        aliasBySnapshot,
        snapshotsByAlias,
    };
}

function resolveOpenAIModelForUI(modelId, openAiCatalog) {
    const raw = String(modelId || "").trim();
    if (!raw || !openAiCatalog || typeof openAiCatalog !== "object") return "";
    if (openAiCatalog.supportedModelIds?.has(raw)) {
        const mappedAlias = openAiCatalog.aliasBySnapshot?.[raw];
        return mappedAlias || raw;
    }
    return "";
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
    const normalized = normalizeDiscoveredModelList(rawModels, "groq", 0);
    const supportedModelIds = new Set();
    const aliasBySnapshot = {};
    const snapshotsByAlias = {};
    const visibleAliasEntries = new Map();

    normalized.forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        const idLower = id.toLowerCase();
        if (entry?.active === false) return;
        if (isGroqStylerHardExcluded(idLower)) return;
        if (!isGroqStylerAllowedFamily(idLower)) return;

        supportedModelIds.add(id);

        const { alias, isSnapshot } = getGroqSnapshotAlias(id);
        if (isSnapshot) {
            aliasBySnapshot[id] = alias;
            if (!snapshotsByAlias[alias]) snapshotsByAlias[alias] = [];
            snapshotsByAlias[alias].push(id);
            return;
        }

        visibleAliasEntries.set(alias, {
            id: alias,
            label: alias,
        });
    });

    Object.keys(snapshotsByAlias).forEach((alias) => {
        snapshotsByAlias[alias] = snapshotsByAlias[alias]
            .slice()
            .sort((a, b) => a.localeCompare(b));
    });

    const visibleAliasList = Array.from(visibleAliasEntries.values());
    const recommendedPool = visibleAliasList.filter((entry) => {
        const lower = entry.id.toLowerCase();
        return !lower.startsWith("llama-3.1-8b-instant")
            && !lower.startsWith("groq/compound-mini")
            && !lower.startsWith("groq/compound");
    });
    const budgetPool = visibleAliasList.filter((entry) => {
        const lower = entry.id.toLowerCase();
        return lower.startsWith("llama-3.1-8b-instant")
            || lower.startsWith("groq/compound-mini")
            || lower.startsWith("groq/compound");
    });

    const selectedVisible = new Set();
    const recommended = pickPrioritizedModels(
        recommendedPool,
        GROQ_STYLER_RECOMMENDED_PRIORITY,
        5,
        selectedVisible
    );
    const budget = pickPrioritizedModels(
        budgetPool,
        GROQ_STYLER_BUDGET_PRIORITY,
        3,
        selectedVisible
    );

    const visibleGroups = [];
    if (recommended.length > 0) {
        visibleGroups.push({
            label: "Recomendado",
            hint: "Mejor calidad",
            models: recommended,
        });
    }
    if (budget.length > 0) {
        visibleGroups.push({
            label: "Barato / Rapido",
            hint: "Mas barato / Mas rapido",
            models: budget,
        });
    }

    let visibleFlatModels = visibleGroups.flatMap((group) =>
        group.models.map((entry) => ({
            id: entry.id,
            label: entry.label,
            group: group.label,
            hint: group.hint,
        }))
    );
    if (visibleFlatModels.length > 8) {
        visibleFlatModels = visibleFlatModels.slice(0, 8);
        const visibleIds = new Set(visibleFlatModels.map((entry) => entry.id));
        visibleGroups.forEach((group) => {
            group.models = group.models.filter((entry) => visibleIds.has(entry.id));
        });
    }

    return {
        supportedModelIds,
        visibleGroups: visibleGroups.filter((group) => group.models.length > 0),
        visibleFlatModels,
        aliasBySnapshot,
        snapshotsByAlias,
    };
}

function resolveGroqModelForUI(modelId, groqCatalog) {
    const raw = String(modelId || "").trim();
    if (!raw || !groqCatalog || typeof groqCatalog !== "object") return "";
    if (groqCatalog.supportedModelIds?.has(raw)) {
        const mappedAlias = groqCatalog.aliasBySnapshot?.[raw];
        return mappedAlias || raw;
    }
    return "";
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
    const normalized = normalizeDiscoveredModelList(rawModels, "gemini", 0);
    const supportedModelIds = new Set();
    const aliasByVariant = {};
    const variantsByAlias = {};
    const visibleAliasEntries = new Map();
    const idSet = new Set();

    normalized.forEach((entry) => {
        const id = normalizeGoogleModelId(entry?.id);
        if (!id) return;
        idSet.add(id);
    });

    normalized.forEach((entry) => {
        const id = normalizeGoogleModelId(entry?.id);
        if (!id) return;
        const idLower = id.toLowerCase();
        const methods = Array.isArray(entry?.supportedGenerationMethods) ? entry.supportedGenerationMethods : [];

        if (entry?.active === false) return;
        if (!hasGeminiGenerateContentSupport(methods)) return;
        if (hasGeminiPredictSignature(methods)) return;
        if (isGeminiBidiOnly(methods)) return;
        if (isGeminiStylerHardExcluded(idLower)) return;
        if (!isGeminiStylerAllowedFamily(idLower)) return;
        if (idLower.includes("-exp")) return;

        supportedModelIds.add(id);

        let alias = id;
        const is001Variant = /-001$/i.test(id);
        if (is001Variant) {
            const baseAlias = id.replace(/-001$/i, "");
            if (idSet.has(baseAlias)) {
                alias = baseAlias;
                aliasByVariant[id] = baseAlias;
                if (!variantsByAlias[baseAlias]) variantsByAlias[baseAlias] = [];
                variantsByAlias[baseAlias].push(id);
            }
        }

        if (!visibleAliasEntries.has(alias)) {
            visibleAliasEntries.set(alias, {
                id: alias,
                label: alias,
            });
        }
    });

    Object.keys(variantsByAlias).forEach((alias) => {
        variantsByAlias[alias] = variantsByAlias[alias]
            .slice()
            .sort((a, b) => a.localeCompare(b));
    });

    const visibleAliasList = Array.from(visibleAliasEntries.values());
    const recommendedPool = visibleAliasList.filter((entry) =>
        GEMINI_STYLER_RECOMMENDED_PRIORITY.includes(entry.id)
    );
    const budgetPool = visibleAliasList.filter((entry) =>
        GEMINI_STYLER_BUDGET_PRIORITY.includes(entry.id)
    );

    const selectedVisible = new Set();
    const recommended = pickPrioritizedModels(
        recommendedPool,
        GEMINI_STYLER_RECOMMENDED_PRIORITY,
        5,
        selectedVisible
    );
    const budget = pickPrioritizedModels(
        budgetPool,
        GEMINI_STYLER_BUDGET_PRIORITY,
        3,
        selectedVisible
    );

    const remaining = visibleAliasList
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((entry) => !selectedVisible.has(entry.id));
    while ((recommended.length + budget.length) < 6 && remaining.length > 0) {
        const next = remaining.shift();
        if (!next) break;
        if (GEMINI_STYLER_BUDGET_PRIORITY.includes(next.id) && budget.length < 5) {
            budget.push(next);
        } else if (recommended.length < 5) {
            recommended.push(next);
        } else if (budget.length < 5) {
            budget.push(next);
        } else {
            break;
        }
        selectedVisible.add(next.id);
    }

    const visibleGroups = [];
    if (recommended.length > 0) {
        visibleGroups.push({
            label: "Recomendado",
            hint: "Mejor calidad",
            models: recommended,
        });
    }
    if (budget.length > 0) {
        visibleGroups.push({
            label: "Barato / Rapido",
            hint: "Mas barato / Mas rapido",
            models: budget,
        });
    }

    let visibleFlatModels = visibleGroups.flatMap((group) =>
        group.models.map((entry) => ({
            id: entry.id,
            label: entry.label,
            group: group.label,
            hint: group.hint,
        }))
    );
    if (visibleFlatModels.length > 10) {
        visibleFlatModels = visibleFlatModels.slice(0, 10);
        const visibleIds = new Set(visibleFlatModels.map((entry) => entry.id));
        visibleGroups.forEach((group) => {
            group.models = group.models.filter((entry) => visibleIds.has(entry.id));
        });
    }

    return {
        supportedModelIds,
        visibleGroups: visibleGroups.filter((group) => group.models.length > 0),
        visibleFlatModels,
        aliasByVariant,
        variantsByAlias,
    };
}

function resolveGeminiModelForUI(modelId, geminiCatalog) {
    const raw = normalizeGoogleModelId(modelId);
    if (!raw || !geminiCatalog || typeof geminiCatalog !== "object") return "";
    if (geminiCatalog.supportedModelIds?.has(raw)) {
        const mappedAlias = geminiCatalog.aliasByVariant?.[raw];
        return mappedAlias || raw;
    }
    return "";
}

function hasHuggingFaceExcludedKeyword(textValue) {
    const lower = String(textValue || "").toLowerCase();
    if (!lower) return false;
    return HUGGINGFACE_STYLER_EXCLUDED_KEYWORDS.some((token) => lower.includes(token));
}

function isExcludedHuggingFaceModelId(modelId) {
    const normalized = String(modelId || "").trim().toLowerCase();
    if (!normalized) return false;
    if (HUGGINGFACE_EXCLUDED_MODEL_IDS.has(normalized)) return true;
    if (normalized.startsWith("qwen/") && normalized !== HUGGINGFACE_ALLOWED_QWEN_MODEL_ID) return true;
    return false;
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
    const models = Array.isArray(rawModels) ? rawModels : [];
    const seen = new Set();
    const filtered = [];

    models.forEach((entry) => {
        const id = String(entry?.modelId || entry?.id || "").trim();
        if (!id || seen.has(id)) return;
        if (isExcludedHuggingFaceModelId(id)) return;
        if (!isHuggingFaceStylerModel(entry)) return;
        seen.add(id);
        const downloads = Number.isFinite(entry?.downloads) ? Number(entry.downloads) : -1;
        filtered.push({
            id,
            label: id,
            downloads,
        });
    });

    filtered.sort((a, b) => {
        if (a.downloads !== b.downloads) return b.downloads - a.downloads;
        return a.id.localeCompare(b.id);
    });

    return filtered
        .slice(0, HUGGINGFACE_VISIBLE_MODELS_LIMIT)
        .map(({ id, label }) => ({ id, label }));
}

function registerDynamicProviderModels(dynamicModelSetsByProvider, providerId, models) {
    const targetSet = dynamicModelSetsByProvider?.[providerId] || null;
    if (!targetSet) return;
    (models || []).forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        targetSet.add(id);
    });
}

function loadProviderModelCacheEntry(providerId, { getPersistedJSON }) {
    const payload = getPersistedJSON(getProviderModelCacheStorageKey(providerId), null);
    if (!payload || typeof payload !== "object") return null;
    if (String(payload.providerId || "").trim() !== providerId) return null;
    const fetchedAt = Number.isFinite(payload.fetchedAt) ? Number(payload.fetchedAt) : Date.now();
    const models = normalizeDiscoveredModelList(payload.models, providerId, fetchedAt);
    return {
        providerId,
        fetchedAt,
        models,
    };
}

function persistProviderModelCacheEntry({ state, dynamicModelSetsByProvider, setPersistedJSON }, providerId, models, fetchedAt = Date.now()) {
    const normalized = normalizeDiscoveredModelList(models, providerId, fetchedAt);
    const payload = {
        providerId,
        fetchedAt,
        models: normalized,
    };
    state.providerModelCache[providerId] = payload;
    setPersistedJSON(getProviderModelCacheStorageKey(providerId), payload);
    registerDynamicProviderModels(dynamicModelSetsByProvider, providerId, normalized);
    return normalized;
}

function loadProviderModelCachesFromStorage({ state, dynamicModelSetsByProvider, getPersistedJSON }) {
    const refreshableProviderIds = ["ollama_local", "ollama_cloud", "openai", "anthropic", "groq", "gemini", "huggingface"];
    refreshableProviderIds.forEach((providerId) => {
        const entry = loadProviderModelCacheEntry(providerId, { getPersistedJSON });
        if (!entry) return;
        state.providerModelCache[providerId] = entry;
        registerDynamicProviderModels(dynamicModelSetsByProvider, providerId, entry.models);
    });
}

function getModelsForProvider({ state }, providerId, builtInModels) {
    const shouldFilterHuggingFace = providerId === "huggingface";
    const builtIns = normalizeDiscoveredModelList(builtInModels, providerId, 0)
        .map((entry) => ({
            id: entry.id,
            label: entry.label,
            active: entry.active !== false,
            supportedGenerationMethods: Array.isArray(entry.supportedGenerationMethods) ? entry.supportedGenerationMethods.slice() : [],
        }))
        .filter((entry) => !(shouldFilterHuggingFace && isExcludedHuggingFaceModelId(entry.id)));
    const cached = state.providerModelCache[providerId];
    if (!cached || !Array.isArray(cached.models)) {
        return builtIns;
    }

    const builtInById = new Map(builtIns.map((entry) => [entry.id, entry]));
    const merged = [];
    const seen = new Set();
    cached.models.forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id || seen.has(id)) return;
        if (shouldFilterHuggingFace && isExcludedHuggingFaceModelId(id)) return;
        seen.add(id);
        const builtIn = builtInById.get(id);
        merged.push({
            id,
            label: builtIn?.label || String(entry?.label || id).trim(),
            active: entry?.active !== false && builtIn?.active !== false,
            supportedGenerationMethods: Array.isArray(entry?.supportedGenerationMethods)
                ? entry.supportedGenerationMethods.slice()
                : Array.isArray(builtIn?.supportedGenerationMethods)
                    ? builtIn.supportedGenerationMethods.slice()
                    : [],
        });
    });
    return merged;
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

async function fetchModelDiscoveryJson(url, headers = {}, fetchImpl = fetch, timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(url, {
            method: "GET",
            headers,
            signal: controller.signal,
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const detail = extractDiscoveryErrorDetail(payload);
            const err = new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }
        return payload;
    } catch (err) {
        if (err?.name === "AbortError") {
            throw new Error("Request timed out");
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function discoverModelsForProvider(providerId, {
    getProviderApiKeySnapshot,
    ollamaFetchModels,
    requestTimeoutMs = MODEL_DISCOVERY_TIMEOUT_MS,
    fetchImpl = fetch,
} = {}) {
    if (providerId === "ollama_local" || providerId === "ollama_cloud") {
        const names = await ollamaFetchModels({ timeoutMs: requestTimeoutMs });
        const filtered = (Array.isArray(names) ? names : []).filter((name) => {
            if (typeof name !== "string" || !name.trim()) return false;
            return providerId === "ollama_cloud" ? name.endsWith("-cloud") : !name.endsWith("-cloud");
        });
        return filtered.map((id) => ({ id, label: id }));
    }

    if (providerId === "openai") {
        const apiKey = getProviderApiKeySnapshot("openai");
        const payload = await fetchModelDiscoveryJson("https://api.openai.com/v1/models", {
            Authorization: `Bearer ${apiKey}`,
        }, fetchImpl, requestTimeoutMs);
        const models = Array.isArray(payload?.data) ? payload.data : [];
        return models.map((entry) => {
            const id = String(entry?.id || "").trim();
            return { id, label: id };
        });
    }

    if (providerId === "anthropic") {
        const apiKey = getProviderApiKeySnapshot("anthropic");
        const payload = await fetchModelDiscoveryJson("https://api.anthropic.com/v1/models", {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
        }, fetchImpl, requestTimeoutMs);
        const models = Array.isArray(payload?.data) ? payload.data : [];
        return models.map((entry) => {
            const id = String(entry?.id || "").trim();
            const label = String(entry?.display_name || id).trim();
            return { id, label };
        });
    }

    if (providerId === "groq") {
        const apiKey = getProviderApiKeySnapshot("groq");
        const payload = await fetchModelDiscoveryJson("https://api.groq.com/openai/v1/models", {
            Authorization: `Bearer ${apiKey}`,
        }, fetchImpl, requestTimeoutMs);
        const models = Array.isArray(payload?.data) ? payload.data : [];
        const normalized = models
            .filter((entry) => entry?.active !== false)
            .map((entry) => {
                const id = String(entry?.id || "").trim();
                return {
                    id,
                    label: id,
                    active: entry?.active !== false,
                };
            })
            .filter((entry) => entry.id);
        const catalog = buildGroqStylerModelCatalog(normalized);
        return normalized.filter((entry) => catalog.supportedModelIds.has(entry.id)).map((entry) => {
            const id = String(entry?.id || "").trim();
            return { id, label: id, active: true };
        });
    }

    if (providerId === "gemini") {
        const apiKey = getProviderApiKeySnapshot("gemini");
        const payload = await fetchModelDiscoveryJson(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            {},
            fetchImpl,
            requestTimeoutMs
        );
        const models = Array.isArray(payload?.models) ? payload.models : [];
        const normalized = models
            .map((entry) => {
                const rawName = String(entry?.name || "").trim();
                const id = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
                const methods = Array.isArray(entry?.supportedGenerationMethods)
                    ? entry.supportedGenerationMethods
                        .map((method) => String(method || "").trim())
                        .filter(Boolean)
                    : [];
                const label = id;
                return { id, label, supportedGenerationMethods: methods };
            })
            .filter((entry) => entry.id);
        const catalog = buildGoogleAiStylerModelCatalog(normalized);
        return normalized
            .filter((entry) => catalog.supportedModelIds.has(entry.id))
            .map((entry) => ({
                id: entry.id,
                label: entry.id,
                supportedGenerationMethods: entry.supportedGenerationMethods,
            }));
    }

    if (providerId === "huggingface") {
        const token = getProviderApiKeySnapshot("huggingface");
        const params = new URLSearchParams({
            sort: "downloads",
            direction: "-1",
            limit: String(HUGGINGFACE_DISCOVERY_FETCH_LIMIT),
            full: "false",
            config: "false",
        });
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const payload = await fetchModelDiscoveryJson(`https://huggingface.co/api/models?${params.toString()}`, headers, fetchImpl, requestTimeoutMs);
        const models = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.models)
                ? payload.models
                : [];
        return buildHuggingFaceStylerModelList(models);
    }

    throw new Error("Provider does not support model discovery.");
}

function getRefreshFailureMessage(err) {
    const status = Number.isFinite(err?.status) ? Number(err.status) : null;
    if (status) return `HTTP ${status}`;
    const message = String(err?.message || "").trim();
    if (!message) return "Network error";
    return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

async function refreshModelsForProvider({
    providerId,
    state,
    dynamicModelSetsByProvider,
    providerSelectValue,
    modelSelectValue,
    getApiProviderForProviderOption,
    getProviderApiKeySnapshot,
    focusProviderApiKeyInput,
    showToast,
    updateModelRefreshButtonState,
    populateModelSelect,
    updateModelStatus,
    updateGenerateButton,
    requestTimeoutMs = MODEL_DISCOVERY_TIMEOUT_MS,
    fetchImpl = fetch,
    setPersistedJSON,
    ollamaFetchModels,
}) {
    const resolvedProviderId = String(providerId || "").trim();
    if (!resolvedProviderId || resolvedProviderId === "coming_soon") {
        showToast("info", "Refresh models", "This provider is not available yet.");
        return;
    }

    const requiresApiKey = MODEL_REFRESH_REQUIRED_KEY_PROVIDER_IDS.has(resolvedProviderId);
    const apiProvider = getApiProviderForProviderOption(resolvedProviderId);
    const providerApiKey = requiresApiKey ? getProviderApiKeySnapshot(apiProvider) : "";
    if (requiresApiKey && !providerApiKey) {
        showToast("warn", "Refresh models", `Configure the ${getProviderOptionDisplayName(resolvedProviderId)} API key to refresh models.`);
        focusProviderApiKeyInput(apiProvider);
        return;
    }

    if (state.refreshingProviderId) return;
    state.refreshingProviderId = resolvedProviderId;
    updateModelRefreshButtonState();

    const providerName = getProviderOptionDisplayName(resolvedProviderId);
    const previousProvider = String(state.selectedProvider || providerSelectValue || "").trim();
    const previousModel = String(state.selectedModel || modelSelectValue || "").trim();
    try {
        const discovered = await discoverModelsForProvider(resolvedProviderId, {
            getProviderApiKeySnapshot,
            ollamaFetchModels,
            requestTimeoutMs,
            fetchImpl,
        });
        const fetchedAt = Date.now();
        const normalized = persistProviderModelCacheEntry(
            {
                state,
                dynamicModelSetsByProvider,
                setPersistedJSON,
            },
            resolvedProviderId,
            discovered,
            fetchedAt
        );
        if (previousProvider === resolvedProviderId) {
            populateModelSelect(resolvedProviderId);
            if (previousModel && previousModel !== state.selectedModel) {
                if (state.selectedModel) {
                    showToast("warn", "Model updated", `${providerName}: previously selected model is unavailable. Switched to ${state.selectedModel}.`);
                } else {
                    showToast("warn", "Model updated", `${providerName}: previously selected model is unavailable and no models are currently listed.`);
                }
            }
        }
        showToast("success", "Refresh models", `${providerName}: loaded ${normalized.length} model${normalized.length === 1 ? "" : "s"}.`);
    } catch (err) {
        showToast("error", "Refresh models", `${providerName}: ${getRefreshFailureMessage(err)}`);
    } finally {
        state.refreshingProviderId = "";
        updateModelRefreshButtonState();
        updateModelStatus();
        updateGenerateButton();
    }
}

export function createAiStylerModels() {
    return {
        normalizeDiscoveredModelList,
        buildOpenAIStylerModelCatalog,
        buildGroqStylerModelCatalog,
        buildGoogleAiStylerModelCatalog,
        buildHuggingFaceStylerModelList,
        resolveOpenAIModelForUI,
        resolveGroqModelForUI,
        resolveGeminiModelForUI,
        fetchModelDiscoveryJson,
        discoverModelsForProvider,
        refreshModelsForProvider,
        loadProviderModelCacheEntry,
        persistProviderModelCacheEntry,
        loadProviderModelCachesFromStorage,
        getModelsForProvider,
        getProviderModelCacheStorageKey,
    };
}
