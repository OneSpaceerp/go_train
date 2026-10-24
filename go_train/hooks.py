app_name = "go_train"
app_title = "Go Train"
app_publisher = "nsdLabs"
app_description = (
    "Multi-sport fitness-space management (gym, CrossFit, calisthenics and more) "
    "and the Go Train PWA, on Frappe/ERPNext v16."
)
app_email = "info@nsd-eg.com"
app_license = "mit"
app_icon_url = "/assets/go_train/images/go_train_logo.png"
app_logo_url = "/assets/go_train/images/go_train_logo.png"

# nsdLabs is a brand under Nest Software Development.
required_apps = ["frappe/erpnext"]

# The installable PWA lives at /gotrain (served by www/gotrain.py + gotrain.html).
app_home = "/gotrain"

# ---------------------------------------------------------------------------
# App launcher — the Go Train tile opens the PWA.
# ---------------------------------------------------------------------------
add_to_apps_screen = [
    {
        "name": "go_train",
        "logo": "/assets/go_train/images/go_train_logo.png",
        "title": "Go Train",
        "route": app_home,
        "has_permission": "go_train.api.pwa.check_app_permission",
    }
]

# ---------------------------------------------------------------------------
# Website routing — every client-side route under /gotrain is served by the
# single bootloader page, so the SPA owns its own navigation.
# ---------------------------------------------------------------------------
website_route_rules = [
    {"from_route": "/gotrain/<path:app_path>", "to_route": "gotrain"},
]

# ---------------------------------------------------------------------------
# Installation — create roles and seed starter data (idempotent).
# ---------------------------------------------------------------------------
after_install = "go_train.setup.install.after_install"
after_migrate = "go_train.setup.install.after_install"

# ---------------------------------------------------------------------------
# Document events / fixtures — added as the app grows.
# ---------------------------------------------------------------------------
# doc_events = {}
# fixtures = []
