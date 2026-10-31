# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""Serve /.well-known/assetlinks.json for the Android app.

The Play Store build is a Trusted Web Activity (packaged with PWABuilder). Android
only opens it full-screen, without a browser address bar, when this file lists the
app's package ID and signing-key fingerprints. Frappe answers every /.well-known/
path itself (404 for anything it doesn't know), so this runs as a before_request
hook and returns the response early.
"""

import re

import frappe
from werkzeug.exceptions import HTTPException
from werkzeug.wrappers import Response

ASSETLINKS_PATH = "/.well-known/assetlinks.json"
PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$")
FINGERPRINT_RE = re.compile(r"^([0-9A-F]{2}:){31}[0-9A-F]{2}$")


def parse_fingerprints(text):
	"""Split a newline/comma separated list into upper-case SHA-256 fingerprints."""
	return [f.strip().upper() for f in re.split(r"[\s,]+", text or "") if f.strip()]


def build_assetlinks(package_name, fingerprints):
	package_name = (package_name or "").strip()
	if not package_name or not fingerprints:
		return []
	return [
		{
			"relation": ["delegate_permission/common.handle_all_urls"],
			"target": {
				"namespace": "android_app",
				"package_name": package_name,
				"sha256_cert_fingerprints": list(fingerprints),
			},
		}
	]


def serve_assetlinks():
	request = getattr(frappe.local, "request", None)
	if not request or request.path != ASSETLINKS_PATH or request.method not in ("GET", "HEAD"):
		return

	settings = frappe.get_cached_doc("Go Train Settings")
	links = build_assetlinks(
		settings.get("android_package_name"), parse_fingerprints(settings.get("android_sha256_fingerprints"))
	)
	response = Response(
		frappe.as_json(links) if links else "Not configured",
		status=200 if links else 404,
		mimetype="application/json" if links else "text/plain",
	)
	response.headers["Cache-Control"] = "public, max-age=300"
	# Frappe turns an HTTPException into its attached response and skips routing
	raise HTTPException(response=response)
