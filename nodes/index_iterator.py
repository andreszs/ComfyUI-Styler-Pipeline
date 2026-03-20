class IndexIterator:
    NODE_ID = "IndexIterator"
    NODE_NAME = "Index Iterator"

    _counters = {}  # {unique_id: current_value}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "reset": ("BOOLEAN", {"default": False}),
                "start": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("index",)
    FUNCTION = "iterate"
    CATEGORY = "Styler Pipeline/Helpers"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always re-execute so the counter increments on every run.
        return float("nan")

    def iterate(self, reset, start, unique_id):
        if reset or unique_id not in IndexIterator._counters:
            IndexIterator._counters[unique_id] = start
        else:
            IndexIterator._counters[unique_id] += 1

        return (IndexIterator._counters[unique_id],)
