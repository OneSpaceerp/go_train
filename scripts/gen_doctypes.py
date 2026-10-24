#!/usr/bin/env python3
"""Bootstrap generator for Go Train's training-core DocTypes.

Emits canonical Frappe v16 DocType JSON + controller + __init__ for each DocType
into go_train/go_train/doctype/<snake>/. Run once from the app root:

    python scripts/gen_doctypes.py

After this, the JSON files are the source of truth (Desk edits write back to them);
the generator is just scaffolding and is not part of the installed app.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCTYPE_DIR = os.path.join(ROOT, "go_train", "go_train", "doctype")
MODULE = "Go Train"
STAMP = "2026-10-24 00:00:00.000000"


def snake(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def classname(name: str) -> str:
    return "".join(p.capitalize() for p in re.split(r"[^a-zA-Z0-9]+", name) if p)


def f(fieldname, fieldtype, label=None, **kw):
    """Build a DocField dict."""
    d = {"fieldname": fieldname, "fieldtype": fieldtype, "label": label or fieldname.replace("_", " ").title()}
    d.update(kw)
    return d


# Permission presets -------------------------------------------------------
FULL = dict(read=1, write=1, create=1, delete=1, report=1, export=1, email=1, share=1, print=1)
RW = dict(read=1, write=1, create=1, report=1, export=1, email=1, share=1, print=1)
RC = dict(read=1, create=1)
RO = dict(read=1)


def perm(role, **flags):
    base = dict(read=0, write=0, create=0, delete=0, submit=0, cancel=0, amend=0,
                report=0, export=0, import_=0, email=0, share=0, print=0, role=role)
    base.update(flags)
    # Frappe uses "import" (reserved word) as the key
    base["import"] = base.pop("import_")
    return base


def doctype(name, fields, perms, *, istable=0, autoname=None, title_field=None,
            search_fields=None, naming_rule=None):
    fieldnames = [fld["fieldname"] for fld in fields]
    d = {
        "actions": [],
        "allow_rename": 1,
        "creation": STAMP,
        "doctype": "DocType",
        "editable_grid": 1,
        "engine": "InnoDB",
        "field_order": fieldnames,
        "fields": fields,
        "index_web_pages_for_search": 1,
        "istable": istable,
        "links": [],
        "modified": STAMP,
        "modified_by": "Administrator",
        "module": MODULE,
        "name": name,
        "owner": "Administrator",
        "permissions": [] if istable else perms,
        "sort_field": "modified",
        "sort_order": "DESC",
        "states": [],
        "track_changes": 1,
    }
    if autoname:
        d["autoname"] = autoname
    if naming_rule:
        d["naming_rule"] = naming_rule
    if title_field:
        d["title_field"] = title_field
    if search_fields:
        d["search_fields"] = search_fields
    return d


SELECT = lambda opts: "\n".join(opts)

# -------------------------------------------------------------------------
# DocType definitions
# -------------------------------------------------------------------------
DOCTYPES = []
A = DOCTYPES.append

# --- Sport ---------------------------------------------------------------
A(doctype("Sport",
    [
        f("sport_name", "Data", "Sport", reqd=1, unique=1, in_list_view=1),
        f("is_active", "Check", "Active", default="1", in_list_view=1),
        f("icon", "Data", "Icon"),
        f("description", "Small Text", "Description"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RO), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="field:sport_name", title_field="sport_name"))

# --- Coach ---------------------------------------------------------------
A(doctype("Coach",
    [
        f("coach_name", "Data", "Coach Name", reqd=1, in_list_view=1),
        f("is_active", "Check", "Active", default="1"),
        f("user", "Link", "User", options="User", in_list_view=1),
        f("employee", "Link", "Employee", options="Employee"),
        f("sport", "Link", "Primary Sport", options="Sport", in_list_view=1),
        f("phone", "Data", "Phone", options="Phone"),
        f("col1", "Column Break", None),
        f("bio", "Small Text", "Bio"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="field:coach_name", title_field="coach_name"))

# --- Member --------------------------------------------------------------
A(doctype("Member",
    [
        f("member_name", "Data", "Member Name", reqd=1, in_list_view=1),
        f("status", "Select", "Status", options=SELECT(["Active", "Paused", "Ended"]),
          default="Active", in_list_view=1, in_standard_filter=1),
        f("user", "Link", "User Account", options="User"),
        f("customer", "Link", "Customer", options="Customer"),
        f("coach", "Link", "Coach", options="Coach", in_standard_filter=1),
        f("primary_sport", "Link", "Primary Sport", options="Sport", in_standard_filter=1),
        f("col1", "Column Break", None),
        f("phone", "Data", "Phone", options="Phone", in_list_view=1),
        f("email", "Data", "Email", options="Email"),
        f("gender", "Link", "Gender", options="Gender"),
        f("date_of_birth", "Date", "Date of Birth"),
        f("joined_on", "Date", "Joined On", default="Today"),
        f("sec_profile", "Section Break", "Profile"),
        f("goal", "Small Text", "Goal"),
        f("height_cm", "Float", "Height (cm)"),
        f("weight_kg", "Float", "Weight (kg)"),
        f("col2", "Column Break", None),
        f("locale", "Select", "Preferred Language", options=SELECT(["en", "ar"]), default="en"),
        f("notes", "Text", "Notes"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RO), perm("Front Desk", **RW), perm("Member", **RO)],
    autoname="naming_series:", title_field="member_name",
    search_fields="phone,email"))
# add naming series field to Member
DOCTYPES[-1]["fields"].insert(0, f("naming_series", "Select", "Series",
    options="GTM-.#####", default="GTM-.#####", hidden=1))
DOCTYPES[-1]["field_order"].insert(0, "naming_series")

# --- Exercise ------------------------------------------------------------
A(doctype("Exercise",
    [
        f("exercise_name", "Data", "Exercise", reqd=1, in_list_view=1),
        f("sport", "Link", "Sport", options="Sport", in_standard_filter=1, in_list_view=1),
        f("category", "Select", "Category",
          options=SELECT(["", "Strength", "Engine", "WOD", "Core", "Skill", "Mobility", "Other"]),
          in_standard_filter=1, in_list_view=1),
        f("primary_muscle", "Data", "Primary Muscle"),
        f("equipment", "Data", "Equipment"),
        f("col1", "Column Break", None),
        f("video_url", "Data", "Video URL"),
        f("thumbnail", "Attach Image", "Thumbnail"),
        f("sec", "Section Break", None),
        f("description", "Text Editor", "Description"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="field:exercise_name", title_field="exercise_name"))

# --- Training Program ----------------------------------------------------
A(doctype("Training Program",
    [
        f("program_name", "Data", "Program Name", reqd=1, in_list_view=1),
        f("sport", "Link", "Sport", options="Sport", in_standard_filter=1, in_list_view=1),
        f("coach", "Link", "Coach", options="Coach", in_standard_filter=1),
        f("kind", "Select", "Kind", options=SELECT(["Ongoing", "Standard", "Template"]),
          default="Ongoing", in_list_view=1),
        f("col1", "Column Break", None),
        f("is_published", "Check", "Published"),
        f("is_active", "Check", "Active", default="1"),
        f("sec", "Section Break", None),
        f("description", "Text", "Description"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="field:program_name", title_field="program_name"))

# --- Member Program (assignment) -----------------------------------------
A(doctype("Member Program",
    [
        f("member", "Link", "Member", options="Member", reqd=1, in_list_view=1),
        f("program", "Link", "Training Program", options="Training Program", reqd=1, in_list_view=1),
        f("start_date", "Date", "Start Date", default="Today", in_list_view=1),
        f("is_active", "Check", "Active", default="1", in_list_view=1),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="MP-.#####"))

# --- Workout Exercise (child) --------------------------------------------
A(doctype("Workout Exercise",
    [
        f("exercise", "Link", "Exercise", options="Exercise", in_list_view=1),
        f("label", "Data", "Label", in_list_view=1),
        f("sets", "Int", "Sets", in_list_view=1),
        f("reps", "Data", "Reps", in_list_view=1),
        f("tempo", "Data", "Tempo"),
        f("target_load", "Data", "Target Load", in_list_view=1),
        f("rest", "Data", "Rest"),
        f("notes", "Small Text", "Notes"),
    ],
    [], istable=1))

# --- Workout -------------------------------------------------------------
A(doctype("Workout",
    [
        f("title", "Data", "Title", reqd=1, in_list_view=1),
        f("program", "Link", "Training Program", options="Training Program", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("letter", "Data", "Letter"),
        f("day_index", "Int", "Day Index"),
        f("scheduled_date", "Date", "Scheduled Date", in_list_view=1),
        f("col1", "Column Break", None),
        f("summary", "Small Text", "Summary"),
        f("sec_body", "Section Break", "Workout"),
        f("body", "Text", "Body"),
        f("sec_ex", "Section Break", "Exercises"),
        f("exercises", "Table", "Exercises", options="Workout Exercise"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="WO-.#####", title_field="title"))

# --- Workout Set Log (child) ---------------------------------------------
A(doctype("Workout Set Log",
    [
        f("exercise", "Link", "Exercise", options="Exercise", in_list_view=1),
        f("set_no", "Int", "Set", in_list_view=1),
        f("weight", "Float", "Weight", in_list_view=1),
        f("reps", "Int", "Reps", in_list_view=1),
        f("completed", "Check", "Done", default="1", in_list_view=1),
        f("note", "Data", "Note"),
    ],
    [], istable=1))

# --- Workout Log ---------------------------------------------------------
A(doctype("Workout Log",
    [
        f("member", "Link", "Member", options="Member", reqd=1, in_standard_filter=1, in_list_view=1),
        f("workout", "Link", "Workout", options="Workout", in_standard_filter=1, in_list_view=1),
        f("program", "Link", "Training Program", options="Training Program"),
        f("log_date", "Date", "Date", default="Today", reqd=1, in_list_view=1),
        f("status", "Select", "Status", options=SELECT(["Done", "Missed"]), default="Done",
          in_list_view=1, in_standard_filter=1),
        f("col1", "Column Break", None),
        f("rpe", "Int", "RPE (1-10)"),
        f("duration", "Duration", "Duration"),
        f("attachment", "Attach", "Attachment"),
        f("sec_res", "Section Break", "Result"),
        f("result", "Text", "Result"),
        f("details", "Small Text", "Notes"),
        f("sec_sets", "Section Break", "Set Logs"),
        f("set_logs", "Table", "Set Logs", options="Workout Set Log"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RC, write=1)],
    autoname="WL-.#####"))

# --- Class Type ----------------------------------------------------------
A(doctype("Class Type",
    [
        f("class_name", "Data", "Class Name", reqd=1, in_list_view=1),
        f("sport", "Link", "Sport", options="Sport", in_standard_filter=1, in_list_view=1),
        f("coach", "Link", "Default Coach", options="Coach"),
        f("capacity", "Int", "Capacity", default="12", in_list_view=1),
        f("duration_minutes", "Int", "Duration (min)", default="60"),
        f("is_active", "Check", "Active", default="1"),
        f("col1", "Column Break", None),
        f("description", "Small Text", "Description"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RO)],
    autoname="field:class_name", title_field="class_name"))

# --- Class Session -------------------------------------------------------
A(doctype("Class Session",
    [
        f("class_type", "Link", "Class Type", options="Class Type", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("coach", "Link", "Coach", options="Coach", in_standard_filter=1, in_list_view=1),
        f("facility", "Data", "Facility / Area"),
        f("status", "Select", "Status", options=SELECT(["Scheduled", "Completed", "Cancelled"]),
          default="Scheduled", in_list_view=1, in_standard_filter=1),
        f("col1", "Column Break", None),
        f("start_time", "Datetime", "Start", reqd=1, in_list_view=1),
        f("end_time", "Datetime", "End"),
        f("capacity", "Int", "Capacity", default="12"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RW), perm("Member", **RO)],
    autoname="CS-.#####", title_field="class_type"))

# --- Class Booking -------------------------------------------------------
A(doctype("Class Booking",
    [
        f("session", "Link", "Class Session", options="Class Session", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("member", "Link", "Member", options="Member", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("status", "Select", "Status",
          options=SELECT(["Booked", "Attended", "Cancelled", "Waitlist"]),
          default="Booked", in_list_view=1, in_standard_filter=1),
        f("booked_on", "Datetime", "Booked On", default="now"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RW), perm("Member", **RC, write=1)],
    autoname="CB-.#####"))

# --- Check In ------------------------------------------------------------
A(doctype("Check In",
    [
        f("member", "Link", "Member", options="Member", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("check_in_time", "Datetime", "Check-in Time", default="now", reqd=1, in_list_view=1),
        f("method", "Select", "Method",
          options=SELECT(["Front Desk", "QR", "App", "Manual"]), default="Front Desk",
          in_list_view=1, in_standard_filter=1),
        f("col1", "Column Break", None),
        f("facility", "Data", "Facility"),
        f("session", "Link", "Class Session", options="Class Session"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RO), perm("Front Desk", **RW), perm("Member", **RC)],
    autoname="CHK-.#####"))

# --- Progress Entry ------------------------------------------------------
A(doctype("Progress Entry",
    [
        f("member", "Link", "Member", options="Member", reqd=1,
          in_standard_filter=1, in_list_view=1),
        f("metric", "Data", "Metric", reqd=1, in_list_view=1),
        f("value", "Float", "Value", reqd=1, in_list_view=1),
        f("unit", "Data", "Unit", default="kg", in_list_view=1),
        f("recorded_on", "Date", "Recorded On", default="Today", reqd=1, in_list_view=1),
        f("notes", "Small Text", "Notes"),
    ],
    [perm("System Manager", **FULL), perm("Gym Manager", **FULL),
     perm("Coach", **RW), perm("Front Desk", **RO), perm("Member", **RC, write=1)],
    autoname="PE-.#####"))


# -------------------------------------------------------------------------
def write_all():
    count = 0
    for dt in DOCTYPES:
        folder = os.path.join(DOCTYPE_DIR, snake(dt["name"]))
        os.makedirs(folder, exist_ok=True)
        base = snake(dt["name"])
        # JSON
        with open(os.path.join(folder, base + ".json"), "w", encoding="utf-8") as fh:
            json.dump(dt, fh, indent=1)
            fh.write("\n")
        # __init__.py
        open(os.path.join(folder, "__init__.py"), "w").close()
        # controller
        cls = classname(dt["name"])
        controller = (
            "# Copyright (c) 2026, nsdLabs and contributors\n"
            "# For license information, please see license.txt\n\n"
            "import frappe\n"
            "from frappe.model.document import Document\n\n\n"
            f"class {cls}(Document):\n\tpass\n"
        )
        with open(os.path.join(folder, base + ".py"), "w", encoding="utf-8") as fh:
            fh.write(controller)
        count += 1
    print(f"wrote {count} doctypes to {DOCTYPE_DIR}")


if __name__ == "__main__":
    write_all()
