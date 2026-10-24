# Go Train — Product

**Go Train** runs a multi-sport fitness space and gives its athletes a phone app.
One Frappe/ERPNext v16 app, two faces:

- **Desk (staff):** gym managers, coaches and front desk manage members,
  programs, workouts, classes, bookings, check-ins and progress — alongside
  ERPNext's billing, CRM and HR.
- **PWA (athletes):** `/go-train` — members see their program, log workouts
  (sets, RPE, duration, attachments), search their history, track progress, and
  book classes / check in.

## Who it's for

- **Gym Manager** — runs a facility: members, plans, schedule, staff.
- **Coach** — builds programs, writes workouts, reviews logs, runs classes.
- **Front Desk** — check-ins, bookings, walk-ins.
- **Member** — the athlete; uses the PWA (no Desk access).

## Sports

Gym, CrossFit, Calisthenics, Weightlifting, HYROX, Boxing, Yoga, Running — and
any discipline a manager adds. Every program, exercise, class and member can be
tagged to a sport, so one space can run many disciplines side by side.

## Domain (training core, shipped)

Sport · Exercise · Training Program · Member Program · Workout (+ exercises) ·
Workout Log (+ set logs) · Class Type · Class Session · Class Booking · Check In ·
Progress Entry · Member · Coach.

Reuses ERPNext where it already fits: Customer, Employee, Subscription & Sales
Invoice (billing), Branch/Location (facilities), Asset (equipment), Coupon Code
(promos).

## Next

Membership plans & billing on ERPNext Subscription · facilities & equipment ·
front-desk POS · coach tooling · realtime + push in the PWA · reports and
dashboards.
