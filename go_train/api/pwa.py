# Copyright (c) 2026, nsdLabs and contributors
# For license information, please see license.txt
"""Whitelisted API for the Go Train PWA (served at /gotrain).

The PWA user is a Frappe User linked to a Member. Every endpoint resolves the
member from the session and only ever returns that member's own data.
"""
import frappe
from frappe import _
from frappe.utils import today


# ---------------------------------------------------------------------------
# App-launcher permission (hooks.add_to_apps_screen)
# ---------------------------------------------------------------------------
def check_app_permission():
    """Who may see the Go Train icon on the /apps launcher."""
    if frappe.session.user == "Administrator":
        return True
    allowed = {"System Manager", "Gym Manager", "Coach", "Front Desk", "Member"}
    return bool(set(frappe.get_roles()) & allowed)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _member(optional=False):
    """The Member linked to the signed-in user.

    Read endpoints pass optional=True so an admin or an unlinked user sees empty
    data instead of an error; write endpoints require a real member.
    """
    name = frappe.db.get_value("Member", {"user": frappe.session.user}, "name")
    if not name and not optional:
        frappe.throw(_("No gym member is linked to your account."), frappe.PermissionError)
    return name


def _guard_guest():
    if frappe.session.user == "Guest":
        frappe.throw(_("Please sign in."), frappe.PermissionError)


# ---------------------------------------------------------------------------
# Boot / profile
# ---------------------------------------------------------------------------
@frappe.whitelist()
def boot():
    _guard_guest()
    member = frappe.db.get_value(
        "Member", {"user": frappe.session.user},
        ["name", "member_name", "status", "primary_sport", "coach", "locale"], as_dict=True,
    )
    return {
        "user": frappe.session.user,
        "full_name": frappe.db.get_value("User", frappe.session.user, "full_name"),
        "member": member,
        "roles": frappe.get_roles(),
    }


@frappe.whitelist()
def get_profile():
    m = _member()
    return frappe.get_doc("Member", m).as_dict()


# ---------------------------------------------------------------------------
# Programs & workouts
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_programs():
    """Programs the member is enrolled in, with progress counts."""
    member = _member(optional=True)
    if not member:
        return []
    rows = frappe.get_all(
        "Member Program", filters={"member": member}, fields=["program", "start_date", "is_active"],
        order_by="is_active desc, start_date desc",
    )
    out = []
    for r in rows:
        p = frappe.db.get_value("Training Program", r.program,
                                ["name", "program_name", "sport", "kind", "description"], as_dict=True)
        if not p:
            continue
        total = frappe.db.count("Workout", {"program": r.program})
        done = frappe.db.sql(
            """select count(distinct wl.workout) from `tabWorkout Log` wl
               join `tabWorkout` w on w.name = wl.workout
               where w.program = %s and wl.member = %s and wl.status = 'Done'""",
            (r.program, member),
        )[0][0]
        out.append({**p, "start_date": r.start_date, "is_active": r.is_active,
                    "workout_count": total, "done_count": done})
    return out


@frappe.whitelist()
def get_program_workouts(program):
    member = _member(optional=True)
    workouts = frappe.get_all(
        "Workout", filters={"program": program},
        fields=["name", "title", "letter", "day_index", "scheduled_date", "summary", "body"],
        order_by="day_index asc, scheduled_date desc",
    )
    for w in workouts:
        log = frappe.get_all(
            "Workout Log", filters={"workout": w.name, "member": member},
            fields=["name", "status", "result", "rpe", "duration", "log_date"],
            order_by="creation desc", limit=1,
        )
        w["my_log"] = log[0] if log else None
    return workouts


@frappe.whitelist()
def get_workout(workout):
    member = _member(optional=True)
    doc = frappe.get_doc("Workout", workout)
    out = doc.as_dict()
    logs = frappe.get_all(
        "Workout Log", filters={"workout": workout, "member": member},
        fields=["name", "status", "result", "details", "rpe", "duration", "attachment", "log_date"],
        order_by="creation desc",
    )
    out["my_log"] = logs[0] if logs else None
    out["logs"] = logs
    return out


@frappe.whitelist(methods=["POST"])
def log_workout(workout, status="Done", result=None, details=None, rpe=None,
                duration=None, attachment=None):
    member = _member()
    program = frappe.db.get_value("Workout", workout, "program")
    doc = frappe.get_doc({
        "doctype": "Workout Log", "member": member, "workout": workout, "program": program,
        "log_date": today(), "status": status, "result": result, "details": details,
        "rpe": rpe, "duration": duration, "attachment": attachment,
    })
    doc.insert(ignore_permissions=True)
    return doc.name


# ---------------------------------------------------------------------------
# History & insights
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_history(q=None):
    member = _member(optional=True)
    if not member:
        return []
    conditions = "wl.member = %(member)s"
    values = {"member": member}
    if q:
        conditions += (" and (w.title like %(q)s or w.body like %(q)s"
                       " or wl.result like %(q)s or p.program_name like %(q)s)")
        values["q"] = f"%{q}%"
    return frappe.db.sql(
        f"""select wl.name, w.title, w.body, w.scheduled_date, p.program_name as program,
                   wl.status, wl.result, wl.log_date, wl.workout
            from `tabWorkout Log` wl
            join `tabWorkout` w on w.name = wl.workout
            join `tabTraining Program` p on p.name = w.program
            where {conditions}
            order by coalesce(wl.log_date, w.scheduled_date) desc""",
        values, as_dict=True,
    )


@frappe.whitelist()
def get_insights():
    member = _member(optional=True)
    if not member:
        return {"done": 0, "missed": 0, "logged": 0, "completion": 0}
    done = frappe.db.count("Workout Log", {"member": member, "status": "Done"})
    missed = frappe.db.count("Workout Log", {"member": member, "status": "Missed"})
    logged = len(frappe.get_all("Workout Log", filters={"member": member},
                                fields=["distinct log_date"]))
    total = done + missed
    return {"done": done, "missed": missed, "logged": logged,
            "completion": round(done / total * 100) if total else 0}


@frappe.whitelist()
def get_tracking():
    member = _member(optional=True)
    if not member:
        return []
    rows = frappe.get_all(
        "Progress Entry", filters={"member": member},
        fields=["metric", "unit", "value", "recorded_on"], order_by="metric asc, recorded_on asc",
    )
    series = {}
    for r in rows:
        s = series.setdefault(r.metric, {"metric": r.metric, "unit": r.unit, "points": []})
        s["points"].append({"date": str(r.recorded_on), "value": r.value})
    return list(series.values())


# ---------------------------------------------------------------------------
# Classes, bookings, check-in
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_classes():
    return frappe.get_all(
        "Class Session", filters={"status": "Scheduled"},
        fields=["name", "class_type", "coach", "facility", "start_time", "end_time", "capacity"],
        order_by="start_time asc", limit=50,
    )


@frappe.whitelist(methods=["POST"])
def book_class(session):
    member = _member()
    if frappe.db.exists("Class Booking", {"session": session, "member": member,
                                          "status": ["in", ["Booked", "Attended"]]}):
        frappe.throw(_("You already have a booking for this class."))
    doc = frappe.get_doc({"doctype": "Class Booking", "session": session,
                          "member": member, "status": "Booked"})
    doc.insert(ignore_permissions=True)
    return doc.name


@frappe.whitelist(methods=["POST"])
def check_in(session=None, facility=None):
    member = _member()
    doc = frappe.get_doc({"doctype": "Check In", "member": member, "method": "App",
                          "session": session, "facility": facility})
    doc.insert(ignore_permissions=True)
    return doc.name
