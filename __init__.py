import importlib
import inspect
import json
import os
import traceback

# ============================================================================
# ComfyUI Styler Pipeline
# Automatic node loader
#
# - Nodes are loaded ONLY from the "nodes/" directory
# - Helper modules should live in the plugin root (this directory)
# - Nothing in the root is auto-imported as a node
# ============================================================================

# Color codes for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_OVERRIDES = {
    "DynamicStylerPipeline": "Styler Pipeline",
}

# Optional JavaScript support
WEB_DIRECTORY = (
    "./js"
    if os.path.exists(os.path.join(os.path.dirname(__file__), "js"))
    else None
)

BASE_DIR = os.path.dirname(__file__)
EXTENSION_DIR_NAME = os.path.basename(BASE_DIR)
NODES_DIR = os.path.join(BASE_DIR, "nodes")
LOCALES_DIR = os.path.join(BASE_DIR, "locales")


def log(msg):
    print(f"[comfyui-styler-pipeline] {msg}")


def log_warning(msg):
    """Print warning message in yellow"""
    print(f"{YELLOW}[comfyui-styler-pipeline] WARNING: {msg}{RESET}")


def log_error(msg):
    """Print error message in red"""
    print(f"{RED}[comfyui-styler-pipeline] ERROR: {msg}{RESET}")


def log_success(msg):
    """Print success message in green"""
    print(f"{GREEN}[comfyui-styler-pipeline] {msg}{RESET}")


# If the nodes directory does not exist, fail gracefully
if not os.path.isdir(NODES_DIR):
    log("No 'nodes' directory found. No nodes were loaded.")
else:
    # ========================================================================
    # CRITICAL: Node Loader Architecture
    # ========================================================================
    # DO NOT CHANGE THIS LOADING MECHANISM WITHOUT EXPLICIT CONSENT FROM AUTHOR
    # 
    # This loader uses importlib.import_module() with relative imports
    # (package parameter) to maintain proper Python package context.
    #
    # WHY THIS METHOD IS REQUIRED:
    # ========================================================================
    # 1. PACKAGE CONTEXT PRESERVATION:
    #    - importlib.import_module(f".nodes.{name}", package=__name__)
    #    - Creates modules with FULL PACKAGE PATH context
    #    - Example: __name__ = "comfyui-styler-pipeline.nodes.advanced_styler_pipeline"
    #    - This allows relative imports to work correctly
    #
    # 2. RELATIVE IMPORTS COMPATIBILITY:
    #    - Nodes MUST use: from ..utils.styler_core import ...
    #    - This syntax REQUIRES proper __package__ context
    #    - When __package__ is None, relative imports fail with ModuleNotFoundError
    #
    # 3. WHY NOT spec_from_file_location()?
    #    - Creates modules in ISOLATION with NO package context
    #    - Results in: __name__ = "advanced_styler_pipeline" (incomplete)
    #    - Results in: __package__ = None (breaks relative imports)
    #    - May "work" with sys.path hacking, but breaks in ComfyUI context
    #    - sys.path hacking is NOT a real solution, just a temporary patch
    #
    # 4. LESSON LEARNED:
    #    - Standalone module loading ≠ Package module loading
    #    - These are TWO different use cases with different requirements
    #    - This codebase IS a Python package structure, NOT standalone scripts
    #
    # ========================================================================
    # IF YOU WANT TO CHANGE THIS:
    # 1. DO NOT - Just ask the author first
    # 2. Understand the difference between:
    #    a) importlib.import_module() → for PACKAGES (USE THIS)
    #    b) spec_from_file_location() → for STANDALONE modules (NOT THIS)
    # 3. Test that relative imports (from ..utils) still work
    # 4. Test in actual ComfyUI environment, not just unit tests
    # ========================================================================
    
    # Deterministic loading order (important across OSs)
    for filename in sorted(os.listdir(NODES_DIR)):
        # Only load valid Python modules
        if not filename.endswith(".py") or filename.startswith("_"):
            continue

        module_name = f".nodes.{filename[:-3]}"

        try:
            # CRITICAL: Use importlib.import_module() with package parameter
            # This maintains the proper package context required for relative imports
            module = importlib.import_module(module_name, package=__name__)
        except Exception as e:
            log_error(f"importing {filename}: {e}")
            traceback.print_exc()
            continue

        # Inspect classes defined in the module
        for _, obj in inspect.getmembers(module, inspect.isclass):
            # Ignore imported classes
            if obj.__module__ != module.__name__:
                continue

            # Must look like a ComfyUI node
            input_types = getattr(obj, "INPUT_TYPES", None)
            if not callable(input_types):
                continue

            try:
                # Node ID (internal)
                node_id = getattr(obj, "NODE_ID", obj.__name__)

                # Node name (UI)
                node_name = getattr(
                    obj,
                    "NODE_NAME",
                    obj.__name__.replace("_", " "),
                )
                node_name = NODE_DISPLAY_NAME_OVERRIDES.get(node_id, node_name)

                # Minimal required attributes
                for attr in ("RETURN_TYPES", "FUNCTION"):
                    if not hasattr(obj, attr):
                        raise ValueError(f"Missing required attribute: {attr}")

                # Prevent accidental overrides
                if node_id in NODE_CLASS_MAPPINGS:
                    raise ValueError(f"Duplicate NODE_ID: {node_id}")

                # Register node
                NODE_CLASS_MAPPINGS[node_id] = obj
                NODE_DISPLAY_NAME_MAPPINGS[node_id] = node_name

            except Exception as e:
                log(f"Invalid node '{obj.__name__}' in {filename}: {e}")
                traceback.print_exc()

    log_success(f"Loaded {len(NODE_CLASS_MAPPINGS)} nodes successfully.")


# ==========================================================================
# API endpoints for frontend (style index for Dynamic Styler Pipeline)
# ==========================================================================

try:
    from aiohttp import web
    from server import PromptServer

    from .utils.styler_core import (
        build_style_catalog,
        build_style_index,
        styler_data,
    )

    @PromptServer.instance.routes.get("/pipeline_control/styles")
    async def get_style_index(request):
        index = build_style_index()
        return web.json_response(index)

    @PromptServer.instance.routes.get("/pipeline_control/styles/catalog")
    async def get_style_catalog(request):
        catalog = build_style_catalog()
        return web.json_response(catalog)

    @PromptServer.instance.routes.get("/pipeline_control/styles/refresh")
    async def refresh_styles(request):
        """Re-read JSON files from disk, then return both index and catalog."""
        styler_data.reload()
        return web.json_response(
            {"index": build_style_index(), "catalog": build_style_catalog()}
        )

    @PromptServer.instance.routes.get("/pipeline_control/version")
    async def get_pipeline_control_version(request):
        name = "comfyui-styler-pipeline"
        version = "unknown"
        toml_path = os.path.join(BASE_DIR, "pyproject.toml")
        try:
            with open(toml_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("version"):
                        match = line.split("=", 1)
                        if len(match) == 2:
                            version = match[1].strip().strip('"').strip("'")
                            break
        except Exception:
            pass
        return web.json_response({"name": name, "version": version})

    @PromptServer.instance.routes.get("/pipeline_control/locales/{lang}/ui.json")
    async def get_pipeline_control_ui_locale(request):
        lang = (request.match_info.get("lang") or "en").strip()
        if not lang:
            lang = "en"
        full_path = os.path.join(LOCALES_DIR, lang, "ui.json")
        real_locales_dir = os.path.realpath(LOCALES_DIR)
        real_file_path = os.path.realpath(full_path)
        if not real_file_path.startswith(real_locales_dir):
            return web.json_response({"error": "Not found"}, status=404)
        if not os.path.isfile(real_file_path):
            return web.json_response({"error": "Not found"}, status=404)
        return web.FileResponse(
            real_file_path, headers={"Content-Type": "application/json; charset=utf-8"}
        )

    ASSETS_DIR = os.path.join(BASE_DIR, "assets")
    ALLOWED_ASSETS = {
        "badge_kofi.svg", "badge_paypal.svg", "badge_usdc.svg",
        "qr-paypal.svg", "qr-usdc.svg", "qr-kofi.svg",
        "placeholders.json",
        "category_icons.svg", "styler_pipeline.css",
    }

    def _resolve_allowed_asset_path(filename):
        if not filename or filename not in ALLOWED_ASSETS:
            return None
        full_path = os.path.join(ASSETS_DIR, filename)
        if not os.path.isfile(full_path):
            return None
        return full_path

    def _asset_content_type(filename):
        if filename.endswith(".json"):
            return "application/json; charset=utf-8"
        if filename.endswith(".css"):
            return "text/css; charset=utf-8"
        return "image/svg+xml"

    @PromptServer.instance.routes.get("/pipeline_control/assets/{filename}")
    async def get_pipeline_control_asset(request):
        filename = request.match_info.get("filename", "")
        full_path = _resolve_allowed_asset_path(filename)
        if not full_path:
            return web.json_response({"error": "Not found"}, status=404)

        content_type = _asset_content_type(filename)

        return web.FileResponse(
            full_path, headers={"Content-Type": content_type}
        )

    @PromptServer.instance.routes.get(f"/extensions/{EXTENSION_DIR_NAME}/assets/{{filename}}")
    async def get_extension_asset(request):
        filename = request.match_info.get("filename", "")
        full_path = _resolve_allowed_asset_path(filename)
        if not full_path:
            return web.json_response({"error": "Not found"}, status=404)

        content_type = _asset_content_type(filename)

        return web.FileResponse(
            full_path, headers={"Content-Type": content_type}
        )

except Exception as e:
    log_warning(f"Could not register API endpoints: {e}")


# Explicit exports for ComfyUI
__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]


