# Copyright (c) 2026, nsdLabs and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MemberProgram(Document):
	def validate(self):
		# A paid enrollment stays inactive until staff confirm the payment
		if self.payment_status == "Pending":
			self.is_active = 0
