// Shared category sidebar row renderer used by Browse and Editor modules.
import { t } from "./i18n.js";

const CATEGORY_LIST_SCROLLBAR_STYLE_ID = "dsp-category-list-scrollbar-style";

// Compute sprite URL for ComfyUI extension serving structure.
const SPRITE_URL = (() => {
    try {
        const moduleUrl = import.meta.url;
        const match = moduleUrl.match(/\/extensions\/([^\/]+)\//);
        if (match) {
            const extensionName = match[1];
            return `/extensions/${extensionName}/assets/category_icons.svg`;
        }
    } catch (e) {
        console.warn("Could not resolve sprite URL from import.meta.url:", e);
    }
    return "/extensions/comfyui-styler-pipeline/assets/category_icons.svg";
})();

// Category icon mapping (SVG sprite symbol IDs).
const CATEGORY_ICON_MAP = {
    face: "icon-face",
    depth: "icon-depth",
    fantasy: "icon-fantasy",
    sci_fi: "icon-generic",
    filter: "icon-filter",
    gothic: "icon-gothic",
    hair: "icon-hair",
    halloween: "icon-halloween",
    lighting: "icon-lighting",
    mood: "icon-mood",
    punk: "icon-punk",
    rendering: "icon-rendering",
    timeofday: "icon-timeofday",
    camera_angles: "icon-camera_angles",
    environment: "icon-environment",
    line_art: "icon-line_art",
    clothing: "icon-clothing",
    clothing_state: "icon-clothing_state",
    clothing_style: "icon-clothing_style",
    atmosphere: "icon-atmosphere",
    all_in_one: "icon-all_in_one",
    lingerie: "icon-breast_state",
    aesthetic: "icon-aesthetic",
    anime: "icon-anime",
};

function formatStyleLabelForDisplay(label) {
    return typeof label === "string" ? label.replace(/\s*[>/]\s*/g, " / ").trim() : label;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeCategoryDensity(listHeight, rowCount) {
    const safeHeight = Math.max(0, listHeight || 0);
    const availableForRows = Math.max(0, safeHeight);
    const rawRowHeight = rowCount > 0 ? Math.floor(availableForRows / rowCount) : 24;
    const rowHeight = clamp(rawRowHeight, 10, 26);
    const compactFactor = clamp((26 - rowHeight) / 16, 0, 1);

    return {
        rowHeight,
        padX: Math.round(10 - compactFactor * 5),
        gap: Math.round(7 - compactFactor * 5),
        iconSize: Math.round(16 - compactFactor * 5),
        nameFontSize: Math.round(12 - compactFactor * 3),
        selectionFontSize: Math.round(11 - compactFactor * 3),
    };
}

export function applyCategoryListStyles(list) {
    if (!list) return;
    list.classList.add("dsp-category-list-ui");
}

export function ensureCategoryListScrollbarHiddenStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(CATEGORY_LIST_SCROLLBAR_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = CATEGORY_LIST_SCROLLBAR_STYLE_ID;
    style.textContent = `
        .dsp-browse-category-list::-webkit-scrollbar,
        .dsp-editor-category-list::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none;
        }
    `;
    document.head.appendChild(style);
}

export function makeCategoryBtn(categoryName, selectedStyleName, isActive, density, onClearCallback = null, options = {}) {
    const showSelectedStyleLabel = options.showSelectedStyleLabel !== false;
    const showClearButton = options.showClearButton !== false;
    const categoryDisplayLabel = typeof options.categoryDisplayLabel === "string" && options.categoryDisplayLabel
        ? options.categoryDisplayLabel
        : categoryName;
    const hasSelectedStyle = !!selectedStyleName;

    const btn = document.createElement("button");
    btn.classList.add("dsp-category-btn");
    btn.setAttribute("data-category", categoryName);
    if (isActive) btn.classList.add("active");
    if (hasSelectedStyle) btn.classList.add("has-selection");
    btn.classList.add("dsp-category-btn-ui");
    btn.style.setProperty("--dsp-cat-gap", `${density.gap}px`);
    btn.style.setProperty("--dsp-cat-row-height", `${density.rowHeight}px`);
    btn.style.setProperty("--dsp-cat-pad-x", `${density.padX}px`);
    btn.style.setProperty("--dsp-cat-icon-size", `${density.iconSize}px`);
    btn.style.setProperty("--dsp-cat-name-size", `${density.nameFontSize}px`);
    btn.style.setProperty("--dsp-cat-selection-size", `${density.selectionFontSize}px`);
    btn.style.setProperty("--dsp-cat-clear-size", `${Math.max(14, density.rowHeight - 6)}px`);
    btn.style.setProperty("--dsp-cat-clear-font-size", `${Math.max(10, density.nameFontSize)}px`);

    const iconAndName = document.createElement("div");
    iconAndName.classList.add("dsp-category-icon-name");

    try {
        const iconId = CATEGORY_ICON_MAP[categoryName] || "icon-generic";
        const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        iconSvg.classList.add("pc-cat-icon");
        iconSvg.setAttribute("viewBox", "0 0 24 24");

        const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
        iconUse.setAttribute("href", `${SPRITE_URL}#${iconId}`);
        iconUse.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `${SPRITE_URL}#${iconId}`);

        iconSvg.appendChild(iconUse);
        iconAndName.appendChild(iconSvg);
    } catch (e) {
        console.warn(`Failed to create icon for category "${categoryName}":`, e);
    }

    const nameSpan = document.createElement("div");
    nameSpan.textContent = categoryDisplayLabel;
    nameSpan.classList.add("dsp-category-name");
    nameSpan.title = categoryDisplayLabel;
    iconAndName.appendChild(nameSpan);

    if (hasSelectedStyle && showSelectedStyleLabel) {
        const displayedSelection = formatStyleLabelForDisplay(selectedStyleName);
        const selectionSpan = document.createElement("div");
        selectionSpan.className = "dsp-category-selection-label";
        selectionSpan.classList.toggle("is-active", isActive);
        selectionSpan.textContent = displayedSelection;
        selectionSpan.title = displayedSelection;
        iconAndName.appendChild(selectionSpan);
    }

    btn.appendChild(iconAndName);

    if (hasSelectedStyle && showClearButton && onClearCallback) {
        const clearBtn = document.createElement("button");
        clearBtn.classList.add("dsp-category-clear-btn");
        clearBtn.textContent = "\u2715";
        clearBtn.title = t("gallery.selection.clear_item.title");
        clearBtn.type = "button";

        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (onClearCallback) {
                onClearCallback(categoryName);
            }
        });

        btn.appendChild(clearBtn);
    }

    return btn;
}

