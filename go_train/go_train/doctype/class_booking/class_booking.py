# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ClassBooking(Document):
	def validate(self):
		if not self.session or not self.member:
			return

		# Prevent duplicate active bookings for the same member & session
		existing = frappe.db.get_value(
			"Class Booking",
			{
				"session": self.session,
				"member": self.member,
				"status": ["in", ["Booked", "Attended"]],
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if existing and self.status in ("Booked", "Attended"):
			frappe.throw("Member is already booked into this class session.")

		# Enforce session capacity when status is Booked
		if self.status == "Booked":
			capacity = frappe.db.get_value("Class Session", self.session, "capacity") or 0
			if capacity > 0:
				booked_count = frappe.db.count(
					"Class Booking",
					{
						"session": self.session,
						"status": ["in", ["Booked", "Attended"]],
						"name": ["!=", self.name or ""],
					},
				)
				if booked_count >= capacity:
					frappe.throw("This class session is already at full capacity.")
