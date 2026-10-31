# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""
Row-level access rules for Go Train.

Staff (System Manager, Gym Manager, Coach, Front Desk) keep the access their
roles grant in each DocType's permission matrix. Everyone else (athletes with
the Member role) is restricted to their own records, both through the
whitelisted PWA API and through Frappe's standard REST API (/api/resource).

Hook semantics: `has_permission` hooks return False to deny and None to defer
to the role matrix; `permission_query_conditions` return a SQL WHERE fragment.
"""

import frappe

STAFF_ROLES = frozenset({"System Manager", "Gym Manager", "Coach", "Front Desk"})
MANAGER_ROLES = frozenset({"System Manager", "Gym Manager"})


def _user(user: str | None = None) -> str:
	return user or frappe.session.user


def is_staff(user: str | None = None) -> bool:
	user = _user(user)
	if user == "Administrator":
		return True
	return bool(STAFF_ROLES & set(frappe.get_roles(user)))


def is_manager(user: str | None = None) -> bool:
	user = _user(user)
	if user == "Administrator":
		return True
	return bool(MANAGER_ROLES & set(frappe.get_roles(user)))


def get_member_for_user(user: str | None = None) -> str | None:
	user = _user(user)
	if user == "Guest":
		return None
	return frappe.db.get_value("Member", {"user": user}, "name")


def get_coach_for_user(user: str | None = None) -> str | None:
	user = _user(user)
	if user == "Guest":
		return None
	return frappe.db.get_value("Coach", {"user": user, "is_active": 1}, "name")


def accessible_program_ids(member: str | None) -> list[str]:
	"""Programs that fill the member's calendar: published plus active enrollments."""
	published = frappe.get_all("Training Program", filters={"is_published": 1}, pluck="name")
	enrolled = (
		frappe.get_all("Member Program", filters={"member": member, "is_active": 1}, pluck="program")
		if member
		else []
	)
	return list(dict.fromkeys([*enrolled, *published]))


def viewable_program_ids(member: str | None) -> list[str]:
	"""Programs whose content the member may open: published plus any enrollment
	(including ended ones), except paid enrollments still awaiting payment."""
	published = frappe.get_all("Training Program", filters={"is_published": 1}, pluck="name")
	enrolled = (
		frappe.get_all(
			"Member Program",
			filters={"member": member, "payment_status": ["!=", "Pending"]},
			pluck="program",
		)
		if member
		else []
	)
	return list(dict.fromkeys([*enrolled, *published]))


# ---------------------------------------------------------------------------
# Member-owned records: Workout Log, Progress Entry, Class Booking, Check In,
# Member Program
# ---------------------------------------------------------------------------


def member_record_query(user: str | None = None, doctype: str | None = None) -> str:
	user = _user(user)
	if is_staff(user) or not doctype:
		return ""
	member = get_member_for_user(user)
	if not member:
		return "1=0"
	return f"`tab{doctype}`.`member` = {frappe.db.escape(member)}"


def has_member_record_permission(doc, ptype=None, user=None, debug=False):
	user = _user(user)
	if is_staff(user):
		return None
	member = get_member_for_user(user)
	if not member or doc.get("member") != member:
		return False
	return None


# Wrappers with the doctype bound, since older Frappe versions call
# permission_query_conditions with `user` only.
def workout_log_query(user=None, doctype=None):
	return member_record_query(user, "Workout Log")


def progress_entry_query(user=None, doctype=None):
	return member_record_query(user, "Progress Entry")


def class_booking_query(user=None, doctype=None):
	return member_record_query(user, "Class Booking")


def check_in_query(user=None, doctype=None):
	return member_record_query(user, "Check In")


def member_program_query(user=None, doctype=None):
	return member_record_query(user, "Member Program")


# ---------------------------------------------------------------------------
# Member profile: athletes may read only their own Member record. Profile
# changes go through the PWA API, which whitelists editable fields.
# ---------------------------------------------------------------------------


def member_query(user=None, doctype=None):
	user = _user(user)
	if is_staff(user):
		return ""
	return f"`tabMember`.`user` = {frappe.db.escape(user)}"


def has_member_permission(doc, ptype=None, user=None, debug=False):
	user = _user(user)
	if is_staff(user):
		return None
	if doc.get("user") != user or ptype not in ("read", "print"):
		return False
	return None


# ---------------------------------------------------------------------------
# Programs & workouts: athletes see published programs and the ones they are
# enrolled in (unless a paid enrollment is still pending).
# ---------------------------------------------------------------------------


def _enrolled_programs_sql(member: str) -> str:
	return (
		"select `program` from `tabMember Program` "
		f"where `member` = {frappe.db.escape(member)} and ifnull(`payment_status`, '') != 'Pending'"
	)


def training_program_query(user=None, doctype=None):
	user = _user(user)
	if is_staff(user):
		return ""
	member = get_member_for_user(user)
	cond = "`tabTraining Program`.`is_published` = 1"
	if member:
		cond = f"({cond} or `tabTraining Program`.`name` in ({_enrolled_programs_sql(member)}))"
	return cond


def workout_query(user=None, doctype=None):
	user = _user(user)
	if is_staff(user):
		return ""
	member = get_member_for_user(user)
	published = "select `name` from `tabTraining Program` where `is_published` = 1"
	cond = f"`tabWorkout`.`program` in ({published})"
	if member:
		cond = f"({cond} or `tabWorkout`.`program` in ({_enrolled_programs_sql(member)}))"
	return cond


def has_training_program_permission(doc, ptype=None, user=None, debug=False):
	user = _user(user)
	if is_staff(user):
		return None
	if doc.name not in viewable_program_ids(get_member_for_user(user)):
		return False
	return None


def has_workout_permission(doc, ptype=None, user=None, debug=False):
	user = _user(user)
	if is_staff(user):
		return None
	if doc.get("program") not in viewable_program_ids(get_member_for_user(user)):
		return False
	return None
