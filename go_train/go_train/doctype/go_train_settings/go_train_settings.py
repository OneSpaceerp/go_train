# Copyright (c) 2026, nsdLabs and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from go_train.well_known import FINGERPRINT_RE, PACKAGE_RE, parse_fingerprints


class GoTrainSettings(Document):
	def validate(self):
		if self.android_package_name:
			self.android_package_name = self.android_package_name.strip()
			if not PACKAGE_RE.match(self.android_package_name):
				frappe.throw(_("Package ID must look like com.gotrain.app"))

		fingerprints = parse_fingerprints(self.android_sha256_fingerprints)
		bad = [f for f in fingerprints if not FINGERPRINT_RE.match(f)]
		if bad:
			frappe.throw(_("Not a SHA-256 fingerprint: {0}. Expected 32 pairs like AB:CD:…").format(bad[0]))
		self.android_sha256_fingerprints = "\n".join(fingerprints)
