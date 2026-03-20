import { app } from "../../scripts/app.js";

const NODE_TYPE = "DynamicStylerPipelinePicker";
const CATALOG_ENDPOINT = "/pipeline_control/styles/catalog";

let catalogCache = null;

async function fetchCatalog() {
    if (catalogCache) return catalogCache;
    try {
        const resp = await fetch(CATALOG_ENDPOINT);
        if (resp.ok) {
            catalogCache = await resp.json();
        }
    } catch {
        // ignore fetch errors
    }
    return catalogCache || {};
}

function getStylesForCategory(catalog, category) {
    const styles = catalog[category];
    if (!Array.isArray(styles)) return [];
    return styles.map((s) => s.name);
}

app.registerExtension({
    name: "styler-pipeline.dynamic-styler-picker",

    async nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE) return;

        const categoryWidget = node.widgets?.find((w) => w.name === "category");
        const styleWidget = node.widgets?.find((w) => w.name === "style");
        if (!categoryWidget || !styleWidget) return;

        const catalog = await fetchCatalog();

        function updateStyleOptions(category) {
            const styles = getStylesForCategory(catalog, category);
            if (!styles.length) return;
            styleWidget.options.values = styles;
            if (!styles.includes(styleWidget.value)) {
                styleWidget.value = styles[0];
            }
        }

        // Sync on initial load
        updateStyleOptions(categoryWidget.value);

        // Sync when category changes
        const originalCallback = categoryWidget.callback;
        categoryWidget.callback = function (value) {
            updateStyleOptions(value);
            if (typeof originalCallback === "function") {
                originalCallback.call(this, value);
            }
        };
    },
});
