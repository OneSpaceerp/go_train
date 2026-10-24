# Copyright (c) 2026, nsdLabs and contributors
# For license information, please see license.txt
"""Post-install setup: create Go Train roles and seed starter reference data.

Everything here is idempotent so it is safe on re-install and on `bench migrate`.
"""
import frappe

ROLES = [
    "Gym Manager",   # runs a facility: members, plans, schedule, staff
    "Coach",         # builds programs, reviews logs, runs classes
    "Front Desk",    # check-ins, bookings, walk-ins
    "Member",        # the athlete (Go Train PWA user)
]

# Starter sports/disciplines. Admins can add more.
SPORTS = [
    ("Gym", "Strength training and general fitness"),
    ("CrossFit", "High-intensity functional training"),
    ("Calisthenics", "Bodyweight strength and skills"),
    ("Weightlifting", "Olympic weightlifting"),
    ("HYROX", "Functional fitness racing"),
    ("Boxing", "Boxing and combat conditioning"),
    ("Yoga", "Mobility, flexibility and breath"),
    ("Running", "Endurance and conditioning"),
]


def has_app_permission():
    """Who sees the Go Train tile on the /apps launcher.

    Any Desk user who manages or coaches at the gym; System Managers always.
    Members use the PWA (no Desk access), so they never reach this screen.
    """
    roles = set(frappe.get_roles())
    allowed = {"System Manager", "Gym Manager", "Coach", "Front Desk"}
    return bool(roles & allowed)


def after_install():
    create_roles()
    seed_sports()
    frappe.db.commit()


def create_roles():
    for role_name in ROLES:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": role_name != "Member",  # Members use the PWA, not Desk
            }).insert(ignore_permissions=True)


def seed_sports():
    if not frappe.db.table_exists("Sport"):
        return
    for name, desc in SPORTS:
        if not frappe.db.exists("Sport", name):
            frappe.get_doc({
                "doctype": "Sport",
                "sport_name": name,
                "description": desc,
                "is_active": 1,
            }).insert(ignore_permissions=True)
