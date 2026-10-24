#!/usr/bin/env python3
"""Generate the Go Train Workspace JSON (v16 sidebar) with a valid nested content string."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "go_train", "go_train", "workspace", "go_train", "go_train.json")
STAMP = "2026-10-24 00:00:00.000000"

CARDS = {
    "Training": ["Sport", "Exercise", "Training Program", "Workout", "Member Program"],
    "Members": ["Member", "Coach", "Progress Entry"],
    "Classes": ["Class Type", "Class Session", "Class Booking"],
    "Attendance & Logs": ["Check In", "Workout Log"],
}
SHORTCUTS = [
    ("Members", "Member", "Blue"),
    ("Workout Logs", "Workout Log", "Green"),
    ("Programs", "Training Program", "Orange"),
    ("Class Sessions", "Class Session", "Purple"),
]


def _id(prefix, i):
    return f"gt_{prefix}_{i}"


def build_content():
    blocks = [{"id": _id("hdr", 0), "type": "header",
               "data": {"text": '<span class="h4"><b>Go Train</b></span>', "col": 12}}]
    for i, (label, _dt, _c) in enumerate(SHORTCUTS):
        blocks.append({"id": _id("sc", i), "type": "shortcut",
                       "data": {"shortcut_name": label, "col": 3}})
    for i, name in enumerate(CARDS):
        blocks.append({"id": _id("cd", i), "type": "card",
                       "data": {"card_name": name, "col": 4}})
    return json.dumps(blocks)


def build_links():
    links = []
    for card, items in CARDS.items():
        links.append({"hidden": 0, "is_query_report": 0, "label": card,
                      "link_count": len(items), "onboard": 0, "type": "Card Break"})
        for it in items:
            links.append({"dependencies": "", "hidden": 0, "is_query_report": 0,
                          "label": it, "link_count": 0, "link_to": it,
                          "link_type": "DocType", "onboard": 0, "type": "Link"})
    return links


def build_shortcuts():
    return [{"color": color, "format": "", "label": label, "link_to": dt,
             "stats_filter": "", "type": "DocType"} for label, dt, color in SHORTCUTS]


workspace = {
    "charts": [],
    "content": build_content(),
    "creation": STAMP,
    "custom_blocks": [],
    "docstatus": 0,
    "doctype": "Workspace",
    "for_user": "",
    "hide_custom": 0,
    "icon": "dashboard",
    "idx": 0,
    "is_hidden": 0,
    "label": "Go Train",
    "links": build_links(),
    "modified": STAMP,
    "modified_by": "Administrator",
    "module": "Go Train",
    "name": "Go Train",
    "number_cards": [],
    "owner": "Administrator",
    "parent_page": "",
    "public": 1,
    "quick_lists": [],
    "roles": [],
    "sequence_id": 1.0,
    "shortcuts": build_shortcuts(),
    "title": "Go Train",
}

if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(workspace, fh, indent=1)
        fh.write("\n")
    # self-check: content must be valid JSON
    json.loads(workspace["content"])
    print("wrote workspace:", OUT)
