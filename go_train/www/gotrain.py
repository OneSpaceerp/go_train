# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import json
import frappe

no_cache = 1


def get_context(context):
	# The PWA is a single-page app; unauthenticated visitors see the in-app
	# Go Train login screen at /gotrain/login, not Frappe's /login.
	csrf_token = frappe.sessions.get_csrf_token()
	frappe.db.commit()  # nosempgrep: persist CSRF token in session
	user = frappe.session.user
	full_name = ""
	if user != "Guest":
		full_name = frappe.db.get_value("User", user, "full_name") or user

	context.no_cache = 1
	context.show_sidebar = False
	context.csrf_token = csrf_token
	context.boot_json = json.dumps(
		{
			"user": user,
			"full_name": full_name,
			"csrf_token": csrf_token,
			"site_name": frappe.local.site,
		}
	)
	return context
