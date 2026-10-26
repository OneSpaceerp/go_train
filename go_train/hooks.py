app_name = "go_train"
app_title = "Go Train"
app_publisher = "Go Train"
app_description = "Gym, coaching, workout programming, and athlete progress tracking on ERPNext"
app_email = "support@gotrain.app"
app_license = "mit"
app_home = "/desk/go-train"

# Required apps
required_apps = ["frappe"]

# Desk icon sprite (duotone + soft variants used by Workspace Sidebar and Dock)
app_include_icons = [
	"/assets/go_train/icons/module-icons.svg",
]

# Apps screen (Frappe v16+)
add_to_apps_screen = [
	{
		"name": "go_train",
		"logo": "/assets/go_train/images/go_train_logo.png",
		"title": "Go Train",
		"route": app_home,
		"has_permission": "go_train.api.pwa.check_app_permission",
	}
]

# Route all /gotrain/* subpaths to the single-page athlete & coach PWA
website_route_rules = [
	{"from_route": "/gotrain/<path:app_path>", "to_route": "gotrain"},
]

# Seed gym roles and starter reference data on install & migrate
after_install = "go_train.setup.install.after_install"
after_migrate = "go_train.setup.install.after_install"
