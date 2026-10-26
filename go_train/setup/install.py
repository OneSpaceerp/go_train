# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe

# Roles used by the Go Train DocType permission matrix:
#   Gym Manager  — full admin over members, programs, classes, settings
#   Coach        — creates programs & workouts, views client logs & progress
#   Front Desk   — manages members, class bookings, and check-ins
#   Member       — the athlete signing in to the /gotrain PWA (portal role)
ROLES = (
	("Gym Manager", True),
	("Coach", True),
	("Front Desk", True),
	("Member", False),
)

STARTER_SPORTS = (
	("CrossFit", "High-intensity functional training, metabolic conditioning, and barbell cycling."),
	("Weightlifting", "Olympic weightlifting — Snatch, Clean & Jerk, and positional strength."),
	("Powerlifting", "Maximal strength in the Back Squat, Bench Press, and Deadlift."),
	("Gymnastics", "Bodyweight control, calisthenics, rings, and bar skills."),
	("Running", "Endurance, track intervals, tempo runs, and aerobic conditioning."),
	("General Fitness", "Foundational strength, mobility, and daily conditioning."),
)

STARTER_EXERCISES = (
	("Back Squat", "Strength", "Powerlifting", "kg", "Barbell back squat to full depth."),
	("Front Squat", "Strength", "Weightlifting", "kg", "Barbell front-rack squat with upright torso."),
	("Deadlift", "Strength", "Powerlifting", "kg", "Conventional or sumo barbell deadlift from the floor."),
	("Bench Press", "Strength", "Powerlifting", "kg", "Flat barbell bench press."),
	("Strict Press", "Strength", "General Fitness", "kg", "Standing overhead barbell press with no leg drive."),
	("Snatch", "Strength", "Weightlifting", "kg", "Full squat snatch from floor to overhead."),
	("Clean & Jerk", "Strength", "Weightlifting", "kg", "Full squat clean followed by split or power jerk."),
	("Thruster", "WOD", "CrossFit", "kg", "Front squat directly into an overhead push press."),
	("Wall Ball", "WOD", "CrossFit", "reps", "Medicine ball squat and throw to target height."),
	("Burpee", "WOD", "CrossFit", "reps", "Chest-to-floor burpee with full hip extension jump."),
	("Pull-up", "Skill", "Gymnastics", "reps", "Strict, kipping, or butterfly chin-over-bar pull-up."),
	("Bar Muscle-up", "Skill", "Gymnastics", "reps", "Pull-up transitioning above the pull-up bar to locked-out support."),
	("Toes-to-Bar", "Core", "Gymnastics", "reps", "Hanging core raise bringing both feet to contact the bar."),
	("Hollow Hold", "Core", "Gymnastics", "sec", "Isometric gymnastics hollow-body core hold."),
	("Row (Concept2)", "Engine", "CrossFit", "m", "Ergometer rowing for distance, calories, or pace."),
	("5K Run", "Engine", "Running", "min", "5,000-meter endurance time trial or tempo run."),
	("90/90 Hip Mobility", "Mobility", "General Fitness", "sec", "Internal and external hip rotation floor transitions."),
)

STARTER_CLASS_TYPES = (
	("CrossFit WOD", "CrossFit", 60, 16, "#F23D46", "Daily coached group conditioning and strength class."),
	("Olympic Lifting", "Weightlifting", 75, 12, "#D97706", "Technical Snatch and Clean & Jerk session."),
	("Engine & Conditioning", "Running", 45, 20, "#059669", "Row, bike, ski, and running aerobic intervals."),
	("Open Gym", "General Fitness", 90, 24, "#2563EB", "Self-directed training block with floor access."),
)


def after_install():
	ensure_roles()
	ensure_starter_catalog()


def ensure_roles():
	for role_name, desk_access in ROLES:
		if not frappe.db.exists("Role", role_name):
			frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role_name,
					"desk_access": 1 if desk_access else 0,
				}
			).insert(ignore_permissions=True)


def ensure_starter_catalog():
	if not frappe.db.exists("DocType", "Sport"):
		return

	for sport_name, description in STARTER_SPORTS:
		if not frappe.db.exists("Sport", sport_name):
			frappe.get_doc(
				{
					"doctype": "Sport",
					"sport_name": sport_name,
					"description": description,
				}
			).insert(ignore_permissions=True)

	if frappe.db.exists("DocType", "Exercise"):
		for ex_name, category, sport, unit, desc in STARTER_EXERCISES:
			if not frappe.db.exists("Exercise", ex_name):
				frappe.get_doc(
					{
						"doctype": "Exercise",
						"exercise_name": ex_name,
						"category": category,
						"sport": sport if frappe.db.exists("Sport", sport) else None,
						"default_unit": unit,
						"description": desc,
					}
				).insert(ignore_permissions=True)

	if frappe.db.exists("DocType", "Class Type"):
		for ct_name, sport, duration, cap, color, desc in STARTER_CLASS_TYPES:
			if not frappe.db.exists("Class Type", ct_name):
				frappe.get_doc(
					{
						"doctype": "Class Type",
						"class_type_name": ct_name,
						"sport": sport if frappe.db.exists("Sport", sport) else None,
						"default_duration_minutes": duration,
						"default_capacity": cap,
						"color": color,
						"description": desc,
					}
				).insert(ignore_permissions=True)
