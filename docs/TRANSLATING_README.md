# README Translation Guidelines (Universal)

This document defines a repo-agnostic process for translating `README.md` files across multiple languages while keeping structure, links, and navigation working correctly.

Supported languages (default set): `en, es, ja, ko, zh, zh-TW, ru, de, fr, pt`.

---

## Core rules

1. English is the source of truth
   `README.md` (English) defines the canonical structure, section order, and feature coverage. Translations must mirror it.

2. Keep formatting stable
   Do not “rewrite” structure. Preserve:

* Heading hierarchy (`#`, `##`, `###`)
* Lists, code blocks, tables, images
* Callouts/admonitions (if used)
* File paths and commands

3. Do not translate code and identifiers
   Never translate:

* CLI commands, flags, code blocks
* JSON keys, filenames, paths
* Node names / class names (unless the project explicitly localizes display names)
* URLs and query parameters

4. Minimal changes, no stylistic refactor
   Only translate text. Avoid editing unrelated wording, whitespace, or reformatting.

---

## Where translated READMEs live

Common patterns:

* `locales/<lang>/README.md`
* `docs/<lang>/README.md`

Use the repo’s existing convention. Do not invent new layouts unless asked.

---

## Table of Contents (TOC) must work perfectly

This is the most important part.

### Rule A: TOC links must match actual heading anchors

Markdown platforms generate anchors from heading text (with rules that vary slightly). To avoid broken navigation:

Preferred approach (recommended):

* Use explicit HTML anchors in headings, and link to those anchors from the TOC.
* This makes the TOC reliable across GitHub, GitLab, and renderers.

Example (portable and reliable):

```md
## <a id="installation"></a>Instalación
```

TOC entry:

```md
- [Instalación](#installation)
```

Do this for every heading referenced by the TOC.

### Rule B: Anchor IDs must be stable and consistent

* Use lowercase kebab-case: `feature-overview`, `quick-start`, `troubleshooting`
* Keep anchor IDs the same across all languages (recommended), even if the heading text changes.
  This avoids needing to reinvent the TOC logic per language.

### Rule C: Do not rely on auto-generated anchors

Auto anchors can break due to:

* Accents/diacritics (Español, Français, Português)
* Non-Latin scripts (日本語, 한국어, 中文, Русский)
* Duplicate headings (“Overview” appearing multiple times)
* Punctuation changes

If you must rely on auto anchors (not recommended), you must verify every TOC click works.

---

## Links, images, and relative paths

1. Keep relative paths valid
   If English uses `assets/...` or `locales/...`, ensure the translated README’s relative path still resolves from its folder.

2. Use consistent cross-language links
   If you have language switch links, point them to the correct translated files. Example header:

```html
<h4 align="center">
  English |
  <a href="locales/es/README.md">Español</a> |
  <a href="locales/ja/README.md">日本語</a> |
  <a href="locales/ko/README.md">한국어</a> |
  <a href="locales/zh/README.md">中文</a> |
  <a href="locales/zh-TW/README.md">繁體中文</a> |
  <a href="locales/ru/README.md">Русский</a> |
  <a href="locales/de/README.md">Deutsch</a> |
  <a href="locales/fr/README.md">Français</a> |
  <a href="locales/pt/README.md">Português</a>
</h4>
```

(Adjust paths if your translated README is already inside `locales/<lang>/`.)

---

## Translation style guidance (short)

* Translate meaning, keep it concise.
* Keep warnings/instructions clear and direct.
* Preserve technical terms when translation would confuse (e.g., “workflow”, “node”, “checkpoint”), unless the repo already standardized equivalents.

---

## Validation checklist (must pass)

For each translated README:

* TOC: Every TOC link jumps to the correct section (no exceptions).
* Headings: Structure matches English (same section order/hierarchy).
* Links: No broken internal links or image paths.
* Code blocks: unchanged and still correct.
* No accidental translation of identifiers, filenames, commands.

---

## Agent prompt template (copy/paste)

```text
Task
Translate README.md into the existing locale READMEs while preserving structure and ensuring the TOC works perfectly. English is the source of truth.

Hard rules

* Do NOT change section order or heading hierarchy.
* Do NOT translate code blocks, commands, file paths, JSON keys, node names, or identifiers.
* Do NOT reformat or “improve” markdown structure.
* Do NOT change inline code spans (anything inside backticks) except to translate surrounding natural language outside backticks.
* Do NOT translate any style category names or style names anywhere in the README (these are not localized; they must remain in English exactly as written in the English README). This includes any “Styles used” lists, sample image captions, comparison tables, bullet lists, labels/values, and any other places where style categories or style values appear.

Non-Translatable Terms (Do NOT translate; keep EXACT spelling/casing wherever they appear)
These are product names, brand names, protocol/technical tokens, and identifiers. They must remain in English exactly as written in the English README.

A) Provider / product / service names (must remain exact)

* OpenAI
* Anthropic
* Groq
* Gemini
* Hugging Face
* Ollama
* ComfyUI
* Styler Pipeline / AI Styler (if these appear as product/module names, keep exact)

B) Platform / brand / technical tokens (must remain exact)

* GitHub
* PayPal
* Ko-fi
* USDC
* Arbitrum
* README
* JSON
* API
* ID
* HTTP
* CORS
* LLM
* Gemma

C) Model names, model IDs, versions, and code-like tokens (must remain exact)

* Any model identifier like: gemma3:4b, org/model-name
* Any key/token prefix patterns like: sk-..., sk-ant-..., gsk_..., hf_...
* Any content that looks like an identifier, slug, flag, or config value must remain exact.

D) Style system terms (must remain exact; NEVER translate)

* Any style category name (e.g., aesthetic, atmosphere, environment, lighting, mood, timeofday, face, hair, clothing_style, depth, etc.)
* Any style value/name (e.g., Enchanted Forest, Neon/Bioluminescent Glow, Nature/bamboo forest, BlueHour, Bioluminescent Organic, Enchanted, Twilight, Raised Eyebrow, Color combo silver and cyan, Iridescent, Soft Focus, etc.)
* Any lists or tables that show “Styles used” (or equivalent) must keep both the category keys and the style values EXACTLY as in English.
* If a localized README currently contains translated style categories/values from older translations, revert them back to the original English spellings from the English README.

Mixed Text Rule
If a sentence contains any Non-Translatable Term or token, keep that substring unchanged and translate only the surrounding natural language.

Markdown-specific translation constraints

* Do NOT translate link URLs. Translate only link text if it is natural language (the visible label), never the URL.
* Do NOT translate image paths or filenames.
* Do NOT translate headings’ anchor IDs (see TOC requirement below).
* Do NOT change fenced code language hints (`bash`, `json`, etc).
* Do NOT translate tables’ technical tokens/identifiers; translate only human-language column labels and descriptions.
* When a table cell contains style categories/values (see section D above), those must remain in English exactly as in the English README.

TOC requirement (critical)

* Implement explicit stable anchors for every TOC target:
  Use: ## <a id="some-anchor"></a>Translated Heading
* Update TOC links to match these anchors.
* Anchor IDs must be stable and kebab-case.
* Prefer keeping the same anchor IDs across languages (reuse the English IDs exactly when possible).

Validation

* Click-test every TOC entry in each translated README: must jump to the correct section without exception.
* Verify images and relative links resolve correctly from each locale path.
* Verify Non-Translatable Terms remain exact (spelling/case/punctuation) across the entire README.
* Verify style category names and style names remain in English exactly as in the English README (no localization anywhere).

Final Report
For each translated README:

* List sections translated: N
* TOC entries validated: N
* Non-translatable compliance: Yes/No
* If any corrections were needed for non-translatable terms, list them as:
  <locale> | <location (heading/paragraph/table row)> | BEFORE: “...” | AFTER: “...”

Deliverable

* Commit message: "docs: translate README + fix TOC anchors"
* Make a commit with the changes (do not revert anything, do not discard uncommitted changes).
```
