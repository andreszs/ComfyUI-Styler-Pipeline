import { registerModule } from "./index.js";
import { getStyleIndex } from "../style-data.js";
import { showConfirm } from "../utils.js";
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

function formatStylesActiveChipText(count) {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
    return t("gallery.badge.styles_active", { count: safeCount });
}

function formatCategoryHeaderLabel(categoryName) {
    const normalized = String(categoryName || "").trim().replace(/_/g, " ");
    if (!normalized) return "";
    return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildBrowseHtml() {
    return `
    <div class="dsp-overlay dsp-browse-overlay" data-overlay="browse">
        <div class="dsp-overlay-card">
            <div class="dsp-overlay-content">
                <div class="dsp-browse-layout">
                    <div class="dsp-browse-categories">
                        <div class="dsp-browse-category-list"></div>
                    </div>
                    <div class="dsp-browse-styles">
                        <div class="dsp-browse-search-bar">
                            <div class="dsp-input-with-x">
                                <input class="dsp-browse-search-input" type="text" placeholder="${t("gallery.search.placeholder")}" />
                                <button class="dsp-browse-search-clear dsp-input-clear-x is-hidden" title="${t("gallery.search.clear.title")}">&#x2715;</button>
                            </div>
                            <label class="dsp-browse-search-whole-toggle" title="${t("gallery.search.whole_words.title")}">
                                <input class="dsp-browse-search-whole-toggle-input" type="checkbox" />
                                <span>${t("gallery.search.whole_words.label")}</span>
                            </label>
                        </div>
                        <div class="dsp-browse-subcategory-filter">
                            <label class="dsp-browse-subcategory-label" for="dsp-browse-subcategory-select">${t("gallery.subcategory.label")}</label>
                            <select class="dsp-browse-subcategory-select" id="dsp-browse-subcategory-select" aria-label="${t("gallery.subcategory.label")}"></select>
                        </div>
                        <div class="dsp-browse-styles-header">
                            <div class="dsp-browse-section-title">${t("gallery.styles.title")}</div>
                            <div class="dsp-browse-style-count dsp-ai-presets-provider-badge"></div>
                        </div>
                        <div class="dsp-browse-styles-separator"></div>
                        <div class="dsp-browse-style-list"></div>
                        <div class="dsp-module-footer-separator dsp-browse-footer-separator"></div>
                        <div class="dsp-module-footer dsp-browse-footer">
                            <div class="dsp-module-footer-actions dsp-browse-footer-actions">
                                <button class="dsp-btn dsp-apply-btn dsp-module-footer-apply dsp-browse-apply" title="${t("actions.apply.title")}">${t("actions.apply.label")}</button>
                                <button class="dsp-btn dsp-cancel-btn dsp-module-footer-cancel dsp-browse-cancel" title="${t("actions.cancel.title")}">${t("actions.cancel.label")}</button>
                            </div>
                            <div class="dsp-module-footer-right dsp-browse-footer-right">
                                <span class="dsp-browse-selected-count">${t("gallery.badge.no_styles_active")} <button class="dsp-browse-selected-clear is-inactive" type="button" aria-hidden="true" tabindex="-1" disabled>✕</button></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function applyBrowseStyles(container) {
    container.classList.add("dsp-browse-ui");

    container.querySelectorAll(".dsp-browse-category-list").forEach((list) => {
        applyCategoryListStyles(list);
    });

    container.querySelectorAll(".dsp-browse-styles").forEach((s) => {
        applyModuleRightPanelStyles(s);
        s.classList.add("dsp-browse-styles-ui");
    });

    // Inject WebKit scrollbar hiding CSS (pseudo-elements can't be set inline)
    ensureCategoryListScrollbarHiddenStyles();
    if (!document.getElementById("dsp-browse-style-list-scrollbar-style")) {
        const style = document.createElement("style");
        style.id = "dsp-browse-style-list-scrollbar-style";
        style.textContent = `
            .dsp-browse-style-list::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    container.querySelectorAll(".dsp-browse-footer-separator").forEach((separator) => {
        applyModuleFooterSeparatorStyles(separator);
        separator.classList.add("dsp-browse-footer-separator-ui");
    });

    container.querySelectorAll(".dsp-browse-footer").forEach((footer) => {
        applyModuleFooterStyles(footer);
        footer.classList.add("dsp-browse-footer-ui");
    });

    container.querySelectorAll(".dsp-browse-footer-right").forEach((right) => {
        applyModuleFooterRightStyles(right);
    });

    container.querySelectorAll(".dsp-browse-footer-actions").forEach((actions) => {
        applyModuleFooterActionsStyles(actions);
    });

    container.querySelectorAll(".dsp-browse-cancel, .dsp-browse-apply").forEach((btn) => {
        applyModuleFooterButtonBaseStyles(btn);
        btn.classList.add("dsp-browse-footer-btn");
    });

    container.querySelectorAll(".dsp-browse-cancel").forEach((btn) => {
        applyModuleFooterCancelButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "cancel");
    });

    container.querySelectorAll(".dsp-browse-apply").forEach((btn) => {
        applyModuleFooterApplyButtonStyles(btn);
        wireModuleFooterButtonHover(btn, "apply");
    });

}

function makeStyleRow(item, isSelected) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.classList.add("dsp-ai-presets-candidate-pill", "dsp-browse-style-chip", "dsp-browse-style-chip--catalog");
    chip.classList.toggle("is-selected", !!isSelected);
    const promptText = typeof item?.positive_prompt === "string"
        ? item.positive_prompt
        : (typeof item?.prompt === "string" ? item.prompt : "");
    if (promptText) {
        chip.title = promptText;
    }
    chip.setAttribute("aria-pressed", isSelected ? "true" : "false");

    // Title with ellipsis and tooltip
    const title = document.createElement("span");
    const displayTitle = formatStyleLabelForDisplay(item.title);
    title.textContent = displayTitle;
    title.classList.add("dsp-browse-style-chip-title");
    chip.appendChild(title);

    return chip;
}

function initBrowse(container, manager) {
    applyBrowseStyles(container);

    const searchInput = container.querySelector(".dsp-browse-search-input");
    const wholeWordToggleInput = container.querySelector(".dsp-browse-search-whole-toggle-input");
    const searchClearBtn = container.querySelector(".dsp-browse-search-clear");
    const subcategorySelect = container.querySelector(".dsp-browse-subcategory-select");
    const clearAllBtn = container.querySelector(".dsp-browse-selected-clear");
    const cancelBtn = container.querySelector(".dsp-browse-cancel");
    const applyBtn = container.querySelector(".dsp-browse-apply");
    const selectedCountBadge = container.querySelector(".dsp-browse-selected-count");
    const categoryList = container.querySelector(".dsp-browse-category-list");
    const styleList = container.querySelector(".dsp-browse-style-list");
    if (!categoryList || !styleList || !searchInput || !wholeWordToggleInput || !searchClearBtn || !subcategorySelect || !clearAllBtn || !cancelBtn || !applyBtn || !selectedCountBadge) return;

    let currentCategory = null;
    let onSelectCallback = null;
    let onApplyCallback = null;
    let onCancelCallback = null;
    let onClearAllCallback = null;
    let currentQuery = "";
    let wholeWordsOnly = false;
    let wholeWordQueryRegex = null;
    const ALL_SUBCATEGORY_VALUE = "__all__";
    let currentSubcategory = ALL_SUBCATEGORY_VALUE;
    let subcategoryCategory = null;
    let suppressAutoCategorySelection = false;
    let resizeRaf = null;
    wholeWordsOnly = !!wholeWordToggleInput.checked;

    function setOnSelect(cb) { onSelectCallback = cb; }
    function setOnApply(cb) { onApplyCallback = cb; }
    function setOnCancel(cb) { onCancelCallback = cb; }
    function setOnClearAll(cb) { onClearAllCallback = cb; }
    function getCurrentCategory() { return currentCategory; }

    function updateSelectedCountBadge(selections) {
        const selectedCount = Object.keys(selections || {}).filter((key) => selections[key]).length;
        const hasActiveStyles = selectedCount > 0;
        selectedCountBadge.firstChild.textContent = `${hasActiveStyles ? formatStylesActiveChipText(selectedCount) : t("gallery.badge.no_styles_active")} `;
        selectedCountBadge.classList.toggle("is-active", hasActiveStyles);
        clearAllBtn.classList.toggle("is-inactive", !hasActiveStyles);
        clearAllBtn.disabled = !hasActiveStyles;
        if (hasActiveStyles) {
            clearAllBtn.title = t("gallery.btn.remove_all.title");
            clearAllBtn.setAttribute("aria-label", t("gallery.btn.remove_all.title"));
            clearAllBtn.removeAttribute("aria-hidden");
            clearAllBtn.removeAttribute("tabindex");
        } else {
            clearAllBtn.removeAttribute("title");
            clearAllBtn.removeAttribute("aria-label");
            clearAllBtn.setAttribute("aria-hidden", "true");
            clearAllBtn.setAttribute("tabindex", "-1");
        }
    }

    function getSafeSelectorValue(value) {
        const raw = String(value || "");
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
            return CSS.escape(raw);
        }
        return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function escapeRegex(text) {
        return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function refreshQueryMatcher() {
        wholeWordQueryRegex = null;
        if (!wholeWordsOnly || !currentQuery) return;

        try {
            wholeWordQueryRegex = new RegExp(`\\b${escapeRegex(currentQuery)}\\b`, "i");
        } catch {
            wholeWordQueryRegex = null;
        }
    }

    function textMatchesQuery(text, query) {
        if (!query) return true;

        const haystack = String(text || "").toLowerCase();
        if (!wholeWordsOnly) return haystack.includes(query);

        if (wholeWordQueryRegex) return wholeWordQueryRegex.test(haystack);
        return haystack.includes(query);
    }

    function focusCategory(categoryName) {
        const category = String(categoryName || "").trim();
        if (!category) return false;

        suppressAutoCategorySelection = false;
        currentQuery = "";
        searchInput.value = "";
        refreshQueryMatcher();
        updateClearButton();

        const browseModule = manager.getModule("browse");
        const selections = browseModule && browseModule._currentSelections
            ? browseModule._currentSelections
            : {};

        currentCategory = category;
        render(selections);

        const safeCategory = getSafeSelectorValue(category);
        const categoryBtn = categoryList.querySelector(`.dsp-category-btn[data-category="${safeCategory}"]`);
        if (!categoryBtn) return false;

        try {
            categoryBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch {
            categoryBtn.scrollIntoView();
        }

        categoryBtn.classList.add("is-flash-focus");

        setTimeout(() => {
            categoryBtn.classList.remove("is-flash-focus");
        }, 950);

        return true;
    }

    // Helper: check if a style matches the query
    function styleMatchesQuery(style, query) {
        if (!query) return true;
        const haystack = `${style.title} ${style.text}`;
        return textMatchesQuery(haystack, query);
    }

    function getStyleSubcategoryKey(styleTitle) {
        if (typeof styleTitle !== "string") return null;
        const slashIndex = styleTitle.indexOf("/");
        if (slashIndex < 0) return null;
        const subcategoryKey = styleTitle.slice(0, slashIndex).trim();
        return subcategoryKey || null;
    }

    function getSortedSubcategoryKeys(styles) {
        const keys = new Set();
        (styles || []).forEach((style) => {
            const key = getStyleSubcategoryKey(style?.title);
            if (key) keys.add(key);
        });
        return Array.from(keys).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    function updateSubcategoryOptions(styles, categoryName) {
        const categoryKey = categoryName || null;
        if (subcategoryCategory !== categoryKey) {
            subcategoryCategory = categoryKey;
            currentSubcategory = ALL_SUBCATEGORY_VALUE;
        }

        const subcategoryKeys = getSortedSubcategoryKeys(styles);
        if (currentSubcategory !== ALL_SUBCATEGORY_VALUE && !subcategoryKeys.includes(currentSubcategory)) {
            currentSubcategory = ALL_SUBCATEGORY_VALUE;
        }

        subcategorySelect.innerHTML = "";

        const allOption = document.createElement("option");
        allOption.value = ALL_SUBCATEGORY_VALUE;
        allOption.textContent = t("gallery.subcategory.all");
        subcategorySelect.appendChild(allOption);

        subcategoryKeys.forEach((subcategoryKey) => {
            const option = document.createElement("option");
            option.value = subcategoryKey;
            option.textContent = subcategoryKey;
            subcategorySelect.appendChild(option);
        });

        subcategorySelect.value = currentSubcategory;
        subcategorySelect.disabled = subcategoryKeys.length === 0;
    }

    function getCategoryMatchCount(categoryName, categoryStyles, query) {
        if (!query) return categoryStyles.length;

        if (textMatchesQuery(categoryName, query)) {
            return categoryStyles.length;
        }

        return categoryStyles.reduce((count, style) => {
            return count + (styleMatchesQuery(style, query) ? 1 : 0);
        }, 0);
    }

    // Helper: update clear button visibility
    function updateClearButton() {
        searchClearBtn.classList.toggle("is-hidden", !currentQuery);
    }

    // Helper: clear search
    function clearSearch() {
        searchInput.value = "";
        currentQuery = "";
        refreshQueryMatcher();
        updateClearButton();
        const browseModule = manager.getModule("browse");
        if (browseModule && browseModule._currentSelections) {
            render(browseModule._currentSelections);
        }
    }

    updateSelectedCountBadge({});

    function scheduleResizeRender() {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            const browseModule = manager.getModule("browse");
            if (browseModule && browseModule._currentSelections) {
                render(browseModule._currentSelections);
            }
        });
    }

    const resizeObserver = new ResizeObserver(() => {
        scheduleResizeRender();
    });
    resizeObserver.observe(categoryList);

    function render(selections) {
        const index = getStyleIndex();
        const categories = {};
        for (const item of index) {
            if (!categories[item.category]) categories[item.category] = [];
            categories[item.category].push(item);
        }
        const categoryOrder = Object.keys(categories);
        
        // Update selected count badge
        const selectedCount = Object.keys(selections).filter(key => selections[key]).length;
        updateSelectedCountBadge(selections);
        if (selectedCount > 0) {
            suppressAutoCategorySelection = false;
        }

        const onClearCategorySelection = (categoryName) => {
            if (onSelectCallback) {
                onSelectCallback(categoryName, null);
            }
        };

        const categoryMatchCounts = {};
        // Filter categories based on search query
        const visibleCats = categoryOrder.filter((cat) => {
            const matchCount = getCategoryMatchCount(cat, categories[cat], currentQuery);
            categoryMatchCounts[cat] = matchCount;
            if (!currentQuery) return true;
            return matchCount > 0;
        });

        // If current category is not visible, auto-select first visible one
        if (currentQuery && currentCategory && !visibleCats.includes(currentCategory)) {
            currentCategory = visibleCats.length > 0 ? visibleCats[0] : null;
        }

        // If no category selected and we have visible ones, select the first
        if (!currentCategory && visibleCats.length > 0 && !suppressAutoCategorySelection) {
            currentCategory = visibleCats[0];
        }

        categoryList.innerHTML = "";

        const listHeight = categoryList.clientHeight;
        const allRows = visibleCats.length;
        const density = computeCategoryDensity(listHeight, Math.max(1, allRows));

        visibleCats.forEach((cat) => {
            const selectedKey = selections[cat];
            const categoryDisplayLabel = currentQuery
                ? `${cat} (${categoryMatchCounts[cat] || 0})`
                : cat;
            const btn = makeCategoryBtn(
                cat,
                selectedKey,
                cat === currentCategory,
                density,
                onClearCategorySelection,
                { categoryDisplayLabel }
            );
            btn.addEventListener("click", () => {
                suppressAutoCategorySelection = false;
                currentCategory = cat;
                render(selections);
            });
            categoryList.appendChild(btn);
        });

        const countLabel = container.querySelector(".dsp-browse-style-count");
        const sectionTitle = container.querySelector(".dsp-browse-section-title");
        if (sectionTitle) {
            sectionTitle.textContent = currentCategory
                ? formatCategoryHeaderLabel(currentCategory)
                : t("gallery.styles.title");
        }
        
        if (currentCategory && categories[currentCategory]) {
            renderStyles(categories[currentCategory], selections);
        } else if (visibleCats.length === 0 && currentQuery) {
            updateSubcategoryOptions([], null);
            styleList.innerHTML = `<div class="dsp-browse-empty-note">${t("gallery.empty.no_matches")}</div>`;
            if (countLabel) {
                countLabel.textContent = "";
                countLabel.classList.remove("is-visible");
            }
        } else {
            updateSubcategoryOptions([], null);
            styleList.innerHTML = `<div class="dsp-browse-empty-note">${t("gallery.empty.select_category")}</div>`;
            if (countLabel) {
                countLabel.textContent = "";
                countLabel.classList.remove("is-visible");
            }
        }
    }

    function renderStyles(styles, selections) {
        styleList.innerHTML = "";
        const category = styles[0]?.category;
        const selectedKey = selections[category];
        updateSubcategoryOptions(styles, category);

        // Update style count in header
        const countLabel = container.querySelector(".dsp-browse-style-count");

        // Filter styles based on query
        let visibleStyles = styles;
        if (currentQuery) {
            // Check if category name matches
            const categoryNameMatches = textMatchesQuery(category, currentQuery);
            
            if (categoryNameMatches) {
                // Category name matches: show all styles
                visibleStyles = styles;
            } else {
                // Category name doesn't match: show only matching styles
                visibleStyles = styles.filter(style => styleMatchesQuery(style, currentQuery));
            }
        }

        if (currentSubcategory !== ALL_SUBCATEGORY_VALUE) {
            visibleStyles = visibleStyles.filter((style) => getStyleSubcategoryKey(style.title) === currentSubcategory);
        }

        if (visibleStyles.length === 0 && currentQuery) {
            styleList.innerHTML = `<div class="dsp-browse-empty-note">${t("gallery.empty.no_matches_category")}</div>`;
            if (countLabel) {
                countLabel.textContent = "";
                countLabel.classList.remove("is-visible");
            }
            return;
        }

        // Update count label
        if (countLabel) {
            const count = visibleStyles.length;
            countLabel.textContent = t("gallery.style_count.label", { count });
            countLabel.classList.add("is-visible");
        }

        visibleStyles.forEach((item) => {
            const isSelected = item.title === selectedKey;
            const tile = makeStyleRow(item, isSelected);

            // Click handler: toggle selection
            tile.addEventListener("click", () => {
                if (isSelected) {
                    if (onSelectCallback) onSelectCallback(item.category, null);
                } else {
                    if (onSelectCallback) onSelectCallback(item.category, item.title);
                }
            });

            styleList.appendChild(tile);
        });
    }

    // Search input handler
    searchInput.addEventListener("input", () => {
        currentQuery = searchInput.value.trim().toLowerCase();
        refreshQueryMatcher();
        updateClearButton();
        const browseModule = manager.getModule("browse");
        if (browseModule && browseModule._currentSelections) {
            render(browseModule._currentSelections);
        }
    });

    wholeWordToggleInput.addEventListener("change", () => {
        wholeWordsOnly = !!wholeWordToggleInput.checked;
        refreshQueryMatcher();
        const browseModule = manager.getModule("browse");
        if (browseModule && browseModule._currentSelections) {
            render(browseModule._currentSelections);
        }
    });

    subcategorySelect.addEventListener("change", () => {
        currentSubcategory = subcategorySelect.value || ALL_SUBCATEGORY_VALUE;
        const browseModule = manager.getModule("browse");
        if (browseModule && browseModule._currentSelections) {
            render(browseModule._currentSelections);
        }
    });

    // Clear button handler
    searchClearBtn.addEventListener("click", () => {
        clearSearch();
        searchInput.focus();
    });

    // Escape key handler
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            clearSearch();
        }
    });

    // Clear All button handler
    clearAllBtn.addEventListener("click", async () => {
        const confirmed = await showConfirm(
            t("gallery.confirm.clear_all.title"),
            t("gallery.confirm.clear_all.body")
        );
        if (confirmed) {
            currentCategory = null;
            suppressAutoCategorySelection = true;
            render({});
            if (onClearAllCallback) onClearAllCallback();
        }
    });

    cancelBtn.addEventListener("click", () => {
        if (onCancelCallback) onCancelCallback();
    });

    applyBtn.addEventListener("click", () => {
        if (onApplyCallback) onApplyCallback();
    });

    const browseModule = manager.getModule("browse");
    if (browseModule) {
        browseModule._setOnSelect = setOnSelect;
        browseModule._setOnApply = setOnApply;
        browseModule._setOnCancel = setOnCancel;
        browseModule._setOnClearAll = setOnClearAll;
        browseModule._getCurrentCategory = getCurrentCategory;
        browseModule._focusCategory = focusCategory;
        browseModule._currentSelections = {};
        
        // Wrap render to store current selections
        const originalRender = render;
        browseModule._render = function(selections) {
            browseModule._currentSelections = selections || {};
            originalRender(selections);
        };
    }
}

registerModule({
    id: "browse",
    labelKey: "tabs.browse",
    order: 15,
    slot: "overlay",
    buildUI: buildBrowseHtml,
    initUI: initBrowse,
});
