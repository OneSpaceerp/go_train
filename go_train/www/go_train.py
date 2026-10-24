# Copyright (c) 2026, nsdLabs and contributors
# For license information, please see license.txt
"""Bootloader for the Go Train PWA, served at /go-train.

The template next to this file (go_train.html) starts from the Vite build output
(copy-entry.js copies index.html here); `bench build --app go_train` regenerates it.
"""
import json

import frappe

import go_train

no_cache = 1


def get_context(context):
    csrf_token = frappe.sessions.get_csrf_token()
    frappe.db.commit()  # nosemgrep - persists the freshly minted session token

    context = frappe._dict()
    context.csrf_token = csrf_token
    context.site_name = frappe.local.site
    # "</" is escaped so the JSON can sit inside a <script> element safely
    context.boot_json = json.dumps(get_boot()).replace("</", "<\\/")
    return context


@frappe.whitelist(methods=["POST"], allow_guest=True)
def get_context_for_dev():
    """Vite's dev server serves index.html without Jinja, so the app fetches
    its boot data from here in development instead."""
    if not frappe.conf.developer_mode:
        frappe.throw(frappe._("This method is only meant for developer mode"))
    return get_boot()


def get_boot():
    return {
        "site_name": frappe.local.site,
        "lang": frappe.local.lang,
        "socketio_port": frappe.conf.get("socketio_port") or 9000,
        "default_route": "/go-train",
        "version": go_train.__version__,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "user": frappe.session.user,
    }
