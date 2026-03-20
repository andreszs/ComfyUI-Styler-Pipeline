import { registerModule } from "./index.js";
import { copyToClipboard, showToast, showConfirm, safeFetch, parseVersion, compareVersions, extractVersionFromToml } from "../utils.js";
import { initI18n, t } from "./i18n.js";

const ABOUT_INFO = {
    name: "ComfyUI-Styler-Pipeline",
    author: "andreszs",
    repoUrl: "https://github.com/andreszs/comfyui-styler-pipeline",
    githubProfileUrl: "https://github.com/andreszs",
    kofiUrl: "https://ko-fi.com/D1D716OLPM",
    paypalUrl: "https://www.paypal.com/ncp/payment/GEEM324PDD9NC",
    paypalQrUrl: "/pipeline_control/assets/qr-paypal.svg",
    usdcQrUrl: "/pipeline_control/assets/qr-usdc.svg",
    usdcAddress: "0xe36a336fC6cc9Daae657b4A380dA492AB9601e73",
};

// Configuration: Update TOML URL
const UPDATE_TOML_URL = "https://raw.githubusercontent.com/andreszs/comfyui-styler-pipeline/main/pyproject.toml";
const README_GITHUB_URL = "https://github.com/andreszs/ComfyUI-Styler-Pipeline/blob/main/docs/README.md";
const TOAST_API_MIN_VERSION = "1.2.27";

// Check for updates by fetching remote pyproject.toml
// Returns: { success: boolean, hasUpdate?: boolean, remoteVersion?: string }
async function checkForUpdates(localVersion) {
    try {
        const result = await safeFetch(UPDATE_TOML_URL, { cache: "no-store" });

        if (!result.ok) {
            throw new Error(`HTTP error: ${result.status || "unknown"}`);
        }

        const tomlContent = result.data;
        const remoteVersionStr = extractVersionFromToml(tomlContent);

        if (!remoteVersionStr) {
            throw new Error(t("about.update.failed.extract"));
        }

        const comparison = compareVersions(remoteVersionStr, localVersion);

        if (comparison > 0) {
            // Remote version is newer
            return { success: true, hasUpdate: true, remoteVersion: remoteVersionStr };
        } else {
            // Local version is up to date or newer
            return { success: true, hasUpdate: false };
        }
    } catch (err) {
        console.error(t("about.update.failed.console_prefix"), err);
        const errorMsg = err.message || t("about.update.failed.unknown_error");
        const statusMatch = errorMsg.match(/HTTP error: (\d+)/);
        const statusCode = statusMatch ? statusMatch[1] : "unknown";
        showToast(
            "warn",
            t("about.update.failed.toast_title"),
            t("about.update.failed.toast_body", { statusCode })
        );
        return { success: false };
    }
}

function buildAboutOverlayHtml() {
    return `
    <div class="dsp-overlay dsp-about-overlay" data-overlay="about">
        <div class="dsp-overlay-card">
            <div class="dsp-overlay-content">
                <div class="dsp-about-list">
                    <div class="dsp-about-row dsp-about-header-row">
                        <div class="dsp-about-header">
                            <div class="dsp-about-left">
                                <div class="dsp-about-title">${ABOUT_INFO.name}</div>
                                <span class="dsp-about-emoji">✨</span>
                                <span class="dsp-about-version" title="${t("about.version.loading")}"></span>
                                <a class="dsp-about-author" href="${ABOUT_INFO.githubProfileUrl}" target="_blank" rel="noopener noreferrer" title="${t("about.author.title")}">${t("about.author.by", { author: ABOUT_INFO.author })}</a>
                            </div>
                            <div class="dsp-about-right">
                                <button class="dsp-btn csp-small-btn dsp-check-updates-btn" title="${t("about.btn.check_updates.title")}">${t("about.btn.check_updates.label")}</button>
                                <a class="dsp-btn csp-small-btn dsp-readme-btn" href="${README_GITHUB_URL}" target="_blank" rel="noopener noreferrer" title="${t("about.btn.readme.title")}">README</a>
                            </div>
                        </div>
                    </div>
                    <div class="dsp-about-row dsp-issues-section dsp-about-card">
                        <div class="dsp-about-row-title">${t("about.issues.title")}</div>
                        <p>${t("about.issues.body")}</p>
                        <a class="dsp-btn csp-small-btn dsp-support-btn dsp-issues-btn" href="${ABOUT_INFO.repoUrl}/issues" target="_blank" rel="noopener noreferrer">${t("about.issues.btn.label")}</a>
                    </div>
                    <div class="dsp-about-row dsp-support-section dsp-about-card">
                        <div class="dsp-about-row-title dsp-support-titlebar">
                            <span>${t("about.support.title")}</span>
                            <div class="dsp-support-badges">
                                <a class="dsp-support-badge-link dsp-support-badge" href="${ABOUT_INFO.kofiUrl}" target="_blank" rel="noopener noreferrer" title="${t("donate.tooltip.kofi")}">
                                    <img class="dsp-support-badge-img" src="/pipeline_control/assets/badge_kofi.svg" alt="${t("donate.tooltip.kofi")}" title="${t("donate.tooltip.kofi")}" />
                                </a>
                                <a class="dsp-support-badge-link dsp-support-badge" href="${ABOUT_INFO.paypalUrl}" target="_blank" rel="noopener noreferrer" title="${t("donate.tooltip.paypal")}">
                                    <img class="dsp-support-badge-img" src="/pipeline_control/assets/badge_paypal.svg" alt="${t("donate.tooltip.paypal")}" title="${t("donate.tooltip.paypal")}" />
                                </a>
                                <a class="dsp-support-badge-link dsp-support-badge" href="#dsp-usdc" title="${t("donate.tooltip.usdc")}">
                                    <img class="dsp-support-badge-img" src="/pipeline_control/assets/badge_usdc.svg" alt="${t("donate.tooltip.usdc")}" title="${t("donate.tooltip.usdc")}" />
                                </a>
                            </div>
                        </div>
                        <div class="dsp-support-actions">
                            <div class="dsp-support-qr">
                                <a class="dsp-support-qr-link" href="${ABOUT_INFO.paypalUrl}" target="_blank" rel="noopener noreferrer">
                                    <img src="${ABOUT_INFO.paypalQrUrl}" alt="${t("about.support.paypal.alt")}" title="${t("about.support.paypal.title")}" />
                                </a>
                            </div>
                            <div class="dsp-support-middle">
                                <div class="dsp-support-copy">
                                    <div class="dsp-support-bullet">
                                        <span class="dsp-support-bullet-icon">\u{1F6E0}\u{FE0F}</span>
                                        <p>${t("about.support.bullet1")}</p>
                                    </div>
                                    <div class="dsp-support-bullet">
                                        <span class="dsp-support-bullet-icon">\u{2139}\u{FE0F}</span>
                                        <p>${t("about.support.bullet2")}</p>
                                    </div>
                                    <div class="dsp-support-bullet">
                                        <span class="dsp-support-bullet-icon">\u{1F680}</span>
                                        <p>${t("about.support.bullet3")}</p>
                                    </div>
                                </div>
                            </div>
                            <div id="dsp-usdc" class="dsp-support-qr dsp-support-qr-usdc">
                                <img src="${ABOUT_INFO.usdcQrUrl}" alt="${t("about.support.usdc.alt")}" title="${t("about.support.usdc.title")}" />
                            </div>
                        </div>
                    </div>
                    <div class="dsp-about-row dsp-pipeline-section dsp-about-card">
                        <div class="dsp-about-row-title">${t("about.other_repos.title")}</div>
                        <p>${t("about.other_repos.body")}</p>
                        <a class="dsp-btn csp-small-btn dsp-support-btn dsp-other-repos-btn" href="${ABOUT_INFO.githubProfileUrl}" target="_blank" rel="noopener noreferrer" title="${t("about.other_repos.btn.title")}">${t("about.other_repos.btn.label")}</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
`;
}

function setupAboutOverlayStyles(container) {
    container.classList.add("dsp-about-ui");
}

function initAboutOverlay(container) {
    setupAboutOverlayStyles(container);
    initI18n().catch(() => {});

    const titleEl = container.querySelector(".dsp-about-title");
    const versionEl = container.querySelector(".dsp-about-version");
    const checkUpdatesBtn = container.querySelector(".dsp-check-updates-btn");

    if (titleEl) titleEl.textContent = ABOUT_INFO.name;
    if (versionEl) {
        versionEl.textContent = "v\u2026";
        versionEl.title = t("about.version.loading");
    }

    (async () => {
        const result = await safeFetch("/pipeline_control/version", { cache: "no-store" });
        const version = (result.ok && result.data) 
            ? ((typeof result.data === "object" ? result.data.version : result.data) || "unknown")
            : "unknown";
        
        if (versionEl) {
            if (version !== "unknown") {
                versionEl.textContent = `v${version}`;
                versionEl.title = t("about.version.loaded");
            } else {
                versionEl.textContent = "v?";
                versionEl.title = t("about.version.unavailable");
            }
        }

        // Setup check for updates button click handler
        if (checkUpdatesBtn && version !== "unknown") {
            let isDownloadMode = false;

            checkUpdatesBtn.addEventListener("click", () => {
                if (isDownloadMode) {
                    // In download mode: open README.md for update instructions
                    window.open(README_GITHUB_URL, "_blank");
                    return;
                }

                // Check for updates mode
                checkUpdatesBtn.disabled = true;
                checkUpdatesBtn.classList.add("is-busy");
                checkUpdatesBtn.textContent = t("about.update.checking");
                
                checkForUpdates(version).then((result) => {
                    if (result.success && result.hasUpdate) {
                        // New version available: switch to download mode
                        isDownloadMode = true;
                        checkUpdatesBtn.textContent = t("about.btn.how_to_update.label");
                        checkUpdatesBtn.title = t("about.update.available.btn_title", {
                            current: version,
                            latest: result.remoteVersion,
                        });
                        showToast(
                            "info",
                            t("about.update.available.toast_title"),
                            t("about.update.available.toast_body", {
                                latest: result.remoteVersion,
                                current: version,
                            })
                        );
                    } else if (result.success) {
                        // Up to date
                        checkUpdatesBtn.textContent = t("about.btn.check_updates.label");
                        showToast("success", t("about.update.uptodate.toast_title"), t("about.update.uptodate.toast_body"));
                    } else {
                        // Failed
                        checkUpdatesBtn.textContent = t("about.btn.retry.label");
                        checkUpdatesBtn.title = t("about.btn.retry.title");
                    }
                    checkUpdatesBtn.disabled = false;
                    checkUpdatesBtn.classList.remove("is-busy");
                });
            });
        }
    })();

    const toastApi = window?.app?.extensionManager?.toast;
    const hasToastApi =
        (toastApi && typeof toastApi.add === "function") ||
        (window?.app?.ui && typeof window.app.ui.showToast === "function");

    if (!hasToastApi && container && !container.querySelector(".dsp-about-warning")) {
        const warning = document.createElement("div");
        warning.className = "dsp-about-warning-card alert alert-warning dsp-about-warning";
        warning.innerHTML = `
            <div class="dsp-warning-title">${t("about.warning.outdated.title")}</div>
            <div class="dsp-warning-text">
                ${t("about.warning.outdated.body", { minVersion: TOAST_API_MIN_VERSION })}
            </div>
        `;
        const aboutHeader = container.querySelector(".dsp-about-header");
        if (aboutHeader && aboutHeader.parentNode) {
            aboutHeader.insertAdjacentElement("afterend", warning);
        }
    }

    const usdcQrImg = container.querySelector(".dsp-support-qr-usdc img");
    const usdcBadgeLink = container.querySelector('.dsp-support-badge-link[href="#dsp-usdc"]');

    if (usdcBadgeLink && usdcQrImg && !usdcBadgeLink.dataset.clickReady) {
        usdcBadgeLink.dataset.clickReady = "1";
        usdcBadgeLink.addEventListener("click", (event) => {
            event.preventDefault();
            usdcQrImg.click();
        });
    }

    if (usdcQrImg) {
        usdcQrImg.addEventListener("click", async () => {
            const confirmed = await showConfirm(
                t("about.usdc.confirm.title"),
                t("about.usdc.confirm.message")
            );
            if (!confirmed) {
                return;
            }
            const address = ABOUT_INFO.usdcAddress;
            if (!address) return;
            const ok = await copyToClipboard(address);
            if (ok) {
                showToast("info", t("about.usdc.copied.title"), t("about.usdc.copied.body"));
            } else {
                showToast("error", t("about.usdc.toast_title"), t("about.usdc.copy_failed"));
            }
        });
    }
}

registerModule({
    id: "about",
    labelKey: "tabs.about",
    order: 40,
    slot: "overlay",
    buildUI: buildAboutOverlayHtml,
    initUI: (container) => initAboutOverlay(container),
});


