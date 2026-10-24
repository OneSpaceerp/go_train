app_name = "go_train"
app_title = "Go Train"
app_publisher = "nsdLabs"
app_description = (
    "Multi-sport fitness-space management (gym, CrossFit, calisthenics and more) "
    "and the backend for the Go Train PWA, on Frappe/ERPNext v16."
)
app_email = "info@nsd-eg.com"
app_license = "mit"
app_icon_url = "/assets/go_train/images/go_train_logo.png"
app_logo_url = "/assets/go_train/images/go_train_logo.png"

# nsdLabs is a brand under Nest Software Development.
required_apps = ["frappe/erpnext"]

# ---------------------------------------------------------------------------
# App launcher — show Go Train as a tile on the /apps screen (Frappe v15+),
# opening the Go Train workspace. Without this the app's workspaces are only
# reachable by direct URL (/app/go-train).
# ---------------------------------------------------------------------------
add_to_apps_screen = [
    {
        "name": "go_train",
        "logo": "/assets/go_train/images/go_train_logo.png",
        "title": "Go Train",
        "route": "/app/go-train",
        "has_permission": "go_train.setup.install.has_app_permission",
    }
]

# ---------------------------------------------------------------------------
# Installation — create roles and seed starter data (idempotent).
# ---------------------------------------------------------------------------
after_install = "go_train.setup.install.after_install"

# ---------------------------------------------------------------------------
# Document events (cross-doctype server logic lives in controllers/these hooks)
# ---------------------------------------------------------------------------
# doc_events = {}

# ---------------------------------------------------------------------------
# Fixtures — exported customizations (added as the app grows)
# ---------------------------------------------------------------------------
# fixtures = []

# ---------------------------------------------------------------------------
# Website — the Go Train PWA will be served from a www/ route in a later phase.
# ---------------------------------------------------------------------------
# website_route_rules = [
#     {"from_route": "/go-train/<path:app_path>", "to_route": "go_train"},
# ]
