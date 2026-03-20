import { t } from "./i18n.js";

const registry = [];

function setupOverlays(container) {
    const overlays = Array.from(
        container.querySelectorAll(".dsp-overlay")
    );
    const overlayMap = new Map(
        overlays.map((el) => [el.dataset.overlay || "", el])
    );
    let active = null;

    const mainLayout = container.querySelector(".dsp-main");
    if (mainLayout) {
        mainLayout.classList.add("dsp-styler-main-layout");
    }

    overlays.forEach((overlay) => {
        overlay.classList.add("dsp-overlay-base");
    });

    container.querySelectorAll(".dsp-overlay-card").forEach((card) => {
        card.classList.add("dsp-overlay-card-base");
    });

    container.querySelectorAll(".dsp-overlay-content").forEach((content) => {
        content.classList.add("dsp-overlay-content-base");
    });

    const hideAll = () => {
        overlays.forEach((overlay) => {
            overlay.classList.remove("is-open");
        });
        active = null;
    };

    const setVisible = (name, visible = true) => {
        const overlay = overlayMap.get(name);
        if (!overlay) return;
        if (!visible) {
            if (active === name) hideAll();
            return;
        }
        overlays.forEach((el) => {
            el.classList.toggle("is-open", el === overlay);
        });
        active = name;
    };

    const toggle = (name) => {
        if (active === name) hideAll();
        else setVisible(name, true);
    };

    container.querySelectorAll('[data-action="overlay-close"]').forEach((btn) => {
        btn.addEventListener("click", () => hideAll());
    });

    return { setVisible, toggle, hideAll, isActive: (name) => active === name };
}

export function registerModule(moduleDef) {
    if (!moduleDef || typeof moduleDef.id !== "string") return;
    const existing = registry.find((mod) => mod.id === moduleDef.id);
    if (existing) {
        Object.assign(existing, moduleDef);
        return;
    }
    registry.push(moduleDef);
}

export function getModules() {
    return registry.slice();
}

export function createModuleManager(container) {
    const state = {
        modules: [],
        moduleMap: new Map(),
        activeId: null,
        overlayController: null,
        mountedSlots: new Set(),
    };

    const context = { container, manager: null };

    const manager = {
        init,
        activate,
        deactivateActive,
        getModule: (id) => state.moduleMap.get(id),
        isActive: (id) => state.activeId === id,
        setOverlayVisible,
    };

    context.manager = manager;

    async function init() {
        await Promise.allSettled([
            import("./browse.js"),
            import("./ai-styler.js"),
            import("./editor.js"),
            // import("./search.js"),  // Removed: Search merged into Browse
            import("./guide.js"),
            import("./about.js"),
        ]);

        state.modules = getModules()
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        state.moduleMap = new Map(
            state.modules.map((mod) => [mod.id, mod])
        );

        mountModules();
        renderTabs();

        state.overlayController = setupOverlays(container);

        state.modules.forEach((mod) => {
            if (typeof mod.initUI === "function") {
                mod.initUI(container, manager);
            }
        });

        state.activeId = null;
        state.overlayController?.hideAll();

        return state.modules;
    }

    function mountModules() {
        state.modules.forEach((mod) => {
            if (!mod.slot || typeof mod.buildUI !== "function") return;
            const slot = container.querySelector(
                `[data-module-slot="${mod.slot}"]`
            );
            if (!slot) return;
            const slotKey = `${mod.slot}:${mod.id}`;
            if (state.mountedSlots.has(slotKey)) return;
            slot.insertAdjacentHTML("beforeend", mod.buildUI());
            state.mountedSlots.add(slotKey);
        });
    }

    function renderTabs() {
        const tabHost = container.querySelector(".dsp-tab-modules");
        if (!tabHost) return;
        tabHost.innerHTML = "";
        state.modules.forEach((mod) => {
            const label = mod.labelKey ? t(mod.labelKey) : mod.label;
            if (!label) return;
            const button = document.createElement("button");
            button.className = "dsp-tab";
            button.dataset.tab = mod.id;
            button.textContent = label;
            tabHost.appendChild(button);
        });
    }

    function activate(id) {
        if (!id) return false;
        if (state.activeId === id) return true;
        const next = state.moduleMap.get(id);
        if (!next) {
            state.overlayController?.hideAll();
            return false;
        }
        const prev = state.moduleMap.get(state.activeId);
        if (prev && typeof prev.onDeactivate === "function") {
            prev.onDeactivate(context);
        }
        state.activeId = id;
        if (next.slot === "overlay") {
            setOverlayVisible(id, true);
        } else {
            state.overlayController?.hideAll();
        }
        if (typeof next.onActivate === "function") {
            next.onActivate(context);
        }
        return true;
    }

    function deactivateActive() {
        const prev = state.moduleMap.get(state.activeId);
        if (prev && typeof prev.onDeactivate === "function") {
            prev.onDeactivate(context);
        }
        state.activeId = null;
        state.overlayController?.hideAll();
    }

    function setOverlayVisible(id, visible = true) {
        if (!state.overlayController) return;
        state.overlayController.setVisible(id, visible);
    }

    return manager;
}
