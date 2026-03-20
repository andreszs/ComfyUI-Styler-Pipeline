export const MODULE_RIGHT_PANEL_GAP = "8px";
export const MODULE_RIGHT_PANEL_PADDING = "12px";
export const MODULE_FOOTER_SEPARATOR_MARGIN_TOP = "4px";
export const MODULE_FOOTER_PADDING_TOP = "8px";
export const MODULE_FOOTER_GAP = "8px";
export const MODULE_FOOTER_ACTIONS_GAP = "6px";
export const MODULE_FOOTER_BUTTON_PADDING = "6px 12px";
export const MODULE_FOOTER_BUTTON_MIN_HEIGHT = "30px";
export const MODULE_FOOTER_BUTTON_MIN_WIDTH = "96px";

export function applyModuleRightPanelStyles(panel) {
    if (!panel) return;
    panel.classList.add("dsp-module-right-panel");
}

export function applyModuleFooterSeparatorStyles(separator) {
    if (!separator) return;
    separator.classList.add("dsp-module-footer-separator-ui");
}

export function applyModuleFooterStyles(footer) {
    if (!footer) return;
    footer.classList.add("dsp-module-footer-ui");
}

export function applyModuleFooterRightStyles(right) {
    if (!right) return;
    right.classList.add("dsp-module-footer-right-ui");
}

export function applyModuleFooterActionsStyles(actions) {
    if (!actions) return;
    actions.classList.add("dsp-module-footer-actions-ui");
}

export function applyModuleFooterButtonBaseStyles(btn) {
    if (!btn) return;
    btn.classList.add("dsp-module-footer-btn-ui");
}

export function applyModuleFooterCancelButtonStyles(btn) {
    if (!btn) return;
    btn.classList.add("dsp-module-footer-btn-cancel-ui");
    btn.classList.remove("dsp-module-footer-btn-apply-ui");
}

export function applyModuleFooterApplyButtonStyles(btn) {
    if (!btn) return;
    btn.classList.add("dsp-module-footer-btn-apply-ui");
    btn.classList.remove("dsp-module-footer-btn-cancel-ui");
}

export function wireModuleFooterButtonHover(btn, type) {
    if (!btn || !type) return;
    if (type === "apply") {
        btn.classList.add("dsp-module-footer-btn-hover-apply");
        btn.classList.remove("dsp-module-footer-btn-hover-cancel");
        return;
    }
    btn.classList.add("dsp-module-footer-btn-hover-cancel");
    btn.classList.remove("dsp-module-footer-btn-hover-apply");
}
