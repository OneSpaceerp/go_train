# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""Tests for the Android Digital Asset Links file.

Run with: bench --site <site> run-tests --app go_train
"""

import frappe
from frappe.tests import IntegrationTestCase

from go_train.well_known import build_assetlinks, parse_fingerprints

FP = ":".join(["AB"] * 32)


class TestWellKnown(IntegrationTestCase):
	def test_parse_fingerprints_accepts_lines_and_commas(self):
		self.assertEqual(parse_fingerprints(f" {FP.lower()}\n\n{FP}, {FP} "), [FP, FP, FP])

	def test_unconfigured_returns_nothing(self):
		self.assertEqual(build_assetlinks("", [FP]), [])
		self.assertEqual(build_assetlinks("com.gotrain.app", []), [])

	def test_assetlinks_shape(self):
		[link] = build_assetlinks("com.gotrain.app", [FP])
		self.assertEqual(link["relation"], ["delegate_permission/common.handle_all_urls"])
		self.assertEqual(link["target"]["package_name"], "com.gotrain.app")
		self.assertEqual(link["target"]["sha256_cert_fingerprints"], [FP])

	def test_settings_reject_bad_values(self):
		settings = frappe.get_doc("Go Train Settings")
		settings.android_package_name = "gotrain"
		self.assertRaises(frappe.ValidationError, settings.validate)
		settings.android_package_name = "com.gotrain.app"
		settings.android_sha256_fingerprints = "AB:CD"
		self.assertRaises(frappe.ValidationError, settings.validate)
		settings.android_sha256_fingerprints = FP.lower()
		settings.validate()
		self.assertEqual(settings.android_sha256_fingerprints, FP)
