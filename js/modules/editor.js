import { registerModule } from "./index.js";
import { fetchStyleCatalog, getStyleCatalog } from "../style-data.js";
import { t } from "./i18n.js";
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
import {
    applyCategoryListStyles,
    ensureCategoryListScrollbarHiddenStyles,
    computeCategoryDensity,
    makeCategoryBtn,
} from "./category-sidebar-shared.js";

function formatStyleLabelForDisplay(label) {
    return typeof label === "string" ? label.replace(/\s*[>/]\s*/g, " / ").trim() : label;
}

function buildEditorHtml() {
    return `
    <div class="dsp-overlay dsp-editor-overlay" data-overlay="editor">
        <div class="dsp-overlay-card">
            <div class="dsp-overlay-content">
                <div class="dsp-editor-layout">
                    <div class="dsp-editor-categories">
                        <div class="dsp-editor-category-list"></div>
                    </div>
                    <div class="dsp-editor-styles">
                        <div class="dsp-editor-fields-grid">
                            <div class="dsp-editor-field dsp-editor-style-picker-row">
                                <label class="dsp-editor-label" for="dsp-editor-style-select">${t("editor.fields.style")}</label>
                                <div class="dsp-editor-style-nav-row">
                                    <select id="dsp-editor-style-select" class="dsp-editor-style-select"></select>
                                    <div class="dsp-editor-style-nav-controls dsp-preset-iconrow">
                                        <button class="dsp-editor-style-nav-btn dsp-btn dsp-btn-icon dsp-preset-iconbtn csp-small-btn csp-small-btn--icon" type="button" data-action="style-prev" title="${t("editor.actions.prev_style")}">▲</button>
                                        <button class="dsp-editor-style-nav-btn dsp-btn dsp-btn-icon dsp-preset-iconbtn csp-small-btn csp-small-btn--icon" type="button" data-action="style-next" title="${t("editor.actions.next_style")}">▼</button>
                                    </div>
                                </div>
                            </div>
                            <div class="dsp-editor-field">
                                <label class="dsp-editor-label" for="dsp-editor-name">${t("editor.fields.name")}</label>
                                <input id="dsp-editor-name" class="dsp-editor-input" type="text" disabled />
                            </div>
                            <div class="dsp-editor-field">
                                <label class="dsp-editor-label" for="dsp-editor-prompt">${t("editor.fields.prompt")}</label>
                                <textarea id="dsp-editor-prompt" class="dsp-editor-textarea" rows="5" disabled></textarea>
                            </div>
                            <div class="dsp-editor-field">
                                <label class="dsp-editor-label" for="dsp-editor-negative">${t("editor.fields.negative_prompt")}</label>
                                <textarea id="dsp-editor-negative" class="dsp-editor-textarea" rows="5" disabled></textarea>
                            </div>
                        </div>
                        <div class="dsp-editor-actions">
                            <button class="dsp-editor-btn" type="button" disabled>${t("editor.actions.save_json")}</button>
                            <button class="dsp-editor-btn" type="button" disabled>${t("editor.actions.add_style")}</button>
                        </div>
                        <div class="dsp-alert dsp-alert-warning dsp-editor-warning">
                            <div class="dsp-alert-icon">⚠️</div>
                            <div class="dsp-alert-body">
                                <p>${t("feature.not_available_yet")}</p>
                            </div>
                        </div>
                        <div class="dsp-module-footer-separator dsp-editor-footer-separator"></div>
                        <div class="dsp-module-footer dsp-editor-footer">
                            <div class="dsp-module-footer-actions dsp-editor-footer-actions">
                                <button class="dsp-btn dsp-apply-btn dsp-module-footer-apply dsp-editor-apply" type="button" title="${t("actions.apply.title")}">${t("actions.apply.label")}</button>
                                <button class="dsp-btn dsp-cancel-btn dsp-module-footer-cancel dsp-editor-cancel" type="button" title="${t("actions.cancel.title")}">${t("actions.cancel.label")}</button>
                            </div>
                            <div class="dsp-module-footer-right dsp-editor-footer-right"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function setupAlertStyles(container) {
    container.classList.add("dsp-editor-alert-ui");
}

function applyEditorStyles(container) {
    container.classList.add("dsp-editor-ui");

    container.querySelectorAll(".dsp-editor-styles").forEach((panel) => {
        applyModuleRightPanelStyles(panel);
    });

    container.querySelectorAll(".dsp-editor-category-list").forEach((list) => {
        applyCategoryListStyles(list);
    });
    ensureCategoryListScrollbarHiddenStyles();

    container.querySelectorAll(".dsp-editor-style-nav-btn").forEach((btn) => {
        btn.style.setProperty("--csp-small-btn-icon-size", "26px");
        btn.style.setProperty("--csp-small-btn-icon-padding", "0 6px");
        btn.classList.add("dsp-editor-style-nav-btn-ui");
    });

    container.querySelectorAll(".dsp-editor-footer-separator").forEach((separator) => {
        applyModuleFooterSeparatorStyles(separator);
    });

    container.querySelectorAll(".dsp-editor-footer").forEach((footer) => {
        applyModuleFooterStyles(footer);
    });

    container.querySelectorAll(".dsp-editor-footer-right").forEach((right) => {
        applyModuleFooterRightStyles(right);
    });

    container.querySelectorAll(".dsp-editor-footer-actions").forEach((actions) => {
        applyModuleFooterActionsStyles(actions);
    });

    container.querySelectorAll(".dsp-editor-cancel, .dsp-editor-apply").forEach((btn) => {
        applyModuleFooterButtonBaseStyles(btn);
        btn.classList.add("dsp-editor-footer-btn");
    });

    container.querySelectorAll(".dsp-editor-cancel").forEach((btn) => {
        applyModuleFooterCancelButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "cancel");
    });

    container.querySelectorAll(".dsp-editor-apply").forEach((btn) => {
        applyModuleFooterApplyButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "apply");
    });

    setupAlertStyles(container);
}

function initEditor(container, manager) {
    applyEditorStyles(container);

    const categoryList = container.querySelector(".dsp-editor-category-list");
    const styleSelect = container.querySelector(".dsp-editor-style-select");
    const stylePrevBtn = container.querySelector('[data-action="style-prev"]');
    const styleNextBtn = container.querySelector('[data-action="style-next"]');
    const cancelBtn = container.querySelector(".dsp-editor-cancel");
    const applyBtn = container.querySelector(".dsp-editor-apply");
    const nameInput = container.querySelector("#dsp-editor-name");
    const promptInput = container.querySelector("#dsp-editor-prompt");
    const negativeInput = container.querySelector("#dsp-editor-negative");

    if (!categoryList || !styleSelect || !stylePrevBtn || !styleNextBtn || !cancelBtn || !applyBtn || !nameInput || !promptInput || !negativeInput) return;

    let catalog = {};
    let currentCategory = "";
    let onApplyCallback = null;
    let onCancelCallback = null;
    let resizeRaf = null;

    function setOnApply(cb) { onApplyCallback = cb; }
    function setOnCancel(cb) { onCancelCallback = cb; }

    function scheduleCategoryRender() {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            if (!catalog || !Object.keys(catalog).length) return;
            renderCategories();
        });
    }

    const resizeObserver = new ResizeObserver(() => {
        scheduleCategoryRender();
    });
    resizeObserver.observe(categoryList);

    function updateFields(styleObj) {
        nameInput.value = formatStyleLabelForDisplay(styleObj?.name || "");
        promptInput.value = styleObj?.prompt || "";
        negativeInput.value = styleObj?.negative_prompt || "";
    }

    function getCurrentStyles() {
        if (!currentCategory || !catalog[currentCategory]) return [];
        return catalog[currentCategory];
    }

    function setButtonEnabled(button, enabled) {
        button.disabled = !enabled;
        button.classList.toggle("is-disabled", !enabled);
    }

    function updateStyleNavState(styles) {
        const hasStyles = Array.isArray(styles) && styles.length > 0;
        setButtonEnabled(stylePrevBtn, hasStyles);
        setButtonEnabled(styleNextBtn, hasStyles);
    }

    function renderStyles() {
        const styles = getCurrentStyles();
        styleSelect.innerHTML = "";

        if (!styles.length) {
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = t("editor.empty.no_styles");
            styleSelect.appendChild(empty);
            updateFields(null);
            updateStyleNavState(styles);
            return;
        }

        styles.forEach((style, index) => {
            const opt = document.createElement("option");
            opt.value = String(index);
            opt.textContent = formatStyleLabelForDisplay(style.name || t("editor.style.fallback", { index: index + 1 }));
            styleSelect.appendChild(opt);
        });

        styleSelect.selectedIndex = 0;
        updateFields(styles[0]);
        updateStyleNavState(styles);
    }

    function renderCategories() {
        const categories = Object.keys(catalog).sort();
        categoryList.innerHTML = "";

        if (!categories.length) {
            const empty = document.createElement("div");
            empty.style.color = "var(--styler-text-muted)";
            empty.style.fontSize = "12px";
            empty.style.padding = "8px";
            empty.textContent = t("editor.empty.no_categories");
            categoryList.appendChild(empty);
            currentCategory = "";
            renderStyles();
            return;
        }

        if (!currentCategory || !categories.includes(currentCategory)) {
            currentCategory = categories[0];
        }

        const listHeight = categoryList.clientHeight;
        const density = computeCategoryDensity(listHeight, Math.max(1, categories.length));

        categories.forEach((category) => {
            const btn = makeCategoryBtn(category, null, category === currentCategory, density, null, {
                showSelectedStyleLabel: false,
                showClearButton: false,
            });
            btn.addEventListener("click", () => {
                if (currentCategory === category) return;
                currentCategory = category;
                renderCategories();
                renderStyles();
            });
            categoryList.appendChild(btn);
        });

        renderStyles();
    }

    styleSelect.addEventListener("change", () => {
        const styles = getCurrentStyles();
        const idx = Number(styleSelect.value);
        const selected = Number.isInteger(idx) && idx >= 0 ? styles[idx] : null;
        updateFields(selected || null);
    });

    const selectStyleRelative = (delta) => {
        const styles = getCurrentStyles();
        if (!styles.length) return;
        const total = styles.length;
        const currentIndex = Math.max(0, styleSelect.selectedIndex);
        const nextIndex = (currentIndex + delta + total) % total;
        styleSelect.selectedIndex = nextIndex;
        styleSelect.dispatchEvent(new Event("change"));
    };

    stylePrevBtn.addEventListener("click", () => selectStyleRelative(-1));
    styleNextBtn.addEventListener("click", () => selectStyleRelative(1));
    setButtonEnabled(applyBtn, false);
    cancelBtn.addEventListener("click", () => {
        if (onCancelCallback) onCancelCallback();
    });
    applyBtn.addEventListener("click", () => {
        if (applyBtn.disabled) return;
        if (onApplyCallback) onApplyCallback();
    });

    const moduleRef = manager?.getModule?.("editor");
    if (moduleRef) {
        moduleRef._setOnApply = setOnApply;
        moduleRef._setOnCancel = setOnCancel;
        moduleRef._render = () => {
            catalog = getStyleCatalog() || {};
            renderCategories();
        };
    }

    fetchStyleCatalog().then((result) => {
        catalog = result || {};
        renderCategories();
    });
}

registerModule({
    id: "editor",
    labelKey: "tabs.editor",
    order: 20,
    slot: "overlay",
    buildUI: buildEditorHtml,
    initUI: initEditor,
});
