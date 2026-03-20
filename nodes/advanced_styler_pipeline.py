import logging

import torch

from ..utils.styler_core import (
    debug_menu_choices,
    encode_style_to_conditioning,
    extract_style_text_from_template,
    styler_data,
)


class AdvancedStylerPipeline:
    """
    Inject global style into existing CONDITIONING inputs.

    Designed for workflows where prompts are already encoded (for example by
    Area Conditioning nodes) and style should be applied without rebuilding
    prompts.
    """

    NODE_ID = "AdvancedStylerPipeline"
    NODE_NAME = "Advanced Styler Pipeline"

    @classmethod
    def INPUT_TYPES(cls):
        menus = {}
        for menu in styler_data.keys():
            choices = ["None"] + list(styler_data[menu].keys())
            debug_menu_choices(cls.NODE_NAME, menu, choices)
            menus[menu] = (choices,)

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
                **menus,
            },
            "optional": {
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "apply_styles"
    CATEGORY = "Styler Pipeline/Stylers"

    def apply_styles(
        self,
        positive,
        negative,
        strength=1.0,
        redundancy=1,
        clip=None,
        **kwargs
    ):
        # Without CLIP we cannot encode style text; keep incoming conditionings unchanged.
        if clip is None:
            return (positive, negative)

        # Backward compatibility with old workflows.
        strength = kwargs.pop("strength", kwargs.pop("style_strength", strength))
        redundancy = kwargs.pop(
            "redundancy", kwargs.pop("aggressive_repeats", redundancy)
        )

        style_positive = self._generate_style_text(for_positive=True, **kwargs)
        positive_out = self._inject_style(
            clip,
            positive,
            style_positive,
            strength=strength,
            redundancy=redundancy,
            branch_name="positive",
        )
        style_negative = self._generate_style_text(
            for_positive=False, **kwargs
        )
        negative_out = self._inject_style(
            clip,
            negative,
            style_negative,
            strength=strength,
            redundancy=redundancy,
            branch_name="negative",
        )

        return (positive_out, negative_out)

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
                "AdvancedStylerPipeline(%s): merging %d style chunks.",
                branch_name,
                len(token_tensors),
            )

        try:
            style_tokens = torch.cat(token_tensors, dim=1)
        except Exception:
            logging.warning(
                "AdvancedStylerPipeline(%s): failed to merge all style "
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

    def _generate_style_text(self, for_positive, **kwargs):
        parts = []
        for menu, selection in kwargs.items():
            if selection == "None":
                continue
            template = styler_data[menu][selection]
            style_part = extract_style_text_from_template(
                template, for_positive=for_positive
            )
            if style_part:
                parts.append(style_part)

        return ", ".join(parts) if parts else ""

