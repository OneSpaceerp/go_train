# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class CheckIn(Document):
	def validate(self):
		if not self.check_in_time:
			self.check_in_time = now_datetime()

	def after_insert(self):
		# If checking into a specific Class Session, mark any Booked Class Booking as Attended
		if self.session and self.member:
			booking = frappe.db.get_value(
				"Class Booking",
				{"session": self.session, "member": self.member, "status": "Booked"},
				"name",
			)
			if booking:
				frappe.db.set_value("Class Booking", booking, "status", "Attended")
