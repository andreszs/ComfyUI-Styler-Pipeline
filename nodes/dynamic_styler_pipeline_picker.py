import logging

import torch

from ..utils.styler_core import (
    encode_style_to_conditioning,
    extract_style_text_from_template,
    styler_data,
)


class DynamicStylerPipelinePicker:
    """
    Apply a SINGLE style selected via category + style dropdowns.

    The style dropdown updates dynamically when the category changes
    (handled by the companion JS extension).
    """

    NODE_ID = "DynamicStylerPipelinePicker"
    NODE_NAME = "Styler Pipeline (Single)"

    @classmethod
    def INPUT_TYPES(cls):
        categories = sorted(styler_data.keys())
        default_category = categories[0] if categories else ""
        default_styles = (
            list(styler_data[default_category].keys()) if default_category else []
        )

        return {
            "required": {
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "category": (
                    categories if categories else ["(no categories loaded)"],
                ),
                "style": (
                    default_styles if default_styles else ["(no styles loaded)"],
                ),
                "strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.05},
                ),
                "redundancy": (
                    "INT",
                    {"default": 1, "min": 1, "max": 4, "step": 1},
                ),
            },
            "optional": {
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("positive", "negative", "style")
    FUNCTION = "apply_single_style"
    CATEGORY = "Styler Pipeline/Stylers"

    @classmethod
    def VALIDATE_INPUTS(cls, category, style, **kwargs):
        """Allow any combo value so the JS-driven dynamic style dropdown works."""
        return True

    def apply_single_style(
        self,
        positive,
        negative,
        category,
        style,
        strength=1.0,
        redundancy=1,
        clip=None,
    ):
        if clip is None:
            raise ValueError(
                "Dynamic Styler Pipeline (Single Style Picker): "
                "CLIP input is required. Please connect a CLIP model."
            )

        category_data = styler_data.get(category)
        if not category_data:
            logging.warning(
                "DynamicStylerPipelinePicker: category '%s' not found or empty.",
                category,
            )
            return (positive, negative, "")

        if style not in category_data:
            logging.warning(
                "DynamicStylerPipelinePicker: style '%s' not found in category '%s'.",
                style,
                category,
            )
            return (positive, negative, "")

        template = category_data[style]

        style_positive = (
            extract_style_text_from_template(template, for_positive=True)
            if template
            else ""
        )
        positive_out = self._inject_style(
            clip,
            positive,
            style_positive,
            strength=strength,
            redundancy=redundancy,
            branch_name=f"positive:{category}:{style}",
        )

        style_negative = (
            extract_style_text_from_template(template, for_positive=False)
            if template
            else ""
        )
        negative_out = self._inject_style(
            clip,
            negative,
            style_negative,
            strength=strength,
            redundancy=redundancy,
            branch_name=f"negative:{category}:{style}",
        )

        return (positive_out, negative_out, style)

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
                "DynamicStylerPipelinePicker(%s): merging %d style chunks.",
                branch_name,
                len(token_tensors),
            )

        try:
            style_tokens = torch.cat(token_tensors, dim=1)
        except Exception:
            logging.warning(
                "DynamicStylerPipelinePicker(%s): failed to merge all style "
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
