# Copyright (c) 2026, Go Train and contributors
# For license information, please see license.txt

"""Integration tests for the PWA API and row-level permissions.

Run with: bench --site <site> run-tests --app go_train
"""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_months, now_datetime, today

from go_train.api import pwa


def _user(email, roles=("Member",), user_type="Website User"):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"user_type": user_type,
				"roles": [{"role": r} for r in roles],
			}
		).insert(ignore_permissions=True)
	return email


def _member(user, coach=None):
	name = frappe.db.get_value("Member", {"user": user}, "name")
	if not name:
		name = (
			frappe.get_doc(
				{"doctype": "Member", "full_name": user, "email": user, "user": user, "status": "Active"}
			)
			.insert(ignore_permissions=True)
			.name
		)
	frappe.db.set_value("Member", name, "coach", coach)
	return name


def _coach(user, label):
	name = frappe.db.get_value("Coach", {"user": user}, "name")
	if not name:
		name = (
			frappe.get_doc({"doctype": "Coach", "coach_name": label, "user": user, "is_active": 1})
			.insert(ignore_permissions=True)
			.name
		)
	return name


def _program(name, coach=None, published=1, price=0):
	return (
		frappe.get_doc(
			{
				"doctype": "Training Program",
				"program_name": name,
				"coach": coach,
				"is_published": published,
				"price": price,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _workout(program, scheduled=None, title="Test WOD"):
	return (
		frappe.get_doc(
			{
				"doctype": "Workout",
				"program": program,
				"title": title,
				"body": "5x5 Back Squat",
				"scheduled_date": scheduled or today(),
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class TestPwaApi(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.athlete = _user("gt-athlete@example.com")
		cls.other = _user("gt-other@example.com")
		cls.coach_user = _user("gt-coach@example.com", ("Coach",), "System User")
		cls.coach2_user = _user("gt-coach2@example.com", ("Coach",), "System User")
		cls.coach = _coach(cls.coach_user, "GT Test Coach")
		cls.coach2 = _coach(cls.coach2_user, "GT Test Coach")  # same name: series naming
		cls.member = _member(cls.athlete, cls.coach)
		cls.other_member = _member(cls.other, cls.coach2)
		if not frappe.db.exists("Exercise", "Back Squat"):
			frappe.get_doc({"doctype": "Exercise", "exercise_name": "Back Squat"}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	# --- boot & profile -----------------------------------------------------

	def test_boot_returns_version_and_member(self):
		frappe.set_user(self.athlete)
		data = pwa.boot()
		self.assertEqual(data["name"], self.member)
		self.assertTrue(data["version"])
		self.assertFalse(data["is_coach"])

	def test_update_profile_persists(self):
		frappe.set_user(self.athlete)
		pwa.update_profile(theme="dark", goal="Sub-20 5K")
		self.assertEqual(frappe.db.get_value("Member", self.member, "theme"), "dark")

	def test_staff_do_not_get_member_records(self):
		frappe.set_user(self.coach_user)
		data = pwa.boot()
		self.assertFalse(data["has_member_profile"])
		self.assertFalse(frappe.db.exists("Member", {"user": self.coach_user}))

	def test_coaches_with_same_name_get_distinct_records(self):
		self.assertNotEqual(self.coach, self.coach2)

	# --- authorization ------------------------------------------------------

	def test_member_cannot_use_coach_endpoints(self):
		frappe.set_user(self.athlete)
		self.assertRaises(frappe.PermissionError, pwa.create_coach_program, name="Hack")
		self.assertRaises(frappe.PermissionError, pwa.get_coach_clients)
		self.assertRaises(frappe.PermissionError, pwa.get_marketplace_sales)
		self.assertRaises(
			frappe.PermissionError, pwa.assign_member_program, member=self.other_member, program="x"
		)

	def test_coach_sees_only_own_clients(self):
		frappe.set_user(self.coach_user)
		ids = {c["id"] for c in pwa.get_coach_clients()}
		self.assertIn(self.member, ids)
		self.assertNotIn(self.other_member, ids)

	def test_coach_cannot_edit_another_coachs_program(self):
		program = _program("GT Coach2 Program", coach=self.coach2)
		frappe.set_user(self.coach_user)
		self.assertRaises(
			frappe.PermissionError, pwa.create_coach_workout, program=program, title="x", body="y"
		)

	def test_threads_are_private(self):
		frappe.set_user(self.athlete)
		self.assertRaises(frappe.PermissionError, pwa.get_thread_messages, thread=self.other_member)
		frappe.set_user(self.coach_user)
		self.assertRaises(frappe.PermissionError, pwa.get_thread_messages, thread=self.other_member)
		pwa.send_thread_message(thread=self.member, body="Nice work <b>today</b>")
		msgs = pwa.get_thread_messages(thread=self.member)
		self.assertEqual(msgs[-1]["body"], "Nice work <b>today</b>")

	def test_unpublished_workout_is_hidden_from_members(self):
		program = _program("GT Draft", coach=self.coach, published=0)
		workout = _workout(program)
		frappe.set_user(self.athlete)
		self.assertRaises(frappe.PermissionError, pwa.get_workout, workout=workout)
		self.assertNotIn(program, [p["name"] for p in pwa.get_programs()])

	def test_gym_roster_hidden_from_members(self):
		frappe.set_user(self.athlete)
		team = pwa.get_gym_team()
		self.assertTrue(all(m["user_role"] == "Coach" for m in team["members"]))
		self.assertEqual(team["join_requests"], [])

	def test_rest_api_returns_only_own_records(self):
		frappe.get_doc(
			{"doctype": "Progress Entry", "member": self.other_member, "metric": "Deadlift", "value": 200, "recorded_on": today()}
		).insert(ignore_permissions=True)
		frappe.set_user(self.athlete)
		rows = frappe.get_list("Progress Entry", fields=["member"], limit_page_length=0)
		self.assertTrue(all(r.member == self.member for r in rows))
		other = frappe.get_doc("Member", self.other_member)
		self.assertFalse(frappe.has_permission("Member", "read", other))

	# --- workout logging ----------------------------------------------------

	def test_log_workout_records_one_pr_and_reloads_sets(self):
		workout = _workout(_program("GT Strength"))
		frappe.db.delete("Progress Entry", {"member": self.member, "metric": "Back Squat"})
		frappe.set_user(self.athlete)
		sets = [
			{"exercise": "Back Squat", "set_no": 1, "weight": 100, "reps": 5, "completed": 1},
			{"exercise": "Back Squat", "set_no": 2, "weight": 120, "reps": 3, "completed": 1},
		]
		log = pwa.log_workout(workout=workout, status="Done", set_logs=sets)
		pwa.log_workout(workout=workout, status="Done", set_logs=sets)  # re-save

		prs = frappe.get_all("Progress Entry", filters={"workout_log": log["name"]}, pluck="value")
		self.assertEqual(prs, [120])
		detail = pwa.get_workout(workout=workout)
		self.assertEqual(len(detail["my_log"]["set_logs"]), 2)

	def test_log_workout_without_rpe_can_be_edited_in_desk(self):
		workout = _workout(_program("GT Desk Edit"))
		frappe.set_user(self.athlete)
		log = pwa.log_workout(workout=workout, status="Done")
		frappe.set_user("Administrator")
		doc = frappe.get_doc("Workout Log", log["name"])
		doc.details = "edited"
		doc.save()

	def test_log_workout_rejects_bad_status(self):
		workout = _workout(_program("GT Status"))
		frappe.set_user(self.athlete)
		self.assertRaises(frappe.ValidationError, pwa.log_workout, workout=workout, status="Crushed")

	def test_offline_replay_keeps_original_date(self):
		workout = _workout(_program("GT Offline"))
		frappe.set_user(self.athlete)
		yesterday = add_days(now_datetime(), -1).strftime("%Y-%m-%d %H:%M:%S")
		log = pwa.log_workout(workout=workout, status="Done", client_time=yesterday)
		self.assertEqual(log["log_date"], str(add_days(today(), -1)))

	def test_progress_entry_dedupes_by_op_id(self):
		frappe.set_user(self.athlete)
		a = pwa.add_progress_entry(metric="Bodyweight", value=80, client_op_id="op-test-1")
		b = pwa.add_progress_entry(metric="Bodyweight", value=80, client_op_id="op-test-1")
		self.assertEqual(a["id"], b["id"])

	# --- calendar -----------------------------------------------------------

	def test_calendar_honors_month(self):
		program = _program("GT Calendar")
		far = add_months(today(), 6)
		workout = _workout(program, scheduled=far)
		frappe.set_user(self.athlete)
		self.assertNotIn(workout, [e["id"] for e in pwa.get_calendar()])
		self.assertIn(workout, [e["id"] for e in pwa.get_calendar(month=str(far)[:7])])

	# --- classes & marketplace ----------------------------------------------

	def test_check_in_is_idempotent_per_day(self):
		frappe.set_user(self.athlete)
		a = pwa.check_in()
		b = pwa.check_in()
		self.assertEqual(a["check_in"], b["check_in"])

	def test_paid_program_enrollment_is_pending(self):
		program = _program("GT Paid", price=49)
		frappe.set_user(self.athlete)
		res = pwa.buy_program(program=program)
		self.assertEqual(res["status"], "Pending")
		self.assertFalse(frappe.db.get_value("Member Program", res["enrollment"], "is_active"))

	def test_unpublished_program_cannot_be_bought(self):
		program = _program("GT Private", published=0)
		frappe.set_user(self.athlete)
		self.assertRaises(frappe.ValidationError, pwa.buy_program, program=program)
