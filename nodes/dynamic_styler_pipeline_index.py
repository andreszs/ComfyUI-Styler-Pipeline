import logging
from datetime import datetime

import torch

from ..utils.styler_core import (
    encode_style_to_conditioning,
    extract_style_text_from_template,
    styler_data,
)


class DynamicStylerPipeline:
    """
    Apply a SINGLE style selected by (category, index).

    Intended for batch sweeps: connect an external integer source to style_index,
    and the node will cycle through the category's styles deterministically.
    """

    NODE_ID = "DynamicStylerPipelineSingle"
    NODE_NAME = "Styler Pipeline (By Index)"

    @classmethod
    def INPUT_TYPES(cls):
        categories = sorted(styler_data.keys())

        return {
            "required": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "category": (categories if categories else ["(no categories loaded)"],),
                "style_index": ("INT", {"default": 0, "min": 0, "max": 1_000_000, "step": 1}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.05}),
                "redundancy": ("INT", {"default": 1, "min": 1, "max": 4, "step": 1}),
                "prepend_timestamp": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("positive", "negative", "style")
    FUNCTION = "apply_single_style_by_index"
    CATEGORY = "Styler Pipeline/Stylers"

    def apply_single_style_by_index(
        self,
        positive,
        negative,
        category,
        style_index=0,
        strength=1.0,
        redundancy=1,
        prepend_timestamp=False,
        clip=None,
    ):
        if clip is None:
            raise ValueError(
                "Dynamic Styler Pipeline (Single Style by Index): "
                "CLIP input is required. Please connect a CLIP model."
            )

        # Resolve category data
        category_data = styler_data.get(category)
        if not category_data:
            logging.warning("DynamicStylerPipelineSingle: category '%s' not found or empty.", category)
            return (positive, negative, "")

        # Deterministic ordering: preserve dict insertion order as loaded.
        # (If you later want alphabetical sweeps, change to: keys = sorted(category_data.keys()))
        keys = list(category_data.keys())
        if not keys:
            return (positive, negative, "")

        try:
            idx = int(style_index)
        except Exception:
            idx = 0

        selected_key = keys[idx % len(keys)]
        template = category_data.get(selected_key)

        # Build positive/negative style text from the selected template
        style_positive = extract_style_text_from_template(template, for_positive=True) if template else ""
        positive_out = self._inject_style(
            clip,
            positive,
            style_positive,
            strength=strength,
            redundancy=redundancy,
            branch_name=f"positive:{category}:{selected_key}",
        )

        style_negative = extract_style_text_from_template(template, for_positive=False) if template else ""
        negative_out = self._inject_style(
            clip,
            negative,
            style_negative,
            strength=strength,
            redundancy=redundancy,
            branch_name=f"negative:{category}:{selected_key}",
        )

        style_name = selected_key.replace(" ", "_").replace("/", "-")
        if prepend_timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            style_name = f"{timestamp}_{style_name}"
        return (positive_out, negative_out, style_name)

    def _inject_style(
        self,
        clip,
        base_conditioning,
        style_text,
        strength=1.0,
        redundancy=1,
        branch_name="",
    ):
        if not style_text:
            return base_conditioning

        style_conditioning = encode_style_to_conditioning(clip, style_text, 1.0)
        if not style_conditioning:
            return base_conditioning

        style_tokens, style_meta = self._merge_style_chunks(style_conditioning, branch_name)
        if style_tokens is None:
            return base_conditioning

        style_tokens_scaled = style_tokens * strength
        if redundancy > 1:
            style_tokens_scaled = torch.cat([style_tokens_scaled] * redundancy, dim=1)

        if not base_conditioning:
            meta = style_meta.copy() if style_meta is not None else {}
            return [[style_tokens_scaled, meta]]

        out = []
        for cond_to in base_conditioning:
            base_tokens = cond_to[0]
            new_tokens = torch.cat((base_tokens, style_tokens_scaled), dim=1)
            base_meta = cond_to[1].copy()
            out.append([new_tokens, base_meta])

        return out

    def _merge_style_chunks(self, style_conditioning, branch_name):
        if not style_conditioning:
            return None, None

        token_tensors = []
        for chunk in style_conditioning:
            if (
                isinstance(chunk, (list, tuple))
                and len(chunk) > 0
                and chunk[0] is not None
            ):
                token_tensors.append(chunk[0])

        if not token_tensors:
            return None, None

        if len(token_tensors) > 1:
            logging.debug(
                "DynamicStylerPipelineSingle(%s): merging %d style chunks.",
                branch_name,
                len(token_tensors),
            )

        try:
            style_tokens = torch.cat(token_tensors, dim=1)
        except Exception:
            logging.warning(
                "DynamicStylerPipelineSingle(%s): failed to merge all style chunks, "
                "falling back to first chunk.",
                branch_name,
            )
            style_tokens = token_tensors[0]

        style_meta = None
        first_chunk = style_conditioning[0]
        if (
            isinstance(first_chunk, (list, tuple))
            and len(first_chunk) > 1
            and isinstance(first_chunk[1], dict)
        ):
            style_meta = first_chunk[1]

        return style_tokens, style_meta
