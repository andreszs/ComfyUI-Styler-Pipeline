import { app } from "../../scripts/app.js";
import { fetchStyleIndex, reloadData, getStyleIndex } from "./style-data.js";
import { createModuleManager } from "./modules/index.js";
import { initI18n, t } from "./modules/i18n.js";
import { initThemeSupport, applyThemeTokens } from "./theme.js";
import { showConfirm, showToast, getPersistedSetting, setPersistedSetting } from "./utils.js";

const NODE_TYPE = "DynamicStylerPipeline";
// Persistence key for window maximize state (namespaced to avoid conflicts)
const PANEL_MAXIMIZED_KEY = "pipeline_control.panel.isMaximized";
const LAST_ACTIVE_TAB_KEY = "last_active_tab";
const LAST_BROWSE_CATEGORY_KEY = "last_browse_category";
const NODE_JSON_META_KEY = "__dsp_meta__";
const NODE_JSON_META_PROMPT_KEY = "last_llm_prompt";
const CONTRIBUTE_BADGE_STYLESHEET_ID = "dsp-contribute-badge-stylesheet";
const EXTENSION_ASSETS_FALLBACK_DIR = "ComfyUI-Styler-Pipeline";

function buildShellHtml() {
    return `
<div class="dsp-tab-bar dsp-styler-shell-tabs-row dsp-styler-modal-titlebar dsp-styler-modal-tabs">
    <div class="dsp-tab-scroll-area dsp-styler-shell-header-left">
        <div class="dsp-tab-modules" data-module-slot="tabs"></div>
    </div>
    <div class="dsp-styler-shell-drag-handle dsp-styler-modal-drag-handle" data-role="drag-handle" aria-hidden="true"></div>
    <div class="dsp-tab-controls dsp-styler-shell-header-right dsp-styler-modal-controls">
        <button class="dsp-tab-contribute" data-action="open-about" title="${t("actions.contribute.title")}">${t("actions.contribute.label")} 💙</button>
        <button class="dsp-tab-maximize" data-action="toggle-maximize" title="${t("modal.window.maximize")}"></button>
        <button class="dsp-tab-close" data-action="close-editor" title="${t("actions.close.title")}">\u{2716}\u{FE0F}</button>
    </div>
</div>
<div class="dsp-main dsp-styler-shell-main">
    <div class="dsp-module-slot dsp-module-overlay-slot" data-module-slot="overlay"></div>
</div>
`;
}

function resolveExtensionAssetUrl(assetName) {
    try {
        const moduleUrl = import.meta.url;
        const match = moduleUrl.match(/\/extensions\/([^\/]+)\//);
        if (match) {
            const extensionName = match[1];
            return `/extensions/${extensionName}/assets/${assetName}`;
        }
    } catch {
        // fall through to default extension path
    }
    return `/extensions/${EXTENSION_ASSETS_FALLBACK_DIR}/assets/${assetName}`;
}

function ensureContributeBadgeStylesheet() {
    if (document.getElementById(CONTRIBUTE_BADGE_STYLESHEET_ID)) return;
    const link = document.createElement("link");
    link.id = CONTRIBUTE_BADGE_STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = resolveExtensionAssetUrl("styler_pipeline.css");
    link.addEventListener("error", () => {
        console.warn("[Styler Pipeline] Failed to load stylesheet:", link.href);
    });
    document.head.appendChild(link);
}

function applyShellStyles(container) {
    container.classList.add("dsp-styler-shell-body");
}

function applyTabButtonStyles(tabButtons, activeTab) {
    (tabButtons || []).forEach((button) => {
        if (!button) return;
        const isActive = button.dataset.tab === activeTab;
        button.classList.toggle("is-active", isActive);
    });
}

function styleAllTabs(container) {
    container.querySelectorAll(".dsp-tab").forEach((tab) => {
        tab.classList.add("dsp-styler-tabs-button");
    });
}

function parseNodeJsonObject(rawValue) {
    if (!rawValue) return {};
    if (typeof rawValue === "string") {
        try {
            const parsed = JSON.parse(rawValue || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
            return parsed;
        } catch {
            return {};
        }
    }
    if (typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;
    return {};
}

function parseNodeJsonState(rawValue) {
    const parsed = parseNodeJsonObject(rawValue);
    const rawMeta = parsed[NODE_JSON_META_KEY];
    const meta = (rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta))
        ? { ...rawMeta }
        : {};
    const prompt = typeof meta[NODE_JSON_META_PROMPT_KEY] === "string"
        ? meta[NODE_JSON_META_PROMPT_KEY].trim()
        : "";

    const selections = {};
    Object.entries(parsed).forEach(([key, value]) => {
        if (!key || key === NODE_JSON_META_KEY || key.startsWith("__")) return;
        if (value === undefined) return;
        selections[key] = value;
    });
    return { selections, meta, prompt };
}

function buildNodeJsonState(selections, prompt = "") {
    const payload = {};
    Object.entries(selections || {}).forEach(([key, value]) => {
        if (!key || key === NODE_JSON_META_KEY || key.startsWith("__")) return;
        if (value === undefined) return;
        payload[key] = value;
    });

    const normalizedPrompt = (typeof prompt === "string" ? prompt : "").trim();
    if (normalizedPrompt) {
        payload[NODE_JSON_META_KEY] = {
            [NODE_JSON_META_PROMPT_KEY]: normalizedPrompt,
        };
    }
    return payload;
}

function parseSelectionsValue(rawValue) {
    return parseNodeJsonState(rawValue).selections;
}

function countSelections(rawValue) {
    const obj = parseSelectionsValue(rawValue);
    return Object.keys(obj).filter((k) => !k.startsWith("__") && obj[k] && obj[k] !== "None").length;
}

function makeNodeButtonStyle(btn) {
    btn.classList.add("dsp-styler-node-btn");
}

function persistLastAppliedTab(moduleId) {
    if (moduleId === "browse") {
        setPersistedSetting(LAST_ACTIVE_TAB_KEY, "browser");
        return;
    }
    if (moduleId === "ai-presets") {
        setPersistedSetting(LAST_ACTIVE_TAB_KEY, "ai_styler");
    }
}

function persistLastBrowseCategory(categoryId) {
    const category = String(categoryId || "").trim();
    setPersistedSetting(LAST_BROWSE_CATEGORY_KEY, category || null);
}

function getInitialModalTab() {
    const persisted = getPersistedSetting(LAST_ACTIVE_TAB_KEY, "");
    if (persisted === "browser") return "browse";
    if (persisted === "ai_styler") return "ai-presets";
    return "ai-presets";
}

function getPersistedBrowseCategory() {
    return String(getPersistedSetting(LAST_BROWSE_CATEGORY_KEY, "") || "").trim();
}

app.registerExtension({
    name: "styler-pipeline.dynamic-styler",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE) return;

        await initI18n();
        await fetchStyleIndex();
        ensureContributeBadgeStylesheet();

        const widget = node.widgets?.find((w) => w.name === "selected_styles_json");
        if (!widget) return;
        widget.label = "styles";
        widget.options = {
            ...(widget.options || {}),
            label: "styles",
        };

        // --- Panel state ---
        // Modal sizing constants (matching Styler Pipeline defaults)
        // Panel formula: panelRestoreWidth = 768 + 2*280 + 72 = 1400
        //                   panelRestoreHeight = 512 + 240 = 752
        let isMaximized = getPersistedSetting(PANEL_MAXIMIZED_KEY, "false") === "true";
        const panelMarginX = 60;
        const panelMarginY = 30;
        const panelMaxWidth = 1500;
        const panelRestoreWidth = 1400;
        const panelRestoreHeight = 804;
        const panelMaximizedMargin = 20;

        // --- Create the fixed panel (same pattern as Styler Pipeline) ---
        const panel = document.createElement("div");
        panel.className = "dsp-panel dsp-styler-modal dsp-styler-shell-panel dsp-styler-modal-shell";
        document.body.appendChild(panel);

        const shellContainer = document.createElement("div");
        shellContainer.className = "dsp-shell";
        panel.appendChild(shellContainer);
        const stopThemeWatch = initThemeSupport(shellContainer);

        // --- Backdrop ---
        const backdrop = document.createElement("div");
        backdrop.className = "dsp-styler-modal dsp-styler-shell-backdrop dsp-styler-modal-backdrop";
        document.body.appendChild(backdrop);

        // --- Panel layout (maximize/restore) matching Styler Pipeline ---
        let maximizeButton = null;
        let dragHandle = null;
        let isPanelDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function removePanelDragListeners() {
            document.removeEventListener("mousemove", onPanelDragMouseMove);
            document.removeEventListener("mouseup", onPanelDragMouseUp);
        }

        function stopPanelDrag() {
            isPanelDragging = false;
            removePanelDragListeners();
            dragHandle?.classList.remove("dsp-dragging");
        }

        function updateDragHandleState() {
            if (!dragHandle) return;
            dragHandle.classList.toggle("dsp-drag-enabled", !isMaximized);
            if (isMaximized) {
                dragHandle.classList.remove("dsp-dragging");
            }
        }

        function clampPanelPosition(left, top) {
            const rect = panel.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement?.clientWidth || 0;
            const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
            const minVisibleWidth = Math.min(rect.width, 160);
            const tabsRow = shellContainer.querySelector(".dsp-styler-shell-tabs-row");
            const tabsRowHeight = tabsRow?.getBoundingClientRect().height || 44;
            const minVisibleTop = Math.min(rect.height, Math.max(24, Math.floor(tabsRowHeight)));
            const minLeft = Math.floor(minVisibleWidth - rect.width);
            const maxLeft = Math.floor(vw - minVisibleWidth);
            const minTop = 0;
            const maxTop = Math.floor(vh - minVisibleTop);
            return {
                left: Math.min(maxLeft, Math.max(minLeft, Math.floor(left))),
                top: Math.min(maxTop, Math.max(minTop, Math.floor(top))),
            };
        }

        function onPanelDragMouseMove(event) {
            if (!isPanelDragging || isMaximized) return;
            const unclampedLeft = event.clientX - dragOffsetX;
            const unclampedTop = event.clientY - dragOffsetY;
            const clamped = clampPanelPosition(unclampedLeft, unclampedTop);
            panel.style.setProperty("--dsp-panel-left", `${clamped.left}px`);
            panel.style.setProperty("--dsp-panel-top", `${clamped.top}px`);
        }

        function onPanelDragMouseUp() {
            stopPanelDrag();
        }

        function onPanelDragMouseDown(event) {
            if (isMaximized || !dragHandle) return;
            if (event.button !== 0) return;
            const rect = panel.getBoundingClientRect();
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            isPanelDragging = true;
            dragHandle.classList.add("dsp-dragging");
            document.addEventListener("mousemove", onPanelDragMouseMove);
            document.addEventListener("mouseup", onPanelDragMouseUp);
            event.preventDefault();
        }

        function applyPanelLayout() {
            const wasMaximized = isMaximized;
            const vw = window.innerWidth || document.documentElement?.clientWidth || 0;
            const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
            const autoMaxThreshold = 900;
            if (vw <= autoMaxThreshold && !isMaximized) {
                isMaximized = true;
                if (!wasMaximized) {
                    stopPanelDrag();
                }
                updateMaximizeButton();
            }

            const mx = isMaximized ? panelMaximizedMargin : panelMarginX;
            const my = isMaximized ? panelMaximizedMargin : panelMarginY;
            let w = vw - mx * 2;
            let h = vh - my * 2;
            let left = mx;
            let top = my;

            if (!isMaximized) {
                if (panelRestoreWidth > 0) w = Math.min(w, panelRestoreWidth);
                if (panelRestoreHeight > 0) h = Math.min(h, panelRestoreHeight);
                if (panelMaxWidth > 0) w = Math.min(w, panelMaxWidth);
                left = Math.max(mx, Math.floor((vw - w) / 2));
                top = Math.max(my, Math.floor((vh - h) / 2));
            }
            w = Math.max(0, Math.floor(w));
            h = Math.max(0, Math.floor(h));
            left = Math.max(0, Math.floor(left));
            top = Math.max(0, Math.floor(top));

            panel.style.setProperty("--dsp-panel-width", `${w}px`);
            panel.style.setProperty("--dsp-panel-height", `${h}px`);
            panel.style.setProperty("--dsp-panel-left", `${left}px`);
            panel.style.setProperty("--dsp-panel-top", `${top}px`);
            panel.classList.toggle("dsp-styler-modal-maximized", isMaximized);
            updateDragHandleState();
        }

        function updateMaximizeButton() {
            if (!maximizeButton) return;
            maximizeButton.textContent = isMaximized ? "\u{1F5D7}" : "\u{1F5D6}";
            maximizeButton.title = isMaximized ? t("modal.window.restore") : t("modal.window.maximize");
        }

        function toggleMaximize() {
            if (!isMaximized) {
                stopPanelDrag();
            }
            isMaximized = !isMaximized;
            updateMaximizeButton();
            setPersistedSetting(PANEL_MAXIMIZED_KEY, isMaximized ? "true" : "false");
            applyPanelLayout();
            updateDragHandleState();
        }

        let layoutRaf = null;
        function schedulePanelLayout() {
            if (layoutRaf) return;
            layoutRaf = requestAnimationFrame(() => {
                layoutRaf = null;
                if (panel.classList.contains("dsp-is-open")) applyPanelLayout();
            });
        }
        window.addEventListener("resize", schedulePanelLayout);

        // --- Module manager ---
        let manager = null;
        let activeTab = null;
        let pendingSelections = null;
        let closeModalPromise = null;
        let suppressBackdropCloseUntil = 0;
        const modalAnimationMs = 150;

        function getSelections() {
            return parseSelectionsValue(widget.value);
        }

        function getNodePrompt() {
            return parseNodeJsonState(widget.value).prompt || "";
        }

        function setNodeState(selections, prompt = "") {
            widget.value = JSON.stringify(buildNodeJsonState(selections, prompt));
            updateStatus();
        }

        function setSelections(sel) {
            setNodeState(sel, getNodePrompt());
        }

        function getLastLLMPromptFromNodeState() {
            return getNodePrompt();
        }

        function setLastLLMPromptInNodeState(promptText) {
            const normalizedPrompt = (promptText || "").trim();
            if (!normalizedPrompt) return false;
            const currentPrompt = getNodePrompt();
            if (currentPrompt === normalizedPrompt) return false;
            const parsed = parseNodeJsonState(widget.value);
            setNodeState(parsed.selections, normalizedPrompt);
            return true;
        }

        function cloneSelections(sel) {
            return { ...(sel || {}) };
        }

        function getPendingSelections() {
            return pendingSelections ? cloneSelections(pendingSelections) : getSelections();
        }

        function setPendingSelections(sel) {
            pendingSelections = cloneSelections(sel);
            refreshModules(pendingSelections);
        }

        function handleStyleSelect(category, styleKey) {
            const current = getPendingSelections();
            if (styleKey === null) delete current[category];
            else current[category] = styleKey;
            setPendingSelections(current);
        }

        function handleClearAllPending() {
            setPendingSelections({});
        }

        function applyPendingAndClose() {
            persistLastAppliedTab(activeTab);
            if (activeTab === "browse") {
                const browseMod = manager?.getModule("browse");
                const currentBrowseCategory = browseMod?._getCurrentCategory
                    ? browseMod._getCurrentCategory()
                    : "";
                persistLastBrowseCategory(currentBrowseCategory);
            }
            const committed = getPendingSelections();
            setSelections(committed);
            pendingSelections = null;
            void closeModal(false);
        }


        function refreshModules(selOverride = null) {
            const sel = selOverride ? cloneSelections(selOverride) : getPendingSelections();
            const browseMod = manager?.getModule("browse");
            if (browseMod?._render) browseMod._render(sel);
            const aiPresetsMod = manager?.getModule("ai-presets");
            if (aiPresetsMod?._render) aiPresetsMod._render(sel, { preserveExistingSuggestions: true });
            const searchMod = manager?.getModule("search");
            if (searchMod?._setSelections) searchMod._setSelections(sel);
            if (searchMod?._doSearch) searchMod._doSearch();
        }

        function setActiveTab(tabId) {
            activeTab = tabId;
            manager?.activate(tabId);
            if (tabId === "ai-presets") {
                const aiPresetsMod = manager?.getModule("ai-presets");
                if (aiPresetsMod?._render) {
                    aiPresetsMod._render(getPendingSelections(), { preserveExistingSuggestions: true });
                }
            }
            const tabs = Array.from(shellContainer.querySelectorAll(".dsp-tab"));
            applyTabButtonStyles(tabs, tabId);
        }

        async function openModal() {
            if (panel.classList.contains("dsp-is-open")) {
                return;
            }

            suppressBackdropCloseUntil = performance.now() + 200;

            await initI18n({ forceReload: true });

            shellContainer.innerHTML = buildShellHtml();
            applyThemeTokens(shellContainer);
            applyShellStyles(shellContainer);
            dragHandle = shellContainer.querySelector('[data-role="drag-handle"]');
            if (dragHandle) {
                dragHandle.addEventListener("mousedown", onPanelDragMouseDown);
                updateDragHandleState();
            }

            manager = createModuleManager(shellContainer);
            await manager.init();
            styleAllTabs(shellContainer);

            maximizeButton = shellContainer.querySelector(".dsp-tab-maximize");
            if (maximizeButton) {
                maximizeButton.addEventListener("click", toggleMaximize);
                updateMaximizeButton();
            }

            const closeBtn = shellContainer.querySelector(".dsp-tab-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    void closeModal(true);
                });
            }

            const contributeBtn = shellContainer.querySelector(".dsp-tab-contribute");
            if (contributeBtn) {
                contributeBtn.addEventListener("click", () => {
                    setActiveTab("about");
                    showToast(
                        "info",
                        t("actions.contribute.toast_title"),
                        t("actions.contribute.toast_body")
                    );
                });
            }

            shellContainer.querySelectorAll(".dsp-tab").forEach((btn) => {
                btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
            });

            shellContainer.querySelectorAll('[data-action="overlay-close"]').forEach((btn) => {
                btn.addEventListener("click", () => {
                    void closeModal(true);
                });
            });

            const browseMod = manager.getModule("browse");
            if (browseMod?._setOnSelect) browseMod._setOnSelect(handleStyleSelect);
            if (browseMod?._setOnClearAll) browseMod._setOnClearAll(handleClearAllPending);
            if (browseMod?._setOnApply) browseMod._setOnApply(applyPendingAndClose);
            if (browseMod?._setOnCancel) browseMod._setOnCancel(() => {
                void closeModal(true);
            });
            const searchMod = manager.getModule("search");
            if (searchMod?._setOnSelect) searchMod._setOnSelect(handleStyleSelect);
            const editorMod = manager.getModule("editor");
            if (editorMod?._setOnApply) editorMod._setOnApply(applyPendingAndClose);
            if (editorMod?._setOnCancel) editorMod._setOnCancel(() => {
                void closeModal(true);
            });
            const aiPresetsMod = manager.getModule("ai-presets");
            if (aiPresetsMod?._setOnSelect) aiPresetsMod._setOnSelect(handleStyleSelect);
            if (aiPresetsMod?._setOnApply) aiPresetsMod._setOnApply(applyPendingAndClose);
            if (aiPresetsMod?._setOnCancel) aiPresetsMod._setOnCancel(() => {
                void closeModal(true);
            });
            if (aiPresetsMod?._setNodePromptBindings) {
                aiPresetsMod._setNodePromptBindings({
                    getLastLLMPrompt: getLastLLMPromptFromNodeState,
                    setLastLLMPrompt: setLastLLMPromptInNodeState,
                });
            }
            if (aiPresetsMod?._applyPersistedPrompt) {
                aiPresetsMod._applyPersistedPrompt();
            }

            // Reload style JSON from disk every time the modal opens
            await reloadData();

            // Build a set of valid style keys so stale selections can be pruned
            const validKeys = new Set();
            const validBrowseCategories = new Set();
            for (const item of getStyleIndex()) {
                validKeys.add(`${item.category}:${item.title}`);
                if (item.category) validBrowseCategories.add(item.category);
            }

            const sel = getSelections();
            for (const cat of Object.keys(sel)) {
                if (!validKeys.has(`${cat}:${sel[cat]}`)) delete sel[cat];
            }
            pendingSelections = cloneSelections(sel);

            const browseModRender = manager.getModule("browse");
            if (browseModRender?._render) browseModRender._render(pendingSelections);
            const aiPresetsModRender = manager.getModule("ai-presets");
            if (aiPresetsModRender?._render) aiPresetsModRender._render(pendingSelections);
            const searchModRender = manager.getModule("search");
            if (searchModRender?._setSelections) searchModRender._setSelections(pendingSelections);

            // Re-render editor module with fresh catalog data
            const editorModRender = manager.getModule("editor");
            if (editorModRender?._render) editorModRender._render();

            panel.classList.remove("dsp-is-closing");
            panel.classList.remove("dsp-styler-modal-closing");
            backdrop.classList.remove("dsp-is-closing");
            backdrop.classList.remove("dsp-styler-modal-closing");
            panel.style.transition = "none";
            applyPanelLayout();
            void panel.offsetWidth;
            panel.style.transition = "";
            panel.classList.add("dsp-is-open");
            panel.classList.add("dsp-styler-modal-open");
            backdrop.classList.add("dsp-is-open");
            backdrop.classList.add("dsp-styler-modal-open");

            const initialTab = getInitialModalTab();
            setActiveTab(initialTab);
            if (initialTab === "browse") {
                const lastBrowseCategory = getPersistedBrowseCategory();
                if (lastBrowseCategory && validBrowseCategories.has(lastBrowseCategory)) {
                    const browseModFocus = manager.getModule("browse");
                    if (browseModFocus?._focusCategory) {
                        browseModFocus._focusCategory(lastBrowseCategory);
                    }
                }
            }
        }

        async function closeModal(discardPending = true) {
            if (!panel.classList.contains("dsp-is-open")) {
                return false;
            }
            if (closeModalPromise) {
                return closeModalPromise;
            }

            closeModalPromise = (async () => {
                const aiPresetsMod = manager?.getModule("ai-presets");
                const hasActiveAiWork = !!(aiPresetsMod?._hasActiveWork && aiPresetsMod._hasActiveWork());
                if (hasActiveAiWork) {
                    const confirmed = await showConfirm(
                        t("modal.close_confirm.title"),
                        t("modal.close_confirm.body"),
                        { type: "default", confirmText: t("modal.close_confirm.confirm_text"), cancelText: t("actions.cancel.label") }
                    );
                    if (!confirmed) {
                        return false;
                    }
                    if (aiPresetsMod?._cancelActiveWorkForClose) {
                        await aiPresetsMod._cancelActiveWorkForClose();
                    }
                }

                if (discardPending) {
                    pendingSelections = null;
                }
                stopPanelDrag();
                panel.classList.add("dsp-is-closing");
                panel.classList.add("dsp-styler-modal-closing");
                backdrop.classList.add("dsp-is-closing");
                backdrop.classList.add("dsp-styler-modal-closing");
                panel.classList.remove("dsp-is-open");
                panel.classList.remove("dsp-styler-modal-open");
                backdrop.classList.remove("dsp-is-open");
                backdrop.classList.remove("dsp-styler-modal-open");
                await new Promise((resolve) => {
                    const onEnd = (e) => {
                        if (e.target === panel && e.propertyName === "opacity") {
                            panel.removeEventListener("transitionend", onEnd);
                            resolve();
                        }
                    };
                    panel.addEventListener("transitionend", onEnd);
                });
                panel.classList.remove("dsp-is-closing");
                panel.classList.remove("dsp-styler-modal-closing");
                backdrop.classList.remove("dsp-is-closing");
                backdrop.classList.remove("dsp-styler-modal-closing");
                manager?.deactivateActive();
                return true;
            })();

            try {
                return await closeModalPromise;
            } finally {
                closeModalPromise = null;
            }
        }

        backdrop.addEventListener("click", (event) => {
            if (event.target !== backdrop) {
                return;
            }
            const now = performance.now();
            if (now < suppressBackdropCloseUntil) {
                return;
            }
            void closeModal(true);
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && panel.classList.contains("dsp-is-open")) {
                void closeModal(true);
            }
        });

        const originalOnRemoved = node.onRemoved;
        node.onRemoved = function (...args) {
            try {
                stopPanelDrag();
                stopThemeWatch?.();
            } catch {
                // no-op
            }
            if (typeof originalOnRemoved === "function") {
                return originalOnRemoved.apply(this, args);
            }
            return undefined;
        };

        // Display-only counter widget (native ComfyUI widget, kept in sync from JSON value)
        let syncingActiveStylesWidget = false;
        node.activeStylesWidget = node.addWidget(
            "text",
            t("node.active_styles.label"),
            "0",
            () => {
                if (syncingActiveStylesWidget) return;
                updateStatus();
            },
            { multiline: false, readOnly: true }
        );
        node.activeStylesWidget.readOnly = true;
        node.activeStylesWidget.options = {
            ...(node.activeStylesWidget.options || {}),
            readOnly: true,
            multiline: false,
        };

        function updateActiveStylesWidget(count) {
            const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
            const text = String(safeCount);
            if (node.activeStylesWidget) {
                syncingActiveStylesWidget = true;
                node.activeStylesWidget.value = text;
                syncingActiveStylesWidget = false;
            }
            if (typeof node.setDirtyCanvas === "function") {
                node.setDirtyCanvas(true, true);
            } else if (typeof app?.graph?.setDirtyCanvas === "function") {
                app.graph.setDirtyCanvas(true, true);
            }
        }

        // --- Node button row (compact, fixed height) ---
        const rowEl = document.createElement("div");
        rowEl.classList.add("dsp-styler-node-row");
        applyThemeTokens(rowEl);

        const openBtn = document.createElement("button");
        openBtn.textContent = t("node.actions.open_styler");
        makeNodeButtonStyle(openBtn);
        openBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void openModal();
        });
        rowEl.appendChild(openBtn);

        const clearBtn = document.createElement("button");
        clearBtn.textContent = t("node.actions.clear");
        makeNodeButtonStyle(clearBtn);
        clearBtn.addEventListener("click", () => {
            pendingSelections = null;
            setSelections({});
            refreshModules({});
        });
        rowEl.appendChild(clearBtn);

        function updateStatus() {
            const n = countSelections(widget.value);
            updateActiveStylesWidget(n);
        }

        node.addDOMWidget("dsp_buttons", "custom", rowEl, {
            getValue() { return ""; },
            setValue() {},
        });

        updateStatus();

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (config) {
            if (origOnConfigure) origOnConfigure.call(this, config);
            updateStatus();
        };
    },
});

