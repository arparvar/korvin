import copy
import json
import os
import warnings

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "capabilities.json")
TMP_PATH = f"{REGISTRY_PATH}.tmp"
UNREADABLE_WARNING = "capabilities: registry unreadable, defaulting all to enabled"
_warned_unreadable = False

DEFAULT_CAPABILITIES = [
    {
        "id": "example-echo",
        "type": "skill",
        "label": "Echo (example)",
        "enabled": True,
        "permission": "read-only",
        "service_unit": None,
        "allowlist": [],
    },
    {
        "id": "research",
        "type": "skill",
        "label": "Web search",
        "enabled": True,
        "permission": "network-read",
        "service_unit": None,
        "allowlist": ["lite.duckduckgo.com"],
    },
    {
        "id": "searxng",
        "type": "service",
        "label": "SearXNG (local search)",
        "enabled": True,
        "permission": None,
        "service_unit": "korvin-searxng.service",
        "allowlist": None,
    },
    {
        "id": "egress-broker",
        "type": "service",
        "label": "Egress broker",
        "enabled": True,
        "permission": None,
        "service_unit": "korvin-egress-broker.service",
        "allowlist": None,
    },
]


def _read_capabilities():
    global _warned_unreadable
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as registry:
            return json.load(registry)
    except (OSError, json.JSONDecodeError):
        if not _warned_unreadable:
            warnings.warn(UNREADABLE_WARNING)
            _warned_unreadable = True
        capabilities = copy.deepcopy(DEFAULT_CAPABILITIES)
        for entry in capabilities:
            entry["enabled"] = True
        return capabilities


def list_capabilities():
    return _read_capabilities()


def is_enabled(id):
    entry = next((item for item in _read_capabilities() if item.get("id") == id), None)
    return entry is None or entry.get("enabled") is True


def set_enabled(id, bool):
    capabilities = _read_capabilities()
    entry = next((item for item in capabilities if item.get("id") == id), None)

    if entry is None:
        return None

    entry["enabled"] = bool is True
    with open(TMP_PATH, "w", encoding="utf-8") as registry:
        json.dump(capabilities, registry, indent=2)
        registry.write("\n")
    if os.name == "nt":
        os.replace(TMP_PATH, REGISTRY_PATH)
    else:
        os.rename(TMP_PATH, REGISTRY_PATH)
    return entry
