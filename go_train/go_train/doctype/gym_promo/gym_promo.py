# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class GymPromo(Document):
	def validate(self):
		if self.valid_from and self.valid_until and getdate(self.valid_until) < getdate(self.valid_from):
			frappe.throw(_("Valid Until cannot be before Valid From"))
