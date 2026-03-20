let cachedIndex = null;
let fetchPromise = null;
let cachedCatalog = null;
let fetchCatalogPromise = null;

export async function fetchStyleIndex() {
    if (cachedIndex) return cachedIndex;
    if (fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
        try {
            const resp = await fetch("/pipeline_control/styles", {
                method: "GET",
                cache: "no-store",
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            cachedIndex = await resp.json();
            return cachedIndex;
        } catch (err) {
            console.error("[Styler Pipeline] Failed to fetch style index:", err);
            cachedIndex = [];
            return cachedIndex;
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

export function getStyleIndex() {
    return cachedIndex || [];
}

export function clearStyleCache() {
    cachedIndex = null;
    cachedCatalog = null;
}

export async function fetchStyleCatalog() {
    if (cachedCatalog) return cachedCatalog;
    if (fetchCatalogPromise) return fetchCatalogPromise;

    fetchCatalogPromise = (async () => {
        try {
            const resp = await fetch("/pipeline_control/styles/catalog", {
                method: "GET",
                cache: "no-store",
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            cachedCatalog = await resp.json();
            return cachedCatalog;
        } catch (err) {
            console.error("[Styler Pipeline] Failed to fetch style catalog:", err);
            cachedCatalog = {};
            return cachedCatalog;
        } finally {
            fetchCatalogPromise = null;
        }
    })();

    return fetchCatalogPromise;
}

export function getStyleCatalog() {
    return cachedCatalog || {};
}

/**
 * Reload style data from disk via the server refresh endpoint.
 * Updates both cachedIndex and cachedCatalog in one round-trip.
 * On failure, keeps the last in-memory data and logs a warning.
 */
export async function reloadData() {
    try {
        const resp = await fetch(
            `/pipeline_control/styles/refresh?t=${Date.now()}`,
            { method: "GET", cache: "no-store" }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        cachedIndex = data.index ?? cachedIndex;
        cachedCatalog = data.catalog ?? cachedCatalog;
    } catch (err) {
        console.warn(
            "[Styler Pipeline] Style reload failed, keeping previous data:",
            err
        );
    }
}

