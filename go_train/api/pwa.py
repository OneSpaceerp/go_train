# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""
Whitelisted endpoints consumed by the /gotrain athlete & coach PWA.
All endpoints run as the signed-in Frappe User and scope data to the
linked Member or Coach record. Writes use ignore_permissions only after
the explicit ownership / role checks in this module.
"""

import html
import json
import os
import re
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.utils import (
	add_days,
	add_months,
	cint,
	flt,
	get_datetime,
	get_first_day,
	get_last_day,
	getdate,
	now_datetime,
	today,
)
from werkzeug.wrappers import Response

from go_train import __version__
from go_train.permissions import (
	STAFF_ROLES,
	accessible_program_ids,
	get_coach_for_user,
	get_member_for_user,
	is_manager,
	is_staff,
	viewable_program_ids,
)

LOG_STATUSES = ("Done", "Missed", "Partial")
MAX_SET_ROWS = 100


# ---------------------------------------------------------------------------
# App permission & Service Worker
# ---------------------------------------------------------------------------


def check_app_permission():
	"""Check if the signed-in user has access to the Go Train Desk tile on /apps."""
	if frappe.session.user == "Administrator":
		return True
	if is_staff():
		return True
	user_type = frappe.db.get_value("User", frappe.session.user, "user_type")
	return user_type == "System User"


@frappe.whitelist(allow_guest=True)
def sw():
	"""Serve the PWA service worker with Service-Worker-Allowed: /gotrain.

	The build inlines the Workbox runtime and prefixes every precache URL with
	/assets/go_train/frontend/ (see frontend/vite.config.js), so the file is
	served verbatim from this endpoint.
	"""
	sw_path = os.path.join(frappe.get_app_path("go_train"), "public", "frontend", "sw.js")
	if not os.path.exists(sw_path):
		return Response("// Service worker not built yet", status=404, mimetype="application/javascript")

	with open(sw_path, encoding="utf-8") as f:
		content = f.read()

	return Response(
		content,
		mimetype="application/javascript",
		headers={
			"Service-Worker-Allowed": "/gotrain",
			"Cache-Control": "no-cache, no-store, must-revalidate",
		},
	)


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------


def _current_member(create: bool = True) -> str | None:
	"""Member linked to the signed-in user. Athletes get one created on first
	visit; staff never do, so coaches and managers don't pollute rosters."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please sign in"), frappe.PermissionError)

	member = get_member_for_user(user)
	if member or not create or is_staff(user):
		return member

	u = frappe.db.get_value(
		"User", user, ["full_name", "email", "mobile_no", "user_image"], as_dict=True
	) or frappe._dict()
	if u.email:
		# Adopt a Member that staff created for this person, as long as it isn't
		# already linked to another login.
		unlinked = frappe.db.get_value("Member", {"email": u.email, "user": ["is", "not set"]}, "name")
		if unlinked:
			frappe.db.set_value("Member", unlinked, "user", user)
			# Frappe only commits POST-type requests; keep this even on a GET (e.g. boot)
			frappe.local.flags.commit = True
			return unlinked

	doc = frappe.get_doc(
		{
			"doctype": "Member",
			"full_name": u.full_name or user,
			"email": u.email or user,
			"mobile_no": u.mobile_no,
			"avatar": u.user_image,
			"user": user,
			"status": "Active",
			"join_date": today(),
			"locale": "en",
			"theme": "system",
		}
	).insert(ignore_permissions=True)
	frappe.local.flags.commit = True
	return doc.name


def _require_member() -> str:
	member = _current_member()
	if not member:
		frappe.throw(_("Your account is not linked to a member profile. Ask the front desk to link one."))
	return member


def _require_coach() -> str | None:
	"""Allow coaches with an active Coach record and gym managers. Returns the
	Coach name (None for a manager without a Coach record)."""
	coach = get_coach_for_user()
	if coach or is_manager():
		return coach
	frappe.throw(_("Coach access required"), frappe.PermissionError)


def _client_filters(coach: str | None) -> dict:
	"""Members a coach may manage: their own clients, or everyone for managers."""
	return {} if is_manager() else {"coach": coach}


def _can_access_member(member: str) -> bool:
	if member and member == get_member_for_user():
		return True
	if is_manager():
		return True
	coach = get_coach_for_user()
	return bool(coach) and frappe.db.get_value("Member", member, "coach") == coach


def _assert_program_manageable(program: str):
	if not frappe.db.exists("Training Program", program):
		frappe.throw(_("Program not found"), frappe.DoesNotExistError)
	if is_manager():
		return
	coach = get_coach_for_user()
	if not coach or frappe.db.get_value("Training Program", program, "coach") != coach:
		frappe.throw(_("You can only edit your own programs"), frappe.PermissionError)


def _assert_program_viewable(program: str):
	if not frappe.db.exists("Training Program", program):
		frappe.throw(_("Program not found"), frappe.DoesNotExistError)
	if is_staff():
		return
	if program not in viewable_program_ids(get_member_for_user()):
		frappe.throw(_("You don't have access to this program"), frappe.PermissionError)


def _assert_workout_access(workout: str) -> str:
	"""Members may open workouts in programs they can view, plus any workout
	they have already logged (e.g. after an enrollment ended)."""
	program = frappe.db.get_value("Workout", workout, "program")
	if not program:
		frappe.throw(_("Workout not found"), frappe.DoesNotExistError)
	if is_staff():
		return program
	member = get_member_for_user()
	if program in viewable_program_ids(member):
		return program
	if member and frappe.db.exists("Workout Log", {"member": member, "workout": workout}):
		return program
	frappe.throw(_("You don't have access to this workout"), frappe.PermissionError)


def _staff_users() -> set[str]:
	with_role = frappe.get_all(
		"Has Role",
		filters={"parenttype": "User", "role": ["in", list(STAFF_ROLES)]},
		pluck="parent",
	)
	coaches = frappe.get_all("Coach", filters={"user": ["is", "set"]}, pluck="user")
	return {"Administrator", *with_role, *coaches}


def _without_staff(members: list) -> list:
	"""Drop Member rows that belong to staff logins (created before staff were
	excluded from auto-provisioning)."""
	staff = _staff_users()
	return [m for m in members if not m.get("user") or m.get("user") not in staff]


def _display_name(member: str | None = None) -> str:
	if member:
		name = frappe.db.get_value("Member", member, "full_name")
		if name:
			return name
	return frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user


def _comment_text(content: str | None) -> str:
	"""Plain text for a Comment body stored as (escaped) HTML."""
	return html.unescape(frappe.utils.strip_html_tags(content or "")).strip()


def _like(q: str | None) -> str:
	"""LIKE pattern for a user search term, with wildcards escaped."""
	q = (q or "").strip()
	return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _client_datetime(client_time: str | None = None):
	"""When an offline action is replayed, use the time it happened on the
	device, within a sane window (no future times, at most 7 days old)."""
	now = now_datetime()
	if not client_time:
		return now
	try:
		when = get_datetime(client_time)
	except Exception:
		return now
	if not when or when > now or when < add_days(now, -7):
		return now
	return when


def _group_count(doctype: str, field: str, values, where: str = "", params: dict | None = None) -> dict:
	"""{value: count} for rows of `doctype` grouped by `field` (one query)."""
	values = [v for v in values if v]
	if not values:
		return {}
	rows = frappe.db.sql(
		f"select `{field}`, count(*) from `tab{doctype}` where `{field}` in %(values)s {where} group by `{field}`",
		{"values": tuple(values), **(params or {})},
	)
	return {r[0]: cint(r[1]) for r in rows}


def _name_map(doctype: str, names, field: str) -> dict:
	names = list({n for n in names if n})
	if not names:
		return {}
	rows = frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", field])
	return {r.name: r.get(field) or r.name for r in rows}


def _get_settings() -> dict:
	defaults = {
		"gym_name": "Go Train Gym",
		"default_currency": "USD",
		"default_weight_unit": "kg",
		"members_can_self_book": 1,
		"members_can_self_checkin": 1,
	}
	try:
		s = frappe.get_cached_doc("Go Train Settings")
	except Exception:
		return defaults
	return {
		"gym_name": getattr(s, "gym_name", None) or defaults["gym_name"],
		"default_currency": getattr(s, "default_currency", None) or defaults["default_currency"],
		"default_weight_unit": getattr(s, "default_weight_unit", None) or defaults["default_weight_unit"],
		"members_can_self_book": cint(getattr(s, "members_can_self_book", 1)),
		"members_can_self_checkin": cint(getattr(s, "members_can_self_checkin", 1)),
	}


# ---------------------------------------------------------------------------
# Boot & Profile
# ---------------------------------------------------------------------------


@frappe.whitelist()
def boot():
	"""Initial payload for the PWA: user, member profile, coach status, and gym settings."""
	user = frappe.session.user
	member_name = _current_member()
	coach_name = get_coach_for_user()

	m = frappe._dict()
	if member_name:
		m = frappe.db.get_value(
			"Member",
			member_name,
			[
				"name",
				"full_name",
				"email",
				"mobile_no",
				"status",
				"coach",
				"locale",
				"theme",
				"avatar",
				"goal",
				"height_cm",
				"weight_kg",
				"join_date",
			],
			as_dict=True,
		)
	u = frappe.db.get_value("User", user, ["full_name", "email", "mobile_no", "user_image"], as_dict=True) or frappe._dict()

	coach_info = None
	if m.get("coach"):
		c = frappe.db.get_value("Coach", m.coach, ["name", "coach_name", "sport", "phone"], as_dict=True)
		if c:
			coach_info = {
				"name": c.name,
				"full_name": c.coach_name,
				"specialty": c.sport or "",
				"phone": c.phone or "",
			}

	# Staff without a Member record keep their PWA preferences as user defaults
	locale = m.get("locale") or frappe.defaults.get_user_default("gotrain_locale", user) or "en"
	theme = m.get("theme") or frappe.defaults.get_user_default("gotrain_theme", user) or "system"

	return {
		"user": user,
		"name": member_name or user,
		"full_name": m.get("full_name") or u.full_name or user,
		"email": m.get("email") or u.email or user,
		"mobile_no": m.get("mobile_no") or u.mobile_no or "",
		"avatar_url": m.get("avatar") or u.user_image or "",
		"status": m.get("status") or "",
		"locale": locale,
		"theme": theme,
		"goal": m.get("goal") or "",
		"height_cm": flt(m.height_cm) if m.get("height_cm") else None,
		"weight_kg": flt(m.weight_kg) if m.get("weight_kg") else None,
		"coach": coach_info,
		"coach_profile": coach_name,
		"is_coach": bool(coach_name) or is_manager(),
		"has_member_profile": bool(member_name),
		"role": "coach" if coach_name else "client",
		"member": m or None,
		"settings": _get_settings(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"version": __version__,
	}


@frappe.whitelist(methods=["POST"])
def update_profile(
	locale=None,
	theme=None,
	goal=None,
	height_cm=None,
	weight_kg=None,
	full_name=None,
	mobile_no=None,
):
	"""Update the signed-in member's preferences and physical profile."""
	member_name = _current_member()
	updates = {}
	if locale in ("en", "ar"):
		updates["locale"] = locale
	if theme in ("system", "light", "dark"):
		updates["theme"] = theme

	if not member_name:
		for key, value in updates.items():
			frappe.defaults.set_user_default(f"gotrain_{key}", value, frappe.session.user)
		return boot()

	if goal is not None:
		updates["goal"] = str(goal).strip()[:1000]
	if height_cm is not None:
		updates["height_cm"] = flt(height_cm) if str(height_cm).strip() != "" else 0
	if weight_kg is not None:
		updates["weight_kg"] = flt(weight_kg) if str(weight_kg).strip() != "" else 0
	if full_name and str(full_name).strip():
		updates["full_name"] = str(full_name).strip()[:140]
	if mobile_no is not None:
		updates["mobile_no"] = str(mobile_no).strip()[:40]

	if updates:
		frappe.db.set_value("Member", member_name, updates)

	return boot()


# ---------------------------------------------------------------------------
# Calendar, Programs & Workouts
# ---------------------------------------------------------------------------


def _month_window(month: str | None):
	"""(start, end) dates for a 'YYYY-MM' month padded by a week on each side;
	without a month, the previous, current and next months."""
	anchor = None
	if month:
		try:
			anchor = getdate(f"{month}-01")
		except Exception:
			anchor = None
	if anchor:
		return add_days(get_first_day(anchor), -7), add_days(get_last_day(anchor), 7)
	now = getdate(today())
	return get_first_day(add_months(now, -1)), get_last_day(add_months(now, 1))


def _latest_logs(member: str | None, workout_names: list[str], fields: list[str]) -> dict:
	if not member or not workout_names:
		return {}
	logs = frappe.get_all(
		"Workout Log",
		filters={"member": member, "workout": ["in", workout_names]},
		fields=["workout", *fields],
		order_by="log_date desc, creation desc",
	)
	latest = {}
	for log in logs:
		latest.setdefault(log.workout, log)
	return latest


def _window_workouts(member: str | None, month: str | None, fields: list[str]) -> list:
	program_ids = accessible_program_ids(member)
	if not program_ids:
		return []
	start, end = _month_window(month)
	return frappe.get_all(
		"Workout",
		filters={"program": ["in", program_ids], "scheduled_date": ["between", [start, end]]},
		fields=fields,
		order_by="scheduled_date asc, day_index asc",
		limit=500,
	)


@frappe.whitelist()
def get_calendar(month: str | None = None):
	"""Scheduled workouts in the requested month (padded) with the member's log status."""
	member = _current_member()
	workouts = _window_workouts(member, month, ["name", "title", "letter", "scheduled_date", "program"])
	logs = _latest_logs(member, [w.name for w in workouts], ["status"])

	events = []
	for w in workouts:
		log = logs.get(w.name)
		status = (log.status or "").lower() if log else "upcoming"
		if status not in ("done", "missed"):
			status = "upcoming"
		events.append(
			{
				"id": w.name,
				"title": w.title,
				"letter": w.letter,
				"program": w.program,
				"scheduled_on": str(w.scheduled_date),
				"status": status,
			}
		)
	return events


LOG_FIELDS = [
	"name",
	"status",
	"result",
	"details",
	"rpe",
	"duration_seconds",
	"attachment",
	"attachment_name",
	"log_date",
]


@frappe.whitelist()
def get_feed(month: str | None = None):
	"""Workouts across the member's programs for a month window, with program
	names and the member's latest log. Replaces one request per program."""
	member = _current_member()
	workouts = _window_workouts(
		member,
		month,
		["name", "title", "letter", "scheduled_date", "day_index", "summary", "body", "program"],
	)
	logs = _latest_logs(member, [w.name for w in workouts], LOG_FIELDS)
	program_names = _name_map("Training Program", [w.program for w in workouts], "program_name")
	for w in workouts:
		log = logs.get(w.name)
		if log:
			log["attachment_url"] = log.get("attachment")
		w["my_log"] = log
		w["program_name"] = program_names.get(w.program, w.program)
	return workouts


def _program_rows(program_names: list[str], member: str | None) -> list:
	if not program_names:
		return []
	programs = frappe.get_all(
		"Training Program",
		filters={"name": ["in", program_names]},
		fields=[
			"name",
			"program_name",
			"sport",
			"coach",
			"kind",
			"summary",
			"description",
			"price",
			"currency",
			"is_published",
		],
	)
	enrollments = {}
	if member:
		for e in frappe.get_all(
			"Member Program",
			filters={"member": member, "program": ["in", program_names]},
			fields=["program", "is_active", "payment_status"],
		):
			enrollments[e.program] = e

	workout_counts = _group_count("Workout", "program", program_names)
	client_counts = _group_count("Member Program", "program", program_names, "and is_active = 1")
	done_counts = (
		_group_count("Workout Log", "program", program_names, "and member = %(member)s and status = 'Done'", {"member": member})
		if member
		else {}
	)
	coach_names = _name_map("Coach", [p.coach for p in programs], "coach_name")

	for p in programs:
		e = enrollments.get(p.name)
		if e and e.payment_status == "Pending":
			status = "Pending"
		elif e:
			status = "Active" if cint(e.is_active) else "Ended"
		else:
			status = "Available"
		p["status"] = status
		p["is_enrolled"] = bool(e)
		p["is_active"] = status in ("Active", "Available")
		p["workout_count"] = workout_counts.get(p.name, 0)
		p["done_count"] = done_counts.get(p.name, 0)
		p["client_count"] = client_counts.get(p.name, 0)
		if p.coach:
			p["coach_name"] = coach_names.get(p.coach, p.coach)

	programs.sort(
		key=lambda x: (
			1 if x["workout_count"] > 0 else 0,
			1 if x["status"] == "Active" else 0,
			x["workout_count"],
		),
		reverse=True,
	)
	return programs


@frappe.whitelist()
def get_programs():
	"""Programs the member is enrolled in plus published programs, populated programs first."""
	member = _current_member()
	enrolled = frappe.get_all("Member Program", filters={"member": member}, pluck="program") if member else []
	published = frappe.get_all("Training Program", filters={"is_published": 1}, pluck="name")
	return _program_rows(list(dict.fromkeys([*enrolled, *published])), member)


@frappe.whitelist()
def get_program_workouts(program: str):
	"""Workouts in a program with the current member's latest log status attached."""
	_assert_program_viewable(program)
	member = _current_member()
	workouts = frappe.get_all(
		"Workout",
		filters={"program": program},
		fields=["name", "title", "letter", "scheduled_date", "day_index", "summary", "body"],
		order_by="scheduled_date desc, day_index asc",
	)
	logs = _latest_logs(member, [w.name for w in workouts], LOG_FIELDS)
	for w in workouts:
		log = logs.get(w.name)
		if log:
			log["attachment_url"] = log.get("attachment")
		w["my_log"] = log
	return workouts


def _comment_rows(raw_comments: list) -> list:
	staff = _staff_users()
	return [
		{
			"id": c.name,
			"body": _comment_text(c.content),
			"author": c.comment_by or c.comment_email or "Athlete",
			"author_role": "coach" if c.comment_email in staff else "member",
			"created_at": str(c.creation),
		}
		for c in raw_comments
	]


@frappe.whitelist()
def get_workout(workout: str):
	"""Full workout detail: prescribed text, exercise rows, member's logs (latest
	with its set rows), and comments."""
	_assert_workout_access(workout)
	member = _current_member()
	doc = frappe.get_doc("Workout", workout)

	my_logs = []
	if member:
		my_logs = frappe.get_all(
			"Workout Log",
			filters={"member": member, "workout": workout},
			fields=LOG_FIELDS,
			order_by="log_date desc, creation desc",
		)
	for log in my_logs:
		log["attachment_url"] = log.get("attachment")
	if my_logs:
		latest = my_logs[0].name
		my_logs[0]["set_logs"] = frappe.get_all(
			"Workout Set Log",
			filters={"parent": latest, "parenttype": "Workout Log", "parentfield": "set_logs"},
			fields=["exercise", "set_no", "weight", "reps", "completed", "note"],
			order_by="idx asc",
		)
		my_logs[0]["movement_media"] = frappe.get_all(
			"Workout Movement Media",
			filters={"parent": latest, "parenttype": "Workout Log", "parentfield": "movement_media"},
			fields=["exercise", "media", "video_url", "note"],
			order_by="idx asc",
		)

	# The movement library's own demo links, shown when the coach set none
	library_videos = {
		r.name: r.video_url
		for r in frappe.get_all(
			"Exercise",
			filters={"name": ["in", [r.exercise for r in doc.exercises or [] if r.exercise] or [""]]},
			fields=["name", "video_url"],
		)
		if r.video_url
	}

	raw_comments = frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Workout", "reference_name": workout, "comment_type": "Comment"},
		fields=["name", "content", "comment_by", "comment_email", "creation"],
		order_by="creation asc",
		limit=50,
	)

	return {
		"name": doc.name,
		"title": doc.title,
		"letter": doc.letter,
		"program": doc.program,
		"scheduled_date": doc.scheduled_date,
		"body": doc.body,
		"summary": doc.get("summary"),
		"exercises": [
			{
				"row": r.name,
				"exercise": r.exercise,
				"label": r.get("label"),
				"sets": r.sets,
				"reps": r.reps,
				"weight": r.get("target_load"),
				"rest": r.get("rest"),
				"tempo": r.get("tempo"),
				"notes": r.notes,
				"media": r.get("media"),
				"video_url": r.get("video_url"),
				"library_video_url": library_videos.get(r.exercise),
			}
			for r in (doc.exercises or [])
		],
		"can_edit": _can_manage_program(doc.program),
		"my_log": my_logs[0] if my_logs else None,
		"logs": my_logs,
		"comments": _comment_rows(raw_comments),
	}


def _parse_set_logs(set_logs) -> list | None:
	"""Sanitize set rows from the client. None means "leave existing rows"."""
	if set_logs is None:
		return None
	if isinstance(set_logs, str):
		try:
			set_logs = json.loads(set_logs) if set_logs.strip() else []
		except Exception:
			return None
	if not isinstance(set_logs, list):
		return None

	rows = [s for s in set_logs[:MAX_SET_ROWS] if isinstance(s, dict)]
	names = {s.get("exercise") for s in rows if s.get("exercise")}
	valid = set(frappe.get_all("Exercise", filters={"name": ["in", list(names)]}, pluck="name")) if names else set()
	return [
		{
			"exercise": s.get("exercise") if s.get("exercise") in valid else None,
			"set_no": cint(s.get("set_no")) or i + 1,
			"weight": flt(s.get("weight")),
			"reps": cint(s.get("reps")),
			"completed": 1 if cint(s.get("completed")) else 0,
			"note": str(s.get("note") or "")[:140],
		}
		for i, s in enumerate(rows)
	]


def _claim_file(file_url: str, doctype: str, name: str, field: str | None):
	"""Only allow files the user uploaded, and attach them to the document so
	everyone who can read it (the coach for a log, athletes for a workout) can
	open the private file."""
	file_name = frappe.db.get_value("File", {"file_url": file_url, "owner": frappe.session.user}, "name")
	if not file_name:
		frappe.throw(_("Attachment not found. Please upload it again."))
	frappe.db.set_value(
		"File",
		file_name,
		{"attached_to_doctype": doctype, "attached_to_name": name, "attached_to_field": field},
	)


def _claim_attachment(file_url: str, log_name: str):
	_claim_file(file_url, "Workout Log", log_name, "attachment")


def _clean_video_url(url) -> str | None:
	"""A web link to a video (YouTube or any http/https page), or None."""
	url = str(url or "").strip()
	if not url:
		return None
	invalid = _("Please enter a valid video link (e.g. a YouTube URL).")
	# Any other scheme (javascript:, data:, mailto:…) is rejected outright;
	# a bare "youtu.be/…" gets https:// added.
	if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url) and not re.match(r"^https?://", url, re.IGNORECASE):
		frappe.throw(invalid)
	parsed = urlparse(url if "://" in url else f"https://{url}")
	try:
		parsed.port  # raises on an invalid port
	except ValueError:
		frappe.throw(invalid)
	if parsed.scheme not in ("http", "https") or "." not in (parsed.hostname or "") or len(url) > 500:
		frappe.throw(invalid)
	return parsed.geturl()


def _parse_movement_media(items) -> list | None:
	"""Sanitize per-movement media from the client. None means "leave as is"."""
	if items is None:
		return None
	if isinstance(items, str):
		try:
			items = json.loads(items) if items.strip() else []
		except Exception:
			return None
	if not isinstance(items, list):
		return None
	items = [i for i in items[:MAX_SET_ROWS] if isinstance(i, dict)]
	names = {i.get("exercise") for i in items if i.get("exercise")}
	valid = set(frappe.get_all("Exercise", filters={"name": ["in", list(names)]}, pluck="name")) if names else set()
	rows = []
	for i in items:
		media = str(i.get("media") or "").strip() or None
		video_url = _clean_video_url(i.get("video_url"))
		if i.get("exercise") in valid and (media or video_url):
			rows.append(
				{
					"exercise": i.get("exercise"),
					"media": media,
					"video_url": video_url,
					"note": str(i.get("note") or "")[:500],
				}
			)
	return rows


def _sync_prs(log, member: str):
	"""Record a Progress Entry only when a completed set beats the member's
	previous best for that exercise. Entries are tied to the log, so re-saving
	a log replaces its PRs instead of duplicating them."""
	frappe.db.delete("Progress Entry", {"workout_log": log.name})

	best = {}
	for s in log.set_logs or []:
		if s.exercise and cint(s.completed) and flt(s.weight) > 0:
			best[s.exercise] = max(best.get(s.exercise, 0), flt(s.weight))
	if not best:
		return

	unit = _get_settings()["default_weight_unit"]
	previous = dict(
		frappe.db.sql(
			"""select metric, max(value) from `tabProgress Entry`
			where member = %(member)s and unit = %(unit)s and metric in %(metrics)s
			group by metric""",
			{"member": member, "unit": unit, "metrics": tuple(best)},
		)
	)
	for exercise, weight in best.items():
		if exercise in previous and weight <= flt(previous[exercise]):
			continue
		frappe.get_doc(
			{
				"doctype": "Progress Entry",
				"member": member,
				"recorded_on": log.log_date,
				"metric": exercise,
				"value": weight,
				"unit": unit,
				"workout_log": log.name,
				"notes": _("PR set in workout {0}").format(log.workout),
			}
		).insert(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def log_workout(
	workout: str,
	status: str = "Done",
	result: str | None = None,
	details: str | None = None,
	rpe: int | None = None,
	duration: int | None = None,
	attachment: str | None = None,
	attachment_name: str | None = None,
	set_logs: list | str | None = None,
	movement_media: list | str | None = None,
	client_time: str | None = None,
	client_op_id: str | None = None,
):
	"""Record or update a member's result for a workout (one log per day),
	including form-check photos/videos or links per movement."""
	member = _require_member()
	_assert_workout_access(workout)

	status = (status or "Done").strip().title()
	if status not in LOG_STATUSES:
		frappe.throw(_("Invalid workout status"))
	rpe = cint(rpe) or None
	if rpe and not 1 <= rpe <= 10:
		frappe.throw(_("RPE must be between 1 and 10"))

	log_date = getdate(_client_datetime(client_time))
	rows = _parse_set_logs(set_logs)
	media_rows = _parse_movement_media(movement_media)

	existing_name = frappe.db.get_value(
		"Workout Log", {"member": member, "workout": workout, "log_date": log_date}, "name"
	)
	if existing_name:
		doc = frappe.get_doc("Workout Log", existing_name)
	else:
		doc = frappe.new_doc("Workout Log")
		doc.update({"member": member, "workout": workout, "log_date": log_date})

	new_attachment = attachment and attachment != doc.attachment
	doc.update(
		{
			"status": status,
			"result": result,
			"details": details,
			"rpe": rpe,
			"duration_seconds": cint(duration) if duration is not None else None,
		}
	)
	if attachment is not None:
		doc.attachment = attachment or None
		doc.attachment_name = attachment_name if attachment else None
	if rows is not None:
		doc.set("set_logs", rows)
	new_media = []
	if media_rows is not None:
		known = {r.media for r in doc.get("movement_media") or [] if r.media}
		new_media = [r["media"] for r in media_rows if r["media"] and r["media"] not in known]
		doc.set("movement_media", media_rows)

	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)

	if new_attachment:
		_claim_attachment(attachment, doc.name)
	for file_url in new_media:
		_claim_file(file_url, "Workout Log", doc.name, "movement_media")
	_sync_prs(doc, member)

	return {
		"name": doc.name,
		"status": doc.status,
		"log_date": str(doc.log_date),
		"duration_seconds": doc.duration_seconds,
		"attachment_url": doc.attachment,
		"attachment_name": doc.attachment_name,
	}


@frappe.whitelist(methods=["POST"])
def add_workout_comment(workout: str, body: str):
	"""Add a comment on a Workout (visible in both the PWA and ERPNext Desk)."""
	body = (body or "").strip()
	if not body:
		frappe.throw(_("Comment cannot be empty"))
	_assert_workout_access(workout)
	full_name = _display_name(_current_member())

	c = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Comment",
			"reference_doctype": "Workout",
			"reference_name": workout,
			"comment_email": frappe.session.user,
			"comment_by": full_name,
			"content": frappe.utils.escape_html(body),
		}
	).insert(ignore_permissions=True)

	return {
		"id": c.name,
		"body": body,
		"author": full_name,
		"author_role": "coach" if is_staff() else "member",
		"created_at": str(c.creation),
	}


# ---------------------------------------------------------------------------
# History, Insights & Progress Tracking
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_history(q: str | None = None):
	"""Notes-style search across workouts, prescribed text, and the member's logged results."""
	member = _current_member()
	if not member:
		return []
	return frappe.db.sql(
		"""
		select
			w.name, w.title, w.body, w.scheduled_date,
			tp.program_name as program,
			wl.name as log_id, wl.log_date, wl.status, wl.result, wl.details, wl.rpe
		from `tabWorkout Log` wl
		join `tabWorkout` w on w.name = wl.workout
		left join `tabTraining Program` tp on tp.name = w.program
		where wl.member = %(member)s
		  and (%(q)s = '' or w.title like %(like)s or w.body like %(like)s
		       or wl.result like %(like)s or wl.details like %(like)s
		       or tp.program_name like %(like)s)
		order by wl.log_date desc, wl.creation desc
		limit 100
		""",
		{"member": member, "q": (q or "").strip(), "like": _like(q)},
		as_dict=True,
	)


@frappe.whitelist()
def get_insights():
	"""Completion ring + counts for the Track tab."""
	member = _current_member()
	if not member:
		return {"done": 0, "missed": 0, "logged": 0, "completion": 0}
	done = frappe.db.count("Workout Log", {"member": member, "status": "Done"})
	missed = frappe.db.count("Workout Log", {"member": member, "status": "Missed"})
	distinct_days = frappe.db.sql(
		"select count(distinct log_date) from `tabWorkout Log` where member = %s",
		(member,),
	)
	total = done + missed
	return {
		"done": done,
		"missed": missed,
		"logged": cint(distinct_days[0][0]) if distinct_days else 0,
		"completion": round((done / total) * 100) if total else 0,
	}


@frappe.whitelist()
def get_tracking():
	"""Progress Entry time series grouped by metric for the Track tab."""
	member = _current_member()
	if not member:
		return []
	rows = frappe.get_all(
		"Progress Entry",
		filters={"member": member},
		fields=["name", "metric", "value", "unit", "recorded_on", "notes"],
		order_by="recorded_on asc, creation asc",
	)
	grouped: dict[str, dict] = {}
	for r in rows:
		g = grouped.setdefault(r.metric, {"metric": r.metric, "unit": r.unit or "kg", "points": []})
		g["points"].append(
			{
				"id": r.name,
				"date": str(r.recorded_on),
				"value": flt(r.value),
				"notes": r.notes or "",
			}
		)
	return list(grouped.values())


@frappe.whitelist(methods=["POST"])
def add_progress_entry(
	metric: str,
	value: float,
	unit: str = "kg",
	recorded_date: str | None = None,
	notes: str | None = None,
	client_time: str | None = None,
	client_op_id: str | None = None,
):
	"""Allow an athlete to record a new PR or body metric from the Track tab."""
	member = _require_member()
	metric_clean = (metric or "").strip()[:140]
	if not metric_clean:
		frappe.throw(_("Metric name is required"))

	op_id = (client_op_id or "").strip()[:64] or None
	if op_id:
		existing = frappe.db.get_value(
			"Progress Entry",
			{"member": member, "client_op_id": op_id},
			["name", "metric", "value", "unit", "recorded_on"],
			as_dict=True,
		)
		if existing:
			return {
				"id": existing.name,
				"metric": existing.metric,
				"value": flt(existing.value),
				"unit": existing.unit,
				"date": str(existing.recorded_on),
			}

	recorded_on = getdate(_client_datetime(client_time))
	if recorded_date:
		try:
			recorded_on = min(getdate(recorded_date), getdate(today()))
		except Exception:
			pass
	unit_clean = (unit or "kg").strip()[:20] or "kg"

	doc = frappe.get_doc(
		{
			"doctype": "Progress Entry",
			"member": member,
			"recorded_on": recorded_on,
			"metric": metric_clean,
			"value": flt(value),
			"unit": unit_clean,
			"notes": notes,
			"client_op_id": op_id,
		}
	).insert(ignore_permissions=True)

	# Keep Member.weight_kg in sync when logging Bodyweight
	if metric_clean.lower() in ("bodyweight", "body weight", "weight") and unit_clean.lower() == "kg":
		frappe.db.set_value("Member", member, "weight_kg", flt(value))

	return {
		"id": doc.name,
		"metric": doc.metric,
		"value": flt(doc.value),
		"unit": doc.unit,
		"date": str(doc.recorded_on),
	}


# ---------------------------------------------------------------------------
# Exercise Library
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_exercises(q: str | None = None, sport: str | None = None, category: str | None = None):
	"""Search the Exercise movement catalog."""
	filters = {}
	if sport:
		filters["sport"] = sport
	if category:
		filters["category"] = category

	or_filters = None
	if q and q.strip():
		term = _like(q)
		or_filters = [
			["Exercise", field, "like", term]
			for field in ("exercise_name", "category", "sport", "primary_muscle", "equipment")
		]

	rows = frappe.get_all(
		"Exercise",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"exercise_name",
			"category",
			"sport",
			"primary_muscle",
			"equipment",
			"video_url",
			"description",
		],
		order_by="exercise_name asc",
		limit=100,
	)
	return [
		{
			"id": r.name,
			"name": r.exercise_name,
			"category": r.category or "Strength",
			"sport": r.sport or "",
			"primary_muscle": r.primary_muscle or "",
			"equipment": r.equipment or "",
			"video_url": r.video_url or "",
			"description": frappe.utils.strip_html_tags(r.description or ""),
		}
		for r in rows
	]


# ---------------------------------------------------------------------------
# Classes, Bookings & Check-in
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_classes():
	"""Upcoming class sessions with booking count, coach info, and the member's booking status."""
	member = _current_member()
	settings = _get_settings()
	sessions = frappe.get_all(
		"Class Session",
		filters={"status": "Scheduled", "start_time": [">=", f"{today()} 00:00:00"]},
		fields=["name", "class_type", "coach", "facility", "start_time", "end_time", "capacity"],
		order_by="start_time asc",
		limit=50,
	)
	names = [s.name for s in sessions]
	booked = _group_count("Class Booking", "session", names, "and status in ('Booked', 'Attended')")
	mine = {}
	if member and names:
		for b in frappe.get_all(
			"Class Booking",
			filters={"session": ["in", names], "member": member, "status": ["!=", "Cancelled"]},
			fields=["name", "status", "session"],
		):
			mine[b.session] = {"name": b.name, "status": b.status}
	coach_names = _name_map("Coach", [s.coach for s in sessions], "coach_name")

	for s in sessions:
		start_str = str(s.start_time or "")
		end_str = str(s.end_time or "")
		s["id"] = s.name
		s["title"] = s.class_type or s.name
		s["session_date"] = start_str[:10] if len(start_str) >= 10 else today()
		s["start_time"] = start_str[11:16] if len(start_str) >= 16 else start_str
		s["end_time"] = end_str[11:16] if len(end_str) >= 16 else end_str
		s["room"] = s.facility or ""
		s["booked_count"] = booked.get(s.name, 0)
		s["spots_left"] = max(0, cint(s.capacity) - s["booked_count"]) if cint(s.capacity) else 99
		s["my_booking"] = mine.get(s.name)
		if s.coach:
			s["coach_name"] = coach_names.get(s.coach, s.coach)
		s["color"] = "#FED14F"

	checked_in_today = bool(
		member
		and frappe.db.exists(
			"Check In", {"member": member, "check_in_time": [">=", f"{today()} 00:00:00"]}
		)
	)
	return {
		"sessions": sessions,
		"checked_in_today": checked_in_today,
		"can_self_book": bool(settings["members_can_self_book"]),
		"can_self_checkin": bool(settings["members_can_self_checkin"]),
	}


@frappe.whitelist(methods=["POST"])
def book_class(session: str):
	"""Book the current member into a class session (capacity enforced by Class Booking)."""
	if not _get_settings()["members_can_self_book"] and not is_staff():
		frappe.throw(_("Self-booking is currently disabled by your gym."))
	member = _require_member()

	s = frappe.db.get_value("Class Session", session, ["status", "start_time"], as_dict=True)
	if not s:
		frappe.throw(_("Class not found"), frappe.DoesNotExistError)
	if s.status != "Scheduled" or get_datetime(s.start_time) < now_datetime():
		frappe.throw(_("This class is no longer open for booking."))

	existing = frappe.db.get_value(
		"Class Booking", {"session": session, "member": member}, ["name", "status"], as_dict=True
	)
	if existing:
		if existing.status == "Cancelled":
			doc = frappe.get_doc("Class Booking", existing.name)
			doc.status = "Booked"
			doc.booked_on = now_datetime()
			doc.save(ignore_permissions=True)
			return {"booking": doc.name, "status": doc.status}
		return {"booking": existing.name, "status": existing.status}

	doc = frappe.get_doc(
		{
			"doctype": "Class Booking",
			"session": session,
			"member": member,
			"status": "Booked",
			"booked_on": now_datetime(),
		}
	).insert(ignore_permissions=True)
	return {"booking": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def cancel_booking(booking: str | None = None, session: str | None = None):
	"""Cancel a member's class booking by booking ID or session ID."""
	member = _current_member()
	if not booking and session and member:
		booking = frappe.db.get_value(
			"Class Booking", {"session": session, "member": member, "status": "Booked"}, "name"
		)
	if not booking:
		frappe.throw(_("Booking not found"))

	owner = frappe.db.get_value("Class Booking", booking, "member")
	if not owner or (owner != member and not is_staff()):
		frappe.throw(_("Not your booking"), frappe.PermissionError)
	frappe.db.set_value("Class Booking", booking, "status", "Cancelled")
	return {"booking": booking, "status": "Cancelled"}


@frappe.whitelist(methods=["POST"])
def check_in(session: str | None = None, facility: str | None = None, client_time: str | None = None, client_op_id: str | None = None):
	"""Self check-in from the PWA. Idempotent per day (and per session)."""
	settings = _get_settings()
	if not settings["members_can_self_checkin"] and not is_staff():
		frappe.throw(_("Self check-in is currently disabled by your gym."))
	member = _require_member()

	when = _client_datetime(client_time)
	day = getdate(when)
	filters = {"member": member, "check_in_time": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]]}
	if session:
		filters["session"] = session
	existing = frappe.db.get_value("Check In", filters, ["name", "check_in_time"], as_dict=True)
	if existing:
		return {"check_in": existing.name, "check_in_time": str(existing.check_in_time), "already": True}

	doc = frappe.get_doc(
		{
			"doctype": "Check In",
			"member": member,
			"session": session,
			"facility": (facility or settings["gym_name"] or "Main Floor")[:140],
			"check_in_time": when,
			"method": "App",
		}
	).insert(ignore_permissions=True)
	return {"check_in": doc.name, "check_in_time": str(doc.check_in_time)}


# ---------------------------------------------------------------------------
# Messages & Threads (Coach <-> Member Direct Messaging)
# ---------------------------------------------------------------------------


def _last_member_comments(member_names: list[str]) -> dict:
	if not member_names:
		return {}
	rows = frappe.db.sql(
		"""
		select c.reference_name, c.content, c.creation
		from `tabComment` c
		join (
			select reference_name, max(creation) as last_creation
			from `tabComment`
			where reference_doctype = 'Member' and comment_type = 'Comment'
			  and reference_name in %(names)s
			group by reference_name
		) latest on latest.reference_name = c.reference_name and latest.last_creation = c.creation
		where c.reference_doctype = 'Member' and c.comment_type = 'Comment'
		""",
		{"names": tuple(member_names)},
		as_dict=True,
	)
	return {r.reference_name: r for r in rows}


MAX_MESSAGE_FILES = 5


def _assert_thread_access(thread: str):
	if not _can_access_member(thread):
		frappe.throw(_("Not authorized to view this conversation"), frappe.PermissionError)


@frappe.whitelist()
def get_threads():
	"""Direct message threads: a coach sees their clients, an athlete sees their coach."""
	coach = get_coach_for_user()
	if coach or is_manager():
		clients = frappe.get_all(
			"Member",
			filters={"status": ["in", ["Active", "Paused"]], **_client_filters(coach)},
			fields=["name", "full_name", "avatar", "user"],
			order_by="modified desc",
			limit=50,
		)
		clients = _without_staff(clients)
		last = _last_member_comments([c.name for c in clients])
		threads = []
		for c in clients:
			msg = last.get(c.name)
			threads.append(
				{
					"id": c.name,
					"other_name": c.full_name,
					"avatar_url": c.avatar or "",
					"last_message": _comment_text(msg.content)
					if msg
					else _("Tap to message athlete"),
					"last_at": str(msg.creation) if msg else None,
				}
			)
		threads.sort(key=lambda t: t["last_at"] or "", reverse=True)
		return threads

	member = _current_member()
	if not member:
		return []
	assigned_coach = frappe.db.get_value("Member", member, "coach")
	coach_name = _("Head Coach")
	if assigned_coach:
		coach_name = frappe.db.get_value("Coach", assigned_coach, "coach_name") or coach_name

	msg = _last_member_comments([member]).get(member)
	return [
		{
			"id": member,
			"other_name": coach_name,
			"avatar_url": "",
			"last_message": _comment_text(msg.content)
			if msg
			else _("Ask your coach about programming, weights, or recovery."),
			"last_at": str(msg.creation) if msg else None,
		}
	]


@frappe.whitelist()
def get_thread_messages(thread: str):
	"""Return messages in a Member<->Coach thread."""
	_assert_thread_access(thread)
	rows = frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Member", "reference_name": thread, "comment_type": "Comment"},
		fields=["name", "content", "comment_email", "comment_by", "creation"],
		order_by="creation asc",
		limit=100,
	)
	return [
		{
			"id": r.name,
			"body": _comment_text(r.content),
			"author": r.comment_by or r.comment_email,
			"mine": r.comment_email == frappe.session.user,
			"created_at": str(r.creation),
		}
		for r in rows
	]


@frappe.whitelist(methods=["POST"])
def send_thread_message(thread: str, body: str = "", files=None):
	"""Send a message in a Member<->Coach thread. `files` are URLs of photos or
	videos the sender just uploaded (e.g. shared from another app); they are
	attached to the thread's Member so both sides can open them, and listed on
	their own lines after the text."""
	_assert_thread_access(thread)
	files = frappe.parse_json(files) if isinstance(files, str) else files or []
	if not isinstance(files, list) or len(files) > MAX_MESSAGE_FILES:
		frappe.throw(_("You can send up to {0} files at a time").format(MAX_MESSAGE_FILES))
	for file_url in files:
		_claim_file(file_url, "Member", thread, None)
	body = "\n".join(part for part in [(body or "").strip(), *files] if part)
	if not body:
		frappe.throw(_("Message cannot be empty"))

	full_name = _display_name(get_member_for_user())
	doc = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Comment",
			"reference_doctype": "Member",
			"reference_name": thread,
			"comment_email": frappe.session.user,
			"comment_by": full_name,
			"content": frappe.utils.escape_html(body),
		}
	).insert(ignore_permissions=True)

	return {
		"id": doc.name,
		"body": body,
		"author": full_name,
		"mine": True,
		"created_at": str(doc.creation),
	}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_notifications():
	"""Combine Frappe Notification Log with live training & class alerts."""
	member = _current_member()
	items = []

	if frappe.db.exists("DocType", "Notification Log"):
		for n in frappe.get_all(
			"Notification Log",
			filters={"for_user": frappe.session.user},
			fields=["name", "subject", "email_content", "read", "creation"],
			order_by="creation desc",
			limit=20,
		):
			items.append(
				{
					"id": n.name,
					"kind": "system",
					"title": frappe.utils.strip_html_tags(n.subject or "Notification"),
					"body": frappe.utils.strip_html_tags(n.email_content or ""),
					"read_at": str(n.creation) if n.read else None,
					"created_at": str(n.creation),
				}
			)

	if not member:
		return items

	program_ids = accessible_program_ids(member)
	if program_ids:
		todays = frappe.get_all(
			"Workout",
			filters={"program": ["in", program_ids], "scheduled_date": today()},
			fields=["name", "title"],
			limit=5,
		)
		logged = set(
			frappe.get_all(
				"Workout Log",
				filters={"member": member, "workout": ["in", [w.name for w in todays] or [""]]},
				pluck="workout",
			)
		)
		for w in todays:
			done = w.name in logged
			items.append(
				{
					"id": f"wod-{w.name}",
					"kind": "workout",
					"title": _("Today's Workout: {0}").format(w.title),
					"body": _("Completed and logged!") if done else _("Scheduled for today — tap Train to log your score."),
					"read_at": today() if done else None,
					"created_at": str(today()),
				}
			)

	bookings = frappe.get_all(
		"Class Booking",
		filters={"member": member, "status": "Booked"},
		fields=["name", "session", "creation"],
		order_by="creation desc",
		limit=5,
	)
	sessions = {
		s.name: s
		for s in frappe.get_all(
			"Class Session",
			filters={"name": ["in", [b.session for b in bookings] or [""]]},
			fields=["name", "class_type", "start_time"],
		)
	}
	for b in bookings:
		s = sessions.get(b.session)
		if s and str(s.start_time or "")[:10] >= str(today()):
			items.append(
				{
					"id": f"cls-{b.name}",
					"kind": "system",
					"title": _("Class Booked: {0}").format(s.class_type),
					"body": str(s.start_time)[:16],
					"read_at": str(b.creation),
					"created_at": str(b.creation),
				}
			)

	return items


@frappe.whitelist(methods=["POST"])
def mark_notifications_read():
	if frappe.db.exists("DocType", "Notification Log"):
		frappe.db.sql(
			"update `tabNotification Log` set `read` = 1 where for_user = %s and `read` = 0",
			(frappe.session.user,),
		)
	return {"ok": True}


# ---------------------------------------------------------------------------
# Marketplace & Promos & Gym Team
# ---------------------------------------------------------------------------


def _enrollment_status(e) -> str:
	if e.payment_status == "Pending":
		return "Pending"
	return "Active" if cint(e.is_active) else "Ended"


@frappe.whitelist()
def get_marketplace():
	"""Published Training Programs, with the member's enrollment status on each."""
	member = _current_member()
	default_curr = _get_settings()["default_currency"]
	programs = frappe.get_all(
		"Training Program",
		filters={"is_published": 1},
		fields=["name", "program_name", "sport", "coach", "kind", "summary", "description", "price", "currency"],
		order_by="creation desc",
	)
	coach_names = _name_map("Coach", [p.coach for p in programs], "coach_name")
	enrollments = {}
	if member:
		for e in frappe.get_all(
			"Member Program",
			filters={"member": member},
			fields=["program", "is_active", "payment_status"],
		):
			enrollments[e.program] = e

	listings = []
	for p in programs:
		e = enrollments.get(p.name)
		listings.append(
			{
				"id": p.name,
				"title": p.program_name,
				"sport": p.sport or "",
				"kind": p.kind or "Ongoing",
				"seller_name": coach_names.get(p.coach, p.coach) if p.coach else "Go Train Coaching",
				"price_cents": round(flt(p.price) * 100),
				"currency": p.currency or default_curr,
				"summary": p.summary or p.description or f"{p.kind or 'Ongoing'} training block.",
				"my_status": _enrollment_status(e) if e else None,
			}
		)
	return listings


@frappe.whitelist()
def get_marketplace_purchases():
	"""Programs the current member is enrolled in (or has requested)."""
	member = _current_member()
	if not member:
		return []
	default_curr = _get_settings()["default_currency"]
	enrollments = frappe.get_all(
		"Member Program",
		filters={"member": member},
		fields=["name", "program", "start_date", "is_active", "payment_status"],
		order_by="creation desc",
	)
	programs = {
		p.name: p
		for p in frappe.get_all(
			"Training Program",
			filters={"name": ["in", [e.program for e in enrollments] or [""]]},
			fields=["name", "program_name", "price", "currency"],
		)
	}
	out = []
	for e in enrollments:
		p = programs.get(e.program)
		if p:
			out.append(
				{
					"id": e.name,
					"program_id": e.program,
					"title": p.program_name,
					"price_cents": round(flt(p.price) * 100),
					"currency": p.currency or default_curr,
					"status": _enrollment_status(e),
					"start_date": str(e.start_date),
				}
			)
	return out


@frappe.whitelist()
def get_marketplace_sales():
	"""Recent enrollments in the coach's programs (all programs for managers)."""
	coach = _require_coach()
	default_curr = _get_settings()["default_currency"]
	coach_cond = "" if is_manager() else "and tp.coach = %(coach)s"
	rows = frappe.db.sql(
		f"""
		select mp.name, mp.payment_status, tp.program_name, tp.price, tp.currency, m.full_name
		from `tabMember Program` mp
		join `tabTraining Program` tp on tp.name = mp.program
		left join `tabMember` m on m.name = mp.member
		where 1 = 1 {coach_cond}
		order by mp.creation desc
		limit 50
		""",
		{"coach": coach},
		as_dict=True,
	)
	return [
		{
			"id": r.name,
			"title": r.program_name,
			"buyer_name": r.full_name or "",
			"price_cents": round(flt(r.price) * 100),
			"currency": r.currency or default_curr,
			"status": r.payment_status or "Free",
		}
		for r in rows
	]


@frappe.whitelist(methods=["POST"])
def buy_program(program: str):
	"""Enroll in a published program. Free programs activate immediately; paid
	ones create a Pending enrollment that staff activate once payment is taken."""
	member = _require_member()
	p = frappe.db.get_value("Training Program", program, ["is_published", "price"], as_dict=True)
	if not p or not cint(p.is_published):
		frappe.throw(_("This program is not available."))
	paid = flt(p.price) > 0

	name = frappe.db.get_value("Member Program", {"member": member, "program": program}, "name")
	doc = frappe.get_doc("Member Program", name) if name else frappe.new_doc("Member Program")
	if name and cint(doc.is_active):
		return {"enrollment": doc.name, "status": "Active"}

	doc.update(
		{
			"member": member,
			"program": program,
			"start_date": today(),
			"payment_status": "Pending" if paid else "Free",
			"is_active": 0 if paid else 1,
		}
	)
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	return {"enrollment": doc.name, "status": "Pending" if paid else "Active"}


@frappe.whitelist()
def get_promos():
	"""Active Gym Promo records within their validity window."""
	if not frappe.db.exists("DocType", "Gym Promo"):
		return []
	now = getdate(today())
	rows = frappe.get_all(
		"Gym Promo",
		filters={"is_active": 1},
		fields=["name", "title", "description", "code", "percent_off", "valid_from", "valid_until"],
		order_by="creation desc",
	)
	return [
		{
			"id": r.name,
			"title": r.title,
			"description": r.description or "",
			"code": r.code or "",
			"percent_off": flt(r.percent_off),
			"valid_until": str(r.valid_until) if r.valid_until else None,
		}
		for r in rows
		if (not r.valid_from or getdate(r.valid_from) <= now)
		and (not r.valid_until or getdate(r.valid_until) >= now)
	]


GYM_ROLES = [
	{
		"id": "gym-manager",
		"name": "Gym Manager",
		"can_manage_clients": True,
		"can_manage_programs": True,
		"can_manage_billing": True,
	},
	{
		"id": "coach",
		"name": "Coach",
		"can_manage_clients": True,
		"can_manage_programs": True,
		"can_manage_billing": False,
	},
	{
		"id": "front-desk",
		"name": "Front Desk",
		"can_manage_clients": True,
		"can_manage_programs": False,
		"can_manage_billing": True,
	},
]


@frappe.whitelist()
def get_gym_team():
	"""The gym's coaching team. Staff also see the member roster and join requests."""
	settings = _get_settings()
	roster = [
		{
			"id": c.name,
			"full_name": c.coach_name,
			"team_role": f"Coach · {c.sport}" if c.sport else "Coach",
			"user_role": "Coach",
			"is_paying_client": False,
		}
		for c in frappe.get_all(
			"Coach",
			filters={"is_active": 1},
			fields=["name", "coach_name", "sport"],
			order_by="coach_name asc",
		)
	]
	join_requests = []

	if is_staff():
		members = _without_staff(
			frappe.get_all(
				"Member",
				filters={"status": ["in", ["Active", "Paused"]]},
				fields=["name", "full_name", "status", "user"],
				order_by="full_name asc",
				limit=100,
			)
		)
		roster += [
			{
				"id": m.name,
				"full_name": m.full_name,
				"team_role": "Athlete",
				"user_role": "Member",
				"is_paying_client": m.status == "Active",
			}
			for m in members
		]
		join_requests = [
			{"id": a.name, "full_name": a.full_name}
			for a in frappe.get_all(
				"Member",
				filters={"status": "Applicant"},
				fields=["name", "full_name"],
				order_by="creation desc",
				limit=50,
			)
		]

	return {
		"name": settings["gym_name"],
		"members": roster,
		"join_requests": join_requests,
		"roles": GYM_ROLES,
	}


# ---------------------------------------------------------------------------
# Coach Endpoints
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_coach_clients():
	"""Athletes managed by the coach (all members for a Gym Manager)."""
	coach = _require_coach()
	members = _without_staff(
		frappe.get_all(
			"Member",
			filters=_client_filters(coach),
			fields=["name", "full_name", "status", "email", "avatar", "goal", "user"],
			order_by="modified desc",
			limit=100,
		)
	)
	active = _group_count("Member Program", "member", [m.name for m in members], "and is_active = 1")
	return [
		{
			"id": m.name,
			"full_name": m.full_name,
			"email": m.email or "",
			"avatar_url": m.avatar or "",
			"goal": m.goal or "",
			"status": (m.status or "Active").lower(),
			"active_programs": active.get(m.name, 0),
		}
		for m in members
	]


@frappe.whitelist()
def get_coach_programs():
	"""Programs the coach owns (every program for a Gym Manager)."""
	coach = _require_coach()
	filters = {} if is_manager() else {"coach": coach}
	names = frappe.get_all("Training Program", filters=filters, pluck="name", order_by="modified desc")
	return _program_rows(names, None)


@frappe.whitelist(methods=["POST"])
def create_coach_program(
	name: str,
	description: str | None = None,
	sport: str | None = None,
	kind: str = "Ongoing",
	price: float = 0,
	is_published: int = 0,
):
	"""Create a new Training Program owned by the signed-in coach."""
	coach = _require_coach()
	if not (name or "").strip():
		frappe.throw(_("Program name is required"))
	doc = frappe.get_doc(
		{
			"doctype": "Training Program",
			"program_name": name.strip()[:140],
			"description": description,
			"summary": description,
			"sport": sport if sport and frappe.db.exists("Sport", sport) else None,
			"coach": coach,
			"kind": kind if kind in ("Ongoing", "Fixed Weeks") else "Ongoing",
			"is_published": 1 if cint(is_published) else 0,
			"price": max(0, flt(price)),
			"currency": _get_settings()["default_currency"],
		}
	).insert(ignore_permissions=True)
	return {"id": doc.name, "name": doc.program_name}


@frappe.whitelist(methods=["POST"])
def create_coach_workout(
	program: str,
	title: str,
	body: str,
	scheduled_date: str | None = None,
	letter: str = "A",
	coach_notes: str | None = None,
):
	"""Create a new Workout inside one of the coach's Training Programs."""
	_assert_program_manageable(program)
	if not (title or "").strip() or not (body or "").strip():
		frappe.throw(_("Workout title and prescribed workout text are required"))
	try:
		scheduled = getdate(scheduled_date) if scheduled_date else getdate(today())
	except Exception:
		frappe.throw(_("Invalid scheduled date"))
	doc = frappe.get_doc(
		{
			"doctype": "Workout",
			"program": program,
			"title": title.strip()[:140],
			"letter": (letter or "A").strip()[:4],
			"scheduled_date": scheduled,
			"body": body.strip(),
			"summary": coach_notes,
		}
	).insert(ignore_permissions=True)
	return {"id": doc.name, "title": doc.title, "scheduled_on": str(doc.scheduled_date)}


def _can_manage_program(program: str) -> bool:
	if not program or not frappe.db.exists("Training Program", program):
		return False
	if is_manager():
		return True
	coach = get_coach_for_user()
	return bool(coach) and frappe.db.get_value("Training Program", program, "coach") == coach


def _ensure_exercise(name) -> str | None:
	"""Library movement for `name`, created on the fly for coaches."""
	name = str(name or "").strip()[:140]
	if not name:
		return None
	if frappe.db.exists("Exercise", name):
		return name
	return frappe.get_doc({"doctype": "Exercise", "exercise_name": name}).insert(ignore_permissions=True).name


@frappe.whitelist(methods=["POST"])
def save_workout_movements(workout: str, movements: list | str):
	"""Replace a workout's prescribed movements (coach), including a demo
	photo/video or video link per movement."""
	program = frappe.db.get_value("Workout", workout, "program")
	if not program:
		frappe.throw(_("Workout not found"), frappe.DoesNotExistError)
	_assert_program_manageable(program)

	if isinstance(movements, str):
		movements = json.loads(movements or "[]")
	if not isinstance(movements, list):
		frappe.throw(_("Invalid movements"))

	doc = frappe.get_doc("Workout", workout)
	known = {r.media for r in doc.exercises or [] if r.media}
	rows, new_media = [], []
	for m in movements[:50]:
		if not isinstance(m, dict):
			continue
		exercise = _ensure_exercise(m.get("exercise"))
		if not exercise:
			continue
		media = str(m.get("media") or "").strip() or None
		if media and media not in known:
			new_media.append(media)
		rows.append(
			{
				"exercise": exercise,
				"sets": max(0, min(50, cint(m.get("sets")))) or None,
				"reps": str(m.get("reps") or "").strip()[:40] or None,
				"target_load": str(m.get("weight") or "").strip()[:40] or None,
				"rest": str(m.get("rest") or "").strip()[:40] or None,
				"notes": str(m.get("notes") or "").strip()[:1000] or None,
				"media": media,
				"video_url": _clean_video_url(m.get("video_url")),
			}
		)
	doc.set("exercises", rows)
	doc.save(ignore_permissions=True)
	for file_url in new_media:
		_claim_file(file_url, "Workout", doc.name, "exercises")
	return get_workout(workout)


@frappe.whitelist(methods=["POST"])
def assign_member_program(member: str, program: str):
	"""Assign a Training Program to one of the coach's athletes (complimentary)."""
	coach = _require_coach()
	if not frappe.db.exists("Member", member):
		frappe.throw(_("Member not found"), frappe.DoesNotExistError)
	if not is_manager() and frappe.db.get_value("Member", member, "coach") != coach:
		frappe.throw(_("You can only assign programs to your own athletes"), frappe.PermissionError)
	if not frappe.db.exists("Training Program", program):
		frappe.throw(_("Program not found"), frappe.DoesNotExistError)
	if not is_manager() and not cint(frappe.db.get_value("Training Program", program, "is_published")):
		_assert_program_manageable(program)

	name = frappe.db.get_value("Member Program", {"member": member, "program": program}, "name")
	doc = frappe.get_doc("Member Program", name) if name else frappe.new_doc("Member Program")
	doc.update({"member": member, "program": program, "is_active": 1})
	if doc.is_new():
		doc.start_date = today()
	if doc.payment_status in (None, "", "Pending"):
		doc.payment_status = "Free"
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	return {"id": doc.name, "status": "Active"}
