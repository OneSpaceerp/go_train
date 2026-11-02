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


def _logo_version():
	# Content hash in the logo URL so browsers drop a cached old logo
	import hashlib
	from pathlib import Path

	logo = Path(__file__).parent / "public" / "images" / "go_train_logo.png"
	return hashlib.sha1(logo.read_bytes()).hexdigest()[:8] if logo.exists() else "1"


# Apps screen (Frappe v16+)
add_to_apps_screen = [
	{
		"name": "go_train",
		"logo": f"/assets/go_train/images/go_train_logo.png?v={_logo_version()}",
		"title": "Go Train",
		"route": app_home,
		"has_permission": "go_train.api.pwa.check_app_permission",
	}
]

# Route all /gotrain/* subpaths to the single-page athlete & coach PWA
website_route_rules = [
	{"from_route": "/gotrain/<path:app_path>", "to_route": "gotrain"},
]

# Digital Asset Links for the Android (Play Store) app; see go_train/well_known.py
before_request = ["go_train.well_known.serve_assetlinks"]

# Seed gym roles and starter reference data on install & migrate
after_install = "go_train.setup.install.after_install"
after_migrate = "go_train.setup.install.after_install"

# Row-level access: athletes only see their own records (see go_train/permissions.py)
permission_query_conditions = {
	"Member": "go_train.permissions.member_query",
	"Workout Log": "go_train.permissions.workout_log_query",
	"Progress Entry": "go_train.permissions.progress_entry_query",
	"Class Booking": "go_train.permissions.class_booking_query",
	"Check In": "go_train.permissions.check_in_query",
	"Member Program": "go_train.permissions.member_program_query",
	"Training Program": "go_train.permissions.training_program_query",
	"Workout": "go_train.permissions.workout_query",
}

has_permission = {
	"Member": "go_train.permissions.has_member_permission",
	"Workout Log": "go_train.permissions.has_member_record_permission",
	"Progress Entry": "go_train.permissions.has_member_record_permission",
	"Class Booking": "go_train.permissions.has_member_record_permission",
	"Check In": "go_train.permissions.has_member_record_permission",
	"Member Program": "go_train.permissions.has_member_record_permission",
	"Training Program": "go_train.permissions.has_training_program_permission",
	"Workout": "go_train.permissions.has_workout_permission",
}
