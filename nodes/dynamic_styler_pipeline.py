import json
import logging

import torch

from ..utils.styler_core import (
    encode_style_to_conditioning,
    extract_style_text_from_template,
    styler_data,
)


class DynamicStylerPipeline:
    """
    Apply styles via a searchable modal UI with stable category:key IDs.

    Selections are persisted as a JSON string mapping categories to style keys,
    so workflows survive JSON file additions, removals, and reordering.
    """

    NODE_ID = "DynamicStylerPipeline"
    NODE_NAME = "Dynamic Styler Pipeline"
    META_KEY = "__dsp_meta__"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.05},
                ),
                "redundancy": (
                    "INT",
                    {"default": 1, "min": 1, "max": 4, "step": 1},
                ),
                "selected_styles_json": (
                    "STRING",
                    {"default": "{}", "multiline": False},
                ),
            },
            "optional": {
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("positive", "negative", "prompt_debug")
    FUNCTION = "apply_styles"
    CATEGORY = "Styler Pipeline/Stylers"

    def apply_styles(
        self,
        positive,
        negative,
        strength=1.0,
        redundancy=1,
        selected_styles_json="{}",
        clip=None,
    ):
        if clip is None:
            raise ValueError(
                "Dynamic Styler Pipeline: "
                "CLIP input is required. Please connect a CLIP model."
            )

        try:
            selections = json.loads(selected_styles_json)
        except (json.JSONDecodeError, TypeError):
            selections = {}

        if not selections:
            return (positive, negative, "")

        style_positive = self._generate_style_text(selections, for_positive=True)
        positive_out = self._inject_style(
            clip,
            positive,
            style_positive,
            strength=strength,
            redundancy=redundancy,
            branch_name="positive",
        )

        style_negative = self._generate_style_text(selections, for_positive=False)
        negative_out = self._inject_style(
            clip,
            negative,
            style_negative,
            strength=strength,
            redundancy=redundancy,
            branch_name="negative",
        )

        return (positive_out, negative_out, style_positive)

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

        style_tokens, style_meta = self._merge_style_chunks(
            style_conditioning, branch_name
        )
        if style_tokens is None:
            return base_conditioning

        style_tokens_scaled = style_tokens * strength
        if redundancy > 1:
            style_tokens_scaled = torch.cat(
                [style_tokens_scaled] * redundancy, dim=1
            )

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
                "DynamicStylerPipeline(%s): merging %d style chunks.",
                branch_name,
                len(token_tensors),
            )

        try:
            style_tokens = torch.cat(token_tensors, dim=1)
        except Exception:
            logging.warning(
                "DynamicStylerPipeline(%s): failed to merge all style "
                "chunks, falling back to first chunk.",
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

    def _generate_style_text(self, selections, for_positive):
        parts = []
        for category, style_key in selections.items():
            if category == self.META_KEY:
                continue
            if not style_key or style_key == "None":
                continue
            category_data = styler_data.get(category)
            if category_data is None:
                logging.debug(
                    "DynamicStylerPipeline: unknown selection key '%s', skipping.",
                    category,
                )
                continue
            if style_key not in category_data:
                logging.warning(
                    "DynamicStylerPipeline: style '%s:%s' not found, skipping.",
                    category,
                    style_key,
                )
                continue
            template = category_data[style_key]
            style_part = extract_style_text_from_template(
                template, for_positive=for_positive
            )
            if style_part:
                parts.append(style_part)

        return ", ".join(parts) if parts else ""

