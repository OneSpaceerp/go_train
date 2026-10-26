# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import today


class WorkoutLog(Document):
	def validate(self):
		if not self.log_date:
			self.log_date = today()
		if self.workout and not self.program:
			self.program = frappe.db.get_value("Workout", self.workout, "program")
		if self.rpe is not None and str(self.rpe).strip() != "":
			rpe_val = int(self.rpe)
			if rpe_val < 1 or rpe_val > 10:
				frappe.throw("RPE must be between 1 and 10")
			self.rpe = rpe_val
