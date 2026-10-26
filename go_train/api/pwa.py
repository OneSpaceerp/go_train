# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""
Whitelisted endpoints consumed by the /gotrain athlete & coach PWA.
All endpoints run as the signed-in Frappe User and scope data to the
linked Member or Coach record.
"""

import json
import os
import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, now_datetime, today
from werkzeug.wrappers import Response


# ---------------------------------------------------------------------------
# App permission & Service Worker
# ---------------------------------------------------------------------------


def check_app_permission():
	"""Check if the signed-in user has access to the Go Train Desk tile on /apps."""
	if frappe.session.user == "Administrator":
		return True
	roles = set(frappe.get_roles(frappe.session.user))
	staff_roles = {"System Manager", "Gym Manager", "Coach", "Front Desk"}
	if roles & staff_roles:
		return True
	user_type = frappe.db.get_value("User", frappe.session.user, "user_type")
	return user_type == "System User"


@frappe.whitelist(allow_guest=True)
def sw():
	"""Serve the PWA service worker with Service-Worker-Allowed: /gotrain."""
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
# Member & Coach resolution helpers
# ---------------------------------------------------------------------------


def _get_coach_for_user(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	if user == "Guest":
		return None
	coach = frappe.db.get_value("Coach", {"user": user, "active": 1}, "name")
	if coach:
		return coach
	email = frappe.db.get_value("User", user, "email") or user
	return frappe.db.get_value("Coach", {"email": email, "active": 1}, "name")


def _is_staff_or_coach(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	roles = set(frappe.get_roles(user))
	if roles & {"System Manager", "Gym Manager", "Coach"}:
		return True
	return bool(_get_coach_for_user(user))


def _get_or_create_member() -> str:
	"""Return the Member name linked to the current Frappe user, creating one on first visit."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please sign in"), frappe.PermissionError)

	member = frappe.db.get_value("Member", {"user": user}, "name")
	if member:
		return member

	u = frappe.db.get_value(
		"User", user, ["full_name", "email", "mobile_no", "user_image"], as_dict=True
	) or {}
	by_email = u.get("email") and frappe.db.get_value("Member", {"email": u.email}, "name")
	if by_email:
		frappe.db.set_value("Member", by_email, "user", user)
		return by_email

	doc = frappe.get_doc(
		{
			"doctype": "Member",
			"full_name": u.get("full_name") or user,
			"email": u.get("email") or user,
			"mobile_no": u.get("mobile_no"),
			"avatar": u.get("user_image"),
			"user": user,
			"status": "Active",
			"join_date": today(),
			"locale": "en",
			"theme": "system",
		}
	).insert(ignore_permissions=True)
	return doc.name


def _get_settings() -> dict:
	try:
		s = frappe.get_single("Go Train Settings")
		return {
			"gym_name": s.gym_name or "Go Train Gym",
			"default_currency": s.default_currency or "USD",
			"default_weight_unit": s.default_weight_unit or "kg",
			"members_can_self_book": cint(s.members_can_self_book),
			"members_can_self_checkin": cint(s.members_can_self_checkin),
		}
	except Exception:
		return {
			"gym_name": "Go Train Gym",
			"default_currency": "USD",
			"default_weight_unit": "kg",
			"members_can_self_book": 1,
			"members_can_self_checkin": 1,
		}


# ---------------------------------------------------------------------------
# Boot & Profile
# ---------------------------------------------------------------------------


@frappe.whitelist()
def boot():
	"""Initial payload for the PWA: user, member profile, coach status, and gym settings."""
	member_name = _get_or_create_member()
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
	coach_name = _get_coach_for_user()
	is_coach_user = _is_staff_or_coach()
	coach_info = None
	if m.get("coach"):
		coach_info = frappe.db.get_value(
			"Coach", m.coach, ["name", "full_name", "specialty", "avatar", "email"], as_dict=True
		)

	return {
		"user": frappe.session.user,
		"name": m.name,
		"full_name": m.full_name,
		"email": m.email or frappe.session.user,
		"mobile_no": m.mobile_no or "",
		"avatar_url": m.avatar or "",
		"status": m.status,
		"locale": m.locale or "en",
		"theme": m.theme or "system",
		"goal": m.goal or "",
		"height_cm": flt(m.height_cm) if m.height_cm else None,
		"weight_kg": flt(m.weight_kg) if m.weight_kg else None,
		"coach": coach_info,
		"coach_profile": coach_name,
		"is_coach": bool(is_coach_user),
		"role": "coach" if coach_name else "client",
		"member": m,
		"settings": _get_settings(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"version": getattr(frappe.get_attr("go_train"), "__version__", "0.2.0"),
	}


@frappe.whitelist()
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
	member_name = _get_or_create_member()
	updates = {}
	if locale in ("en", "ar"):
		updates["locale"] = locale
	if theme in ("system", "light", "dark"):
		updates["theme"] = theme
	if goal is not None:
		updates["goal"] = goal
	if height_cm is not None:
		updates["height_cm"] = flt(height_cm) if str(height_cm).strip() != "" else 0
	if weight_kg is not None:
		updates["weight_kg"] = flt(weight_kg) if str(weight_kg).strip() != "" else 0
	if full_name:
		updates["full_name"] = full_name.strip()
	if mobile_no is not None:
		updates["mobile_no"] = mobile_no.strip()

	if updates:
		frappe.db.set_value("Member", member_name, updates)

	return boot()


# ---------------------------------------------------------------------------
# Calendar, Programs & Workouts
# ---------------------------------------------------------------------------


def _member_program_ids(member: str) -> list[str]:
	enrolled = frappe.get_all(
		"Member Program",
		filters={"member": member},
		pluck="program",
	)
	if enrolled:
		return list(dict.fromkeys(enrolled))
	return frappe.get_all("Training Program", filters={"is_published": 1}, pluck="name")


@frappe.whitelist()
def get_calendar(month: str | None = None):
	"""Return scheduled workouts with the member's log status for the MonthCalendar."""
	member = _get_or_create_member()
	program_ids = _member_program_ids(member)
	if not program_ids:
		return []

	workouts = frappe.get_all(
		"Workout",
		filters={"program": ["in", program_ids]},
		fields=["name", "title", "letter", "scheduled_date", "program"],
		order_by="scheduled_date asc",
		limit=200,
	)
	if not workouts:
		return []

	workout_names = [w.name for w in workouts]
	logs = frappe.get_all(
		"Workout Log",
		filters={"member": member, "workout": ["in", workout_names]},
		fields=["workout", "status", "log_date"],
		order_by="creation desc",
	)
	by_workout = {}
	for l in logs:
		by_workout.setdefault(l.workout, l)

	events = []
	for w in workouts:
		if not w.scheduled_date:
			continue
		log = by_workout.get(w.name)
		status = (log.status.lower() if log and log.status else "upcoming")
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


@frappe.whitelist()
def get_programs():
	"""Programs assigned to the current member (or published programs if none assigned)."""
	member = _get_or_create_member()
	assigned = frappe.get_all(
		"Member Program",
		filters={"member": member},
		fields=["name", "program", "status", "start_date", "end_date"],
		order_by="start_date desc",
	)
	program_names = [a.program for a in assigned]
	status_by_program = {a.program: a.status for a in assigned}

	if not program_names:
		program_names = frappe.get_all(
			"Training Program", filters={"is_published": 1}, pluck="name"
		)

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
	for p in programs:
		p["status"] = status_by_program.get(p.name, "Active")
		p["is_active"] = p["status"] == "Active"
		p["workout_count"] = frappe.db.count("Workout", {"program": p.name})
		p["done_count"] = frappe.db.count(
			"Workout Log", {"member": member, "program": p.name, "status": "Done"}
		)
		p["client_count"] = frappe.db.count(
			"Member Program", {"program": p.name, "status": "Active"}
		)
		if p.get("coach"):
			p["coach_name"] = frappe.db.get_value("Coach", p.coach, "full_name") or p.coach
	return programs


@frappe.whitelist()
def get_program_workouts(program: str):
	"""Workouts in a program with the current member's latest log status attached."""
	member = _get_or_create_member()
	workouts = frappe.get_all(
		"Workout",
		filters={"program": program},
		fields=["name", "title", "letter", "scheduled_date", "week", "day_number", "body"],
		order_by="scheduled_date desc, week asc, day_number asc",
	)
	if not workouts:
		return []

	logs = frappe.get_all(
		"Workout Log",
		filters={"member": member, "workout": ["in", [w.name for w in workouts]]},
		fields=[
			"name",
			"workout",
			"status",
			"result",
			"details",
			"rpe",
			"duration_seconds",
			"attachment",
			"attachment_name",
			"log_date",
		],
		order_by="log_date desc, creation desc",
	)
	by_workout = {}
	for l in logs:
		l["attachment_url"] = l.get("attachment")
		by_workout.setdefault(l.workout, l)

	for w in workouts:
		w["my_log"] = by_workout.get(w.name)
	return workouts


@frappe.whitelist()
def get_workout(workout: str):
	"""Full workout detail: prescribed text, exercise rows, member's logs, and comments."""
	member = _get_or_create_member()
	doc = frappe.get_doc("Workout", workout)
	my_logs = frappe.get_all(
		"Workout Log",
		filters={"member": member, "workout": workout},
		fields=[
			"name",
			"status",
			"result",
			"details",
			"rpe",
			"duration_seconds",
			"attachment",
			"attachment_name",
			"log_date",
		],
		order_by="log_date desc, creation desc",
	)
	for l in my_logs:
		l["attachment_url"] = l.get("attachment")

	raw_comments = frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": "Workout",
			"reference_name": workout,
			"comment_type": "Comment",
		},
		fields=["name", "content", "comment_by", "comment_email", "creation"],
		order_by="creation asc",
		limit=50,
	)
	comments = []
	for c in raw_comments:
		author_user = c.comment_email or ""
		is_coach_author = _is_staff_or_coach(author_user) if author_user else False
		comments.append(
			{
				"id": c.name,
				"body": frappe.utils.strip_html_tags(c.content or "").strip(),
				"author": c.comment_by or c.comment_email or "Athlete",
				"author_role": "coach" if is_coach_author else "member",
				"created_at": str(c.creation),
			}
		)

	return {
		"name": doc.name,
		"title": doc.title,
		"letter": doc.letter,
		"program": doc.program,
		"scheduled_date": doc.scheduled_date,
		"body": doc.body,
		"coach_notes": doc.coach_notes,
		"exercises": [
			{
				"exercise": r.exercise,
				"sets": r.sets,
				"reps": r.reps,
				"weight": r.weight,
				"rest_seconds": r.rest_seconds,
				"notes": r.notes,
			}
			for r in (doc.exercises or [])
		],
		"my_log": my_logs[0] if my_logs else None,
		"logs": my_logs,
		"comments": comments,
	}


@frappe.whitelist()
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
):
	"""Record or update a member's result for a workout."""
	member = _get_or_create_member()
	existing_name = frappe.db.get_value(
		"Workout Log",
		{"member": member, "workout": workout, "log_date": today()},
		"name",
	)
	parsed_sets = []
	if isinstance(set_logs, str) and set_logs.strip():
		try:
			parsed_sets = json.loads(set_logs)
		except Exception:
			parsed_sets = []
	elif isinstance(set_logs, list):
		parsed_sets = set_logs

	if existing_name:
		doc = frappe.get_doc("Workout Log", existing_name)
		doc.status = status
		doc.result = result
		doc.details = details
		doc.rpe = cint(rpe) if rpe else None
		doc.duration_seconds = cint(duration) if duration is not None else None
		if attachment is not None:
			doc.attachment = attachment
		if attachment_name is not None:
			doc.attachment_name = attachment_name
		if parsed_sets:
			doc.set("set_logs", parsed_sets)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Workout Log",
				"member": member,
				"workout": workout,
				"log_date": today(),
				"status": status,
				"result": result,
				"details": details,
				"rpe": cint(rpe) if rpe else None,
				"duration_seconds": cint(duration) if duration is not None else None,
				"attachment": attachment,
				"attachment_name": attachment_name,
				"set_logs": parsed_sets,
			}
		).insert(ignore_permissions=True)

	# Auto-record PR / Progress Entry for any completed set with weight > 0
	for s in parsed_sets:
		if s.get("exercise") and flt(s.get("weight")) > 0 and cint(s.get("completed", 1)):
			frappe.get_doc(
				{
					"doctype": "Progress Entry",
					"member": member,
					"recorded_date": today(),
					"metric": s.get("exercise"),
					"exercise": s.get("exercise")
					if frappe.db.exists("Exercise", s.get("exercise"))
					else None,
					"value": flt(s.get("weight")),
					"unit": _get_settings().get("default_weight_unit", "kg"),
					"notes": f"Logged in workout {workout}",
				}
			).insert(ignore_permissions=True)

	return {
		"name": doc.name,
		"status": doc.status,
		"log_date": str(doc.log_date),
		"duration_seconds": doc.duration_seconds,
		"attachment_url": doc.attachment,
		"attachment_name": doc.attachment_name,
	}


@frappe.whitelist()
def add_workout_comment(workout: str, body: str):
	"""Add a comment on a Workout (visible in both the PWA and ERPNext Desk)."""
	if not (body or "").strip():
		frappe.throw(_("Comment cannot be empty"))
	member = _get_or_create_member()
	full_name = frappe.db.get_value("Member", member, "full_name") or frappe.session.user
	is_coach = _is_staff_or_coach()

	c = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Comment",
			"reference_doctype": "Workout",
			"reference_name": workout,
			"comment_email": frappe.session.user,
			"comment_by": full_name,
			"content": body.strip(),
		}
	).insert(ignore_permissions=True)

	return {
		"id": c.name,
		"body": body.strip(),
		"author": full_name,
		"author_role": "coach" if is_coach else "member",
		"created_at": str(c.creation),
	}


# ---------------------------------------------------------------------------
# History, Insights & Progress Tracking
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_history(q: str | None = None):
	"""Notes-style search across workouts, prescribed text, and the member's logged results."""
	member = _get_or_create_member()
	logs = frappe.db.sql(
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
		{"member": member, "q": q or "", "like": f"%{q or ''}%"},
		as_dict=True,
	)
	return logs


@frappe.whitelist()
def get_insights():
	"""Completion ring + counts for the Track tab."""
	member = _get_or_create_member()
	done = frappe.db.count("Workout Log", {"member": member, "status": "Done"})
	missed = frappe.db.count("Workout Log", {"member": member, "status": "Missed"})
	distinct_days = frappe.db.sql(
		"select count(distinct log_date) from `tabWorkout Log` where member = %s",
		(member,),
	)
	logged_days = cint(distinct_days[0][0]) if distinct_days else 0
	total = done + missed
	return {
		"done": done,
		"missed": missed,
		"logged": logged_days,
		"completion": round((done / total) * 100) if total else 0,
	}


@frappe.whitelist()
def get_tracking():
	"""Progress Entry time series grouped by metric for the Track tab."""
	member = _get_or_create_member()
	rows = frappe.get_all(
		"Progress Entry",
		filters={"member": member},
		fields=["name", "metric", "exercise", "value", "unit", "recorded_date", "notes"],
		order_by="recorded_date asc, creation asc",
	)
	grouped: dict[str, dict] = {}
	for r in rows:
		g = grouped.setdefault(r.metric, {"metric": r.metric, "unit": r.unit or "kg", "points": []})
		g["points"].append(
			{
				"id": r.name,
				"date": str(r.recorded_date),
				"value": flt(r.value),
				"notes": r.notes or "",
			}
		)
	return list(grouped.values())


@frappe.whitelist()
def add_progress_entry(
	metric: str,
	value: float,
	unit: str = "kg",
	recorded_date: str | None = None,
	notes: str | None = None,
):
	"""Allow an athlete to record a new PR or body metric from the Track tab."""
	member = _get_or_create_member()
	metric_clean = (metric or "").strip()
	if not metric_clean:
		frappe.throw(_("Metric name is required"))

	exercise_link = metric_clean if frappe.db.exists("Exercise", metric_clean) else None
	doc = frappe.get_doc(
		{
			"doctype": "Progress Entry",
			"member": member,
			"recorded_date": recorded_date or today(),
			"metric": metric_clean,
			"exercise": exercise_link,
			"value": flt(value),
			"unit": (unit or "kg").strip(),
			"notes": notes,
		}
	).insert(ignore_permissions=True)

	# Keep Member.weight_kg in sync when logging Bodyweight
	if metric_clean.lower() in ("bodyweight", "body weight", "weight") and (unit or "kg").lower() == "kg":
		frappe.db.set_value("Member", member, "weight_kg", flt(value))

	return {
		"id": doc.name,
		"metric": doc.metric,
		"value": flt(doc.value),
		"unit": doc.unit,
		"date": str(doc.recorded_date),
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
		term = f"%{q.strip()}%"
		or_filters = [
			["Exercise", "exercise_name", "like", term],
			["Exercise", "category", "like", term],
			["Exercise", "sport", "like", term],
			["Exercise", "description", "like", term],
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
			"default_unit",
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
			"default_unit": r.default_unit or "kg",
			"video_url": r.video_url or "",
			"description": r.description or "",
		}
		for r in rows
	]


# ---------------------------------------------------------------------------
# Classes, Bookings & Check-in
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_classes():
	"""Upcoming class sessions with booking count, coach info, and the member's booking status."""
	member = _get_or_create_member()
	settings = _get_settings()
	sessions = frappe.get_all(
		"Class Session",
		filters={"status": "Scheduled", "session_date": [">=", today()]},
		fields=[
			"name",
			"title",
			"class_type",
			"coach",
			"session_date",
			"start_time",
			"end_time",
			"capacity",
			"room",
			"workout",
		],
		order_by="session_date asc, start_time asc",
		limit=50,
	)
	for s in sessions:
		s["id"] = s.name
		s["booked_count"] = frappe.db.count(
			"Class Booking", {"session": s.name, "status": ["in", ["Booked", "Attended"]]}
		)
		s["spots_left"] = max(0, cint(s.capacity) - s["booked_count"]) if cint(s.capacity) else 99
		booking = frappe.db.get_value(
			"Class Booking",
			{"session": s.name, "member": member, "status": ["!=", "Cancelled"]},
			["name", "status"],
			as_dict=True,
		)
		s["my_booking"] = booking
		if s.get("coach"):
			s["coach_name"] = frappe.db.get_value("Coach", s.coach, "full_name") or s.coach
		if s.get("class_type"):
			ct = frappe.db.get_value(
				"Class Type", s.class_type, ["class_type_name", "color"], as_dict=True
			)
			if ct:
				s["class_type_name"] = ct.class_type_name
				s["color"] = ct.color or "#F23D46"

	checked_in_today = bool(
		frappe.db.exists(
			"Check In",
			{"member": member, "check_in_time": [">=", f"{today()} 00:00:00"]},
		)
	)
	return {
		"sessions": sessions,
		"checked_in_today": checked_in_today,
		"can_self_book": bool(settings.get("members_can_self_book", 1)),
		"can_self_checkin": bool(settings.get("members_can_self_checkin", 1)),
	}


@frappe.whitelist()
def book_class(session: str):
	"""Book the current member into a class session."""
	settings = _get_settings()
	if not settings.get("members_can_self_book", 1) and not _is_staff_or_coach():
		frappe.throw(_("Self-booking is currently disabled by your gym."))

	member = _get_or_create_member()
	existing = frappe.db.get_value(
		"Class Booking", {"session": session, "member": member}, ["name", "status"], as_dict=True
	)
	if existing:
		if existing.status == "Cancelled":
			doc = frappe.get_doc("Class Booking", existing.name)
			doc.status = "Booked"
			doc.save(ignore_permissions=True)
			return {"booking": doc.name, "status": doc.status}
		return {"booking": existing.name, "status": existing.status}

	doc = frappe.get_doc(
		{"doctype": "Class Booking", "session": session, "member": member, "status": "Booked"}
	).insert(ignore_permissions=True)
	return {"booking": doc.name, "status": doc.status}


@frappe.whitelist()
def cancel_booking(booking: str | None = None, session: str | None = None):
	"""Cancel a member's class booking by booking ID or session ID."""
	member = _get_or_create_member()
	if not booking and session:
		booking = frappe.db.get_value(
			"Class Booking",
			{"session": session, "member": member, "status": "Booked"},
			"name",
		)
	if not booking:
		frappe.throw(_("Booking not found"))

	owner = frappe.db.get_value("Class Booking", booking, "member")
	if owner != member and not _is_staff_or_coach():
		frappe.throw(_("Not your booking"), frappe.PermissionError)
	frappe.db.set_value("Class Booking", booking, "status", "Cancelled")
	return {"booking": booking, "status": "Cancelled"}


@frappe.whitelist()
def check_in(session: str | None = None, facility: str | None = None):
	"""Self check-in from the PWA."""
	settings = _get_settings()
	if not settings.get("members_can_self_checkin", 1) and not _is_staff_or_coach():
		frappe.throw(_("Self check-in is currently disabled by your gym."))

	member = _get_or_create_member()
	doc = frappe.get_doc(
		{
			"doctype": "Check In",
			"member": member,
			"session": session,
			"facility": facility or settings.get("gym_name") or "Main Floor",
			"check_in_time": now_datetime(),
			"method": "App",
		}
	).insert(ignore_permissions=True)
	return {"check_in": doc.name, "check_in_time": str(doc.check_in_time)}


# ---------------------------------------------------------------------------
# Messages & Threads (Coach <-> Member Direct Messaging)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_threads():
	"""Return direct message threads for the current user (Member or Coach)."""
	member = _get_or_create_member()
	coach_user = _get_coach_for_user()

	if coach_user:
		# Coaches see threads for their assigned members (or all active members)
		clients = frappe.get_all(
			"Member",
			filters={"status": ["in", ["Active", "Paused"]]},
			fields=["name", "full_name", "coach", "avatar"],
			order_by="modified desc",
			limit=50,
		)
		threads = []
		for c in clients:
			last_comment = frappe.get_all(
				"Comment",
				filters={
					"reference_doctype": "Member",
					"reference_name": c.name,
					"comment_type": "Comment",
				},
				fields=["content", "creation"],
				order_by="creation desc",
				limit=1,
			)
			threads.append(
				{
					"id": c.name,
					"other_name": c.full_name,
					"avatar_url": c.avatar or "",
					"last_message": frappe.utils.strip_html_tags(last_comment[0].content).strip()
					if last_comment
					else "Tap to message athlete",
					"last_at": str(last_comment[0].creation) if last_comment else None,
				}
			)
		return threads

	# Athlete sees a thread with their assigned Coach (or Head Coach / Gym Desk)
	assigned_coach_id = frappe.db.get_value("Member", member, "coach")
	coach_name = "Head Coach"
	coach_avatar = ""
	if assigned_coach_id:
		c_row = frappe.db.get_value(
			"Coach", assigned_coach_id, ["full_name", "avatar"], as_dict=True
		)
		if c_row:
			coach_name = c_row.full_name
			coach_avatar = c_row.avatar or ""
	else:
		first_coach = frappe.get_all(
			"Coach", filters={"active": 1}, fields=["full_name", "avatar"], limit=1
		)
		if first_coach:
			coach_name = first_coach[0].full_name
			coach_avatar = first_coach[0].avatar or ""

	last_comment = frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": "Member",
			"reference_name": member,
			"comment_type": "Comment",
		},
		fields=["content", "creation"],
		order_by="creation desc",
		limit=1,
	)
	return [
		{
			"id": member,
			"other_name": coach_name,
			"avatar_url": coach_avatar,
			"last_message": frappe.utils.strip_html_tags(last_comment[0].content).strip()
			if last_comment
			else "Ask your coach about programming, weights, or recovery.",
			"last_at": str(last_comment[0].creation) if last_comment else None,
		}
	]


@frappe.whitelist()
def get_thread_messages(thread: str):
	"""Return messages in a Member<->Coach thread."""
	member = _get_or_create_member()
	if thread != member and not _is_staff_or_coach():
		frappe.throw(_("Not authorized to view this conversation"), frappe.PermissionError)

	rows = frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": "Member",
			"reference_name": thread,
			"comment_type": "Comment",
		},
		fields=["name", "content", "comment_email", "comment_by", "creation"],
		order_by="creation asc",
		limit=100,
	)
	messages = []
	for r in rows:
		messages.append(
			{
				"id": r.name,
				"body": frappe.utils.strip_html_tags(r.content or "").strip(),
				"author": r.comment_by or r.comment_email,
				"mine": (r.comment_email == frappe.session.user),
				"created_at": str(r.creation),
			}
		)
	return messages


@frappe.whitelist()
def send_thread_message(thread: str, body: str):
	"""Send a message in a Member<->Coach thread."""
	if not (body or "").strip():
		frappe.throw(_("Message cannot be empty"))
	member = _get_or_create_member()
	if thread != member and not _is_staff_or_coach():
		frappe.throw(_("Not authorized to message this thread"), frappe.PermissionError)

	full_name = frappe.db.get_value("Member", member, "full_name") or frappe.session.user
	doc = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Comment",
			"reference_doctype": "Member",
			"reference_name": thread,
			"comment_email": frappe.session.user,
			"comment_by": full_name,
			"content": body.strip(),
		}
	).insert(ignore_permissions=True)

	return {
		"id": doc.name,
		"body": body.strip(),
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
	member = _get_or_create_member()
	items = []

	# 1. System Notification Log entries for this user
	if frappe.db.exists("DocType", "Notification Log"):
		sys_logs = frappe.get_all(
			"Notification Log",
			filters={"for_user": frappe.session.user},
			fields=["name", "subject", "email_content", "read", "creation", "type"],
			order_by="creation desc",
			limit=20,
		)
		for n in sys_logs:
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

	# 2. Today's scheduled workouts
	program_ids = _member_program_ids(member)
	if program_ids:
		todays_workouts = frappe.get_all(
			"Workout",
			filters={"program": ["in", program_ids], "scheduled_date": today()},
			fields=["name", "title", "program"],
			limit=5,
		)
		for w in todays_workouts:
			logged = frappe.db.exists("Workout Log", {"member": member, "workout": w.name})
			items.append(
				{
					"id": f"wod-{w.name}",
					"kind": "workout",
					"title": f"Today's Workout: {w.title}",
					"body": "Completed and logged!" if logged else "Scheduled for today — tap Train to log your score.",
					"read_at": today() if logged else None,
					"created_at": str(today()),
				}
			)

	# 3. Upcoming class bookings
	bookings = frappe.get_all(
		"Class Booking",
		filters={"member": member, "status": "Booked"},
		fields=["name", "session", "creation"],
		order_by="creation desc",
		limit=5,
	)
	for b in bookings:
		s = frappe.db.get_value(
			"Class Session",
			b.session,
			["title", "session_date", "start_time"],
			as_dict=True,
		)
		if s and str(s.session_date) >= str(today()):
			items.append(
				{
					"id": f"cls-{b.name}",
					"kind": "system",
					"title": f"Class Booked: {s.title}",
					"body": f"{s.session_date} at {str(s.start_time)[:5]}",
					"read_at": str(b.creation),
					"created_at": str(b.creation),
				}
			)

	return items


@frappe.whitelist()
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


@frappe.whitelist()
def get_marketplace():
	"""Return published Training Programs available for enrollment in the Marketplace."""
	settings = _get_settings()
	default_curr = settings.get("default_currency") or "USD"
	programs = frappe.get_all(
		"Training Program",
		filters={"is_published": 1},
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
		],
		order_by="creation desc",
	)
	listings = []
	for p in programs:
		seller = "Go Train Coaching"
		if p.coach:
			seller = frappe.db.get_value("Coach", p.coach, "full_name") or p.coach
		listings.append(
			{
				"id": p.name,
				"title": p.program_name,
				"sport": p.sport or "",
				"kind": p.kind or "Ongoing",
				"seller_name": seller,
				"price_cents": int(round(flt(p.price) * 100)),
				"currency": p.currency or default_curr,
				"summary": p.summary or p.description or f"{p.kind or 'Ongoing'} training block.",
			}
		)
	return listings


@frappe.whitelist()
def get_marketplace_purchases():
	"""Return programs the current member is enrolled in."""
	member = _get_or_create_member()
	settings = _get_settings()
	default_curr = settings.get("default_currency") or "USD"
	enrollments = frappe.get_all(
		"Member Program",
		filters={"member": member},
		fields=["name", "program", "start_date", "status"],
		order_by="creation desc",
	)
	out = []
	for e in enrollments:
		p = frappe.db.get_value(
			"Training Program",
			e.program,
			["program_name", "price", "currency"],
			as_dict=True,
		)
		if p:
			out.append(
				{
					"id": e.name,
					"program_id": e.program,
					"title": p.program_name,
					"price_cents": int(round(flt(p.price) * 100)),
					"currency": p.currency or default_curr,
					"status": e.status,
					"start_date": str(e.start_date),
				}
			)
	return out


@frappe.whitelist()
def get_marketplace_sales():
	"""Return recent Member Program enrollments across coach programs."""
	settings = _get_settings()
	default_curr = settings.get("default_currency") or "USD"
	enrollments = frappe.get_all(
		"Member Program",
		fields=["name", "member", "program", "start_date", "status"],
		order_by="creation desc",
		limit=50,
	)
	sales = []
	for e in enrollments:
		p = frappe.db.get_value(
			"Training Program",
			e.program,
			["program_name", "price", "currency"],
			as_dict=True,
		)
		buyer = frappe.db.get_value("Member", e.member, "full_name") or e.member
		if p:
			sales.append(
				{
					"id": e.name,
					"title": p.program_name,
					"buyer_name": buyer,
					"price_cents": int(round(flt(p.price) * 100)),
					"currency": p.currency or default_curr,
				}
			)
	return sales


@frappe.whitelist()
def buy_program(program: str):
	"""Enroll the current member into a published Training Program."""
	member = _get_or_create_member()
	existing = frappe.db.get_value(
		"Member Program",
		{"member": member, "program": program},
		"name",
	)
	if existing:
		frappe.db.set_value("Member Program", existing, "status", "Active")
		return {"enrollment": existing, "status": "Active"}

	doc = frappe.get_doc(
		{
			"doctype": "Member Program",
			"member": member,
			"program": program,
			"start_date": today(),
			"status": "Active",
		}
	).insert(ignore_permissions=True)
	return {"enrollment": doc.name, "status": doc.status}


@frappe.whitelist()
def get_promos():
	"""Return active gym promotions and member offers."""
	settings = _get_settings()
	gym_name = settings.get("gym_name") or "Go Train"
	return [
		{
			"id": "promo-annual",
			"percent_off": 20,
			"title": f"{gym_name} Annual Athlete Pass",
			"description": "Commit to 12 months of unlimited classes & custom programming and save 20%.",
			"code": "GOTRAIN20",
		},
		{
			"id": "promo-buddy",
			"percent_off": 15,
			"title": "Bring a Training Partner",
			"description": "Refer a friend to join a strength or WOD track — both of you get 15% off next month.",
			"code": "PARTNER15",
		},
		{
			"id": "promo-oly",
			"percent_off": 10,
			"title": "Olympic Lifting Specialty Cycle",
			"description": "8-week Snatch & Clean & Jerk cycle with video review from your coach.",
			"code": "OLY10",
		},
	]


@frappe.whitelist()
def get_gym_team():
	"""Return the gym's team roster (Coaches, Members, Applicants, and Roles)."""
	settings = _get_settings()
	coaches = frappe.get_all(
		"Coach",
		filters={"active": 1},
		fields=["name", "full_name", "specialty", "email"],
		order_by="full_name asc",
	)
	members = frappe.get_all(
		"Member",
		filters={"status": ["in", ["Active", "Paused"]]},
		fields=["name", "full_name", "status", "coach"],
		order_by="full_name asc",
		limit=100,
	)
	applicants = frappe.get_all(
		"Member",
		filters={"status": "Applicant"},
		fields=["name", "full_name", "join_date"],
		order_by="creation desc",
	)

	roster = []
	for c in coaches:
		roster.append(
			{
				"id": f"coach-{c.name}",
				"full_name": c.full_name,
				"team_role": f"Coach · {c.specialty}" if c.specialty else "Coach",
				"user_role": "Coach",
				"is_paying_client": False,
			}
		)
	for m in members:
		roster.append(
			{
				"id": m.name,
				"full_name": m.full_name,
				"team_role": "Athlete",
				"user_role": "Member",
				"is_paying_client": m.status == "Active",
			}
		)

	return {
		"name": settings.get("gym_name") or "Go Train Gym",
		"members": roster,
		"join_requests": [{"id": a.name, "full_name": a.full_name} for a in applicants],
		"roles": [
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
		],
	}


# ---------------------------------------------------------------------------
# Coach Endpoints
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_coach_clients():
	"""Return athletes managed by the coach (or all members for Gym Manager)."""
	coach = _get_coach_for_user()
	filters = {}
	if coach and not ("Gym Manager" in frappe.get_roles() or "System Manager" in frappe.get_roles()):
		filters["coach"] = coach

	members = frappe.get_all(
		"Member",
		filters=filters,
		fields=["name", "full_name", "status", "email", "avatar", "coach", "goal"],
		order_by="modified desc",
		limit=100,
	)
	if not members and filters:
		members = frappe.get_all(
			"Member",
			fields=["name", "full_name", "status", "email", "avatar", "coach", "goal"],
			order_by="modified desc",
			limit=100,
		)

	out = []
	for m in members:
		active_count = frappe.db.count(
			"Member Program", {"member": m.name, "status": "Active"}
		)
		out.append(
			{
				"id": m.name,
				"full_name": m.full_name,
				"email": m.email or "",
				"avatar_url": m.avatar or "",
				"goal": m.goal or "",
				"status": (m.status or "Active").lower(),
				"active_programs": active_count,
			}
		)
	return out


@frappe.whitelist()
def create_coach_program(
	name: str,
	description: str | None = None,
	sport: str | None = None,
	kind: str = "Ongoing",
	price: float = 0,
):
	"""Create a new Training Program from the Coach PWA."""
	if not (name or "").strip():
		frappe.throw(_("Program name is required"))
	coach = _get_coach_for_user()
	doc = frappe.get_doc(
		{
			"doctype": "Training Program",
			"program_name": name.strip(),
			"description": description,
			"summary": description,
			"sport": sport if sport and frappe.db.exists("Sport", sport) else None,
			"coach": coach,
			"kind": kind if kind in ("Ongoing", "Fixed Weeks") else "Ongoing",
			"is_published": 1,
			"price": flt(price),
			"currency": _get_settings().get("default_currency", "USD"),
		}
	).insert(ignore_permissions=True)
	return {"id": doc.name, "name": doc.program_name}


@frappe.whitelist()
def create_coach_workout(
	program: str,
	title: str,
	body: str,
	scheduled_date: str | None = None,
	letter: str = "A",
	coach_notes: str | None = None,
):
	"""Create a new Workout inside a Training Program from the Coach PWA."""
	if not (title or "").strip() or not (body or "").strip():
		frappe.throw(_("Workout title and prescribed workout text are required"))
	doc = frappe.get_doc(
		{
			"doctype": "Workout",
			"program": program,
			"title": title.strip(),
			"letter": (letter or "A").strip()[:4],
			"scheduled_date": scheduled_date or today(),
			"body": body.strip(),
			"coach_notes": coach_notes,
		}
	).insert(ignore_permissions=True)
	return {"id": doc.name, "title": doc.title, "scheduled_on": str(doc.scheduled_date)}


@frappe.whitelist()
def assign_member_program(member: str, program: str):
	"""Assign a Training Program to a Member from the Coach PWA."""
	existing = frappe.db.get_value(
		"Member Program", {"member": member, "program": program}, "name"
	)
	if existing:
		frappe.db.set_value("Member Program", existing, "status", "Active")
		return {"id": existing, "status": "Active"}

	doc = frappe.get_doc(
		{
			"doctype": "Member Program",
			"member": member,
			"program": program,
			"start_date": today(),
			"status": "Active",
		}
	).insert(ignore_permissions=True)
	return {"id": doc.name, "status": doc.status}
