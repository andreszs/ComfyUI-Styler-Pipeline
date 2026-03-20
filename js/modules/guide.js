import { registerModule } from "./index.js";
import { t } from "./i18n.js";

const GUIDE_TIP_EMOJI = {
    avoidConflicts: "🎨",
    avoidOverstack: "⚖️",
    allInOne: "⭐",
    iterate: "🔄",
};

export function buildGuideOverlayHtml() {
  return `
    <div class="dsp-overlay dsp-guide-overlay" data-overlay="guide">
        <div class="dsp-overlay-card">
            <div class="dsp-overlay-content">
                <div class="dsp-guide-intro">${t("guide.intro")}</div>
                <div class="dsp-guide-list">
                    <div class="dsp-guide-row">
                        <div class="dsp-guide-title">${GUIDE_TIP_EMOJI.avoidConflicts} ${t("guide.tips.avoid_conflicts.title")}</div>
                        <p>${t("guide.tips.avoid_conflicts.body1")}</p>
                        <p>${t("guide.tips.avoid_conflicts.body2")}</p>
                    </div>
                    <div class="dsp-guide-row">
                        <div class="dsp-guide-title">${GUIDE_TIP_EMOJI.avoidOverstack} ${t("guide.tips.avoid_overstack.title")}</div>
                        <p>${t("guide.tips.avoid_overstack.body1")}</p>
                        <p>${t("guide.tips.avoid_overstack.body2")}</p>
                    </div>
                    <div class="dsp-guide-row">
                        <div class="dsp-guide-title">${GUIDE_TIP_EMOJI.allInOne} ${t("guide.tips.all_in_one.title")}</div>
                        <p>${t("guide.tips.all_in_one.body1")}</p>
                        <p>${t("guide.tips.all_in_one.body2")}</p>
                    </div>
                    <div class="dsp-guide-row">
                        <div class="dsp-guide-title">${GUIDE_TIP_EMOJI.iterate} ${t("guide.tips.iterate.title")}</div>
                        <p>${t("guide.tips.iterate.body1")}</p>
                        <p>${t("guide.tips.iterate.body2")}</p>
                    </div>
                </div>
                <div class="dsp-alert dsp-alert-info">
                    <div class="dsp-alert-icon">ℹ️</div>
                    <div class="dsp-alert-body">${t("guide.note")}</div>
                </div>
            </div>
        </div>
    </div>
`;
}

export function setupGuideOverlayStyles(container) {
    container.classList.add("dsp-guide-ui");
}

export const guideOverlay = {
    id: "guide",
    buildUI: buildGuideOverlayHtml,
    applyStyles: setupGuideOverlayStyles,
    initUI: setupGuideOverlayStyles
};

registerModule({
    id: "guide",
    labelKey: "tabs.guide",
    order: 30,
    slot: "overlay",
    buildUI: buildGuideOverlayHtml,
    initUI: (container) => guideOverlay.initUI(container)
});
