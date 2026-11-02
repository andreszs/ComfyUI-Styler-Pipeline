# Changelog

## 1.1.0

- Added **ChatGPT Plan** as the recommended AI Styler provider, with browser-based sign-in and no API key to copy or configure.
- Added secure account connection management, automatic token refresh, model discovery, and Responses API requests for ChatGPT Plan users.
- Added connected-account status, plan-usage access, model caching, and localized sign-in guidance in the AI Styler interface.
- Improved request-timeout handling, raised the default timeout to 30 seconds, and added a 90-second recommendation for local Ollama model startup.
- Added an any-language prompt indicator and updated the documentation with a ChatGPT Plan setup guide and screenshot.

## 1.0.9

- Refreshed the animated Comfy Registry banner with the standardized Styler Pipeline node screenshot.
- Versioned the banner filename as `banner_109.gif` to prevent stale CDN and browser caches from serving an older preview.

## 1.0.5

- Fixed a 1.0.4 regression where AI presets/local style index initialization could fail with `byCategory[category] is undefined` when styles introduced categories outside the built-in category list.
