# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, today


class WorkoutLog(Document):
	def validate(self):
		if not self.log_date:
			self.log_date = today()
		if self.workout and not self.program:
			self.program = frappe.db.get_value("Workout", self.workout, "program")
		# Int columns store 0 for "not entered", so only validate a real rating
		rpe_val = cint(self.rpe)
		if rpe_val and not 1 <= rpe_val <= 10:
			frappe.throw(_("RPE must be between 1 and 10"))
		self.rpe = rpe_val or None
