# styler_core.py
# Shared core for all styler nodes
# This file lives in /utils and does NOT define any nodes

import json
import pathlib
from collections import defaultdict
from json import JSONDecodeError

RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class Template:
    """Represents a style template with positive and negative prompts"""

    def __init__(self, prompt, negative_prompt, **kwargs):
        self.prompt = prompt
        self.negative_prompt = negative_prompt

    def replace_prompts(self, positive_prompt, negative_prompt):
        """Replace {prompt} in the template with the user's prompt"""
        positive_result = self.prompt.replace("{prompt}", positive_prompt)
        negative_result = ", ".join(
            x for x in (self.negative_prompt, negative_prompt) if x
        )
        return positive_result, negative_result


class StylerData:
    """Loads and manages style templates from the /data directory"""

    def __init__(self, datadir=None):
        self._data = defaultdict(dict)

        if datadir is None:
            datadir = pathlib.Path(__file__).parent.parent / "data"

        self._datadir = datadir
        self._load(verbose=True)

    def _load(self, verbose=False):
        """Read all JSON style files from the data directory."""
        self._data.clear()

        for j in self._datadir.glob("*.json"):
            try:
                with j.open("r", encoding="utf-8") as f:
                    content = json.load(f)

                group = j.stem

                for template in content:
                    self._data[group][template["name"]] = Template(**template)

            except PermissionError:
                print(
                    f"{YELLOW}[comfyui-styler-pipeline] WARNING: Skipping style JSON '{j.name}': no read permission{RESET}"
                )

            except KeyError as e:
                print(
                    f"{YELLOW}[comfyui-styler-pipeline] WARNING: Skipping style JSON '{j.name}': missing required field '{e.args[0]}'{RESET}"
                )

            except JSONDecodeError as e:
                if e.lineno is not None and e.colno is not None:
                    detail = f"parse error at line {e.lineno}, column {e.colno}"
                else:
                    detail = "parse error"
                print(
                    f"{YELLOW}[comfyui-styler-pipeline] WARNING: Skipping style JSON '{j.name}': {detail}{RESET}"
                )

            except Exception as e:
                print(
                    f"{YELLOW}[comfyui-styler-pipeline] WARNING: Skipping style JSON '{j.name}': {e}{RESET}"
                )

    def reload(self):
        """Re-read all JSON style files from disk (hot-reload)."""
        self._load(verbose=False)

    def __getitem__(self, item):
        return self._data.get(item, {})

    def get(self, item, default=None):
        """Dict-compatible .get() so callers can distinguish missing keys."""
        if item in self._data:
            return self._data[item]
        return default

    def keys(self):
        return self._data.keys()


# Global shared instance used by all nodes
styler_data = StylerData()


def debug_menu_choices(node_name, menu, choices):
    """Shared helper for debugging menu choices in nodes.

    Notes:
    - The 'None' option is injected by the node itself.
    - JSON files must only define real style entries.
    """
    json_path = pathlib.Path(__file__).parent.parent / "data" / f"{menu}.json"

    if not json_path.exists():
        print(
            f"{RED}[comfyui-styler-pipeline][ERROR]{RESET} "
            f"Node '{node_name}': missing styles file '{json_path.name}' (not found in data/)."
        )
        return

    # Remove auto-injected sentinel before validating
    real_choices = [c for c in choices if c != "None"]

    if not real_choices:
        print(
            f"{RED}[comfyui-styler-pipeline][ERROR]{RESET} "
            f"Node '{node_name}': menu '{menu}' has no usable style entries. "
            f"Check '{json_path.name}' content/format."
        )
        return


def encode_style_to_conditioning(clip, text, strength=1.0):
    """
    Encode style text using CLIP and return a valid CONDITIONING structure.

    Args:
        clip: ComfyUI CLIP model
        text: Style text to encode
        strength: Intensity multiplier (default: 1.0)

    Returns:
        Conditioning list in ComfyUI format:
        [[tensor_cond, {"pooled_output": tensor_pooled}]]
        Returns an empty list if the input text is empty.
    """
    if not text:
        return []

    # Tokenize and encode using the CLIP API
    tokens = clip.tokenize(text)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)

    # Apply strength by scaling the conditioning tensor
    if strength != 1.0:
        cond = cond * strength

    # Return standard ComfyUI conditioning format
    return [[cond, {"pooled_output": pooled}]]


def combine_conditioning(original, additional):
    """
    Combine two CONDITIONING inputs using simple concatenation.

    This is a basic strategy. In the future, it could be extended to:
    - Weighted average
    - Interpolation
    - Area-based combination

    Args:
        original: Original CONDITIONING (can be None or [])
        additional: Additional CONDITIONING to append (can be None or [])

    Returns:
        Combined CONDITIONING
    """
    if not additional:
        return original if original else []

    if not original:
        return additional

    # Simple concatenation: original + additional
    return original + additional


def build_style_index():
    """
    Build a compact style index for the frontend modal UI.

    Returns a list of dicts, each containing:
        style_id  - stable ID in the form "category:style_key"
        category  - the JSON group name (e.g. "mood", "gothic")
        title     - the style entry key/name
        text      - concatenated positive + negative template for search
    """
    index = []
    for category in sorted(styler_data.keys()):
        for style_key in sorted(styler_data[category].keys()):
            template = styler_data[category][style_key]
            search_text = " ".join(
                part
                for part in (template.prompt, template.negative_prompt)
                if part
            )
            index.append(
                {
                    "style_id": f"{category}:{style_key}",
                    "category": category,
                    "title": style_key,
                    "positive_prompt": template.prompt or "",
                    "text": search_text,
                }
            )
    return index


def build_style_catalog():
    """
    Build full style catalog grouped by category for editor-like UIs.

    Returns:
        dict where each key is category name and value is a list of styles
        containing: name, prompt, negative_prompt
    """
    catalog = {}
    for category in sorted(styler_data.keys()):
        styles = []
        for style_key in sorted(styler_data[category].keys()):
            template = styler_data[category][style_key]
            styles.append(
                {
                    "name": style_key,
                    "prompt": template.prompt or "",
                    "negative_prompt": template.negative_prompt or "",
                }
            )
        catalog[category] = styles
    return catalog


def extract_style_text_from_template(template, for_positive=True):
    """
    Extract pure style text from a template, without the {prompt} placeholder.

    Args:
        template: Template instance
        for_positive: If True, extract positive style text;
                      if False, extract negative style text

    Returns:
        String containing the style text (without {prompt})
    """
    if for_positive:
        # Extract only the part of the template that is not {prompt}
        style_part = template.prompt.replace("{prompt}", "").strip()
        # Clean up common artifacts
        if style_part in ("", ".", ","):
            return ""
        return style_part
    else:
        # Negative part of the template
        return template.negative_prompt if template.negative_prompt else ""

