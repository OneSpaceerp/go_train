# Go Train (ERPNext v16 app)

A custom **Frappe/ERPNext v16** application by **nsdLabs** (a brand under Nest
Software Development) for running multi-sport fitness spaces — **gym, CrossFit,
calisthenics and more** — and the **backend for the Go Train PWA**.

- Publisher: nsdLabs · info@nsd-eg.com
- Target: Frappe 16.5x / ERPNext 16.51+
- Module: **Go Train**

## What's in this first release (Training core)

The training backend the Go Train PWA needs, as native DocTypes in the **Go Train**
module. It reuses ERPNext where it fits (Customer, Employee, Sales Invoice,
Subscription, Branch, Coupon Code) and adds:

| Area | DocTypes |
|---|---|
| Catalog | **Sport**, **Exercise**, **Class Type** |
| People | **Member**, **Coach** |
| Programming | **Training Program**, **Member Program**, **Workout** (+ *Workout Exercise* child) |
| Logging | **Workout Log** (+ *Workout Set Log* child), **Progress Entry** |
| Classes | **Class Session**, **Class Booking** |
| Attendance | **Check In** |

Plus a **Go Train workspace** (v16 sidebar) and four roles created on install:
**Gym Manager**, **Coach**, **Front Desk**, **Member** (Member has no Desk access —
it's the PWA role).

`after_install` also seeds starter sports (Gym, CrossFit, Calisthenics, Weightlifting,
HYROX, Boxing, Yoga, Running).

## Install

On a Frappe v16 bench with ERPNext installed:

```bash
# get the app onto the bench (from a git remote, or a local path)
bench get-app go_train /path/to/this/folder      # or: bench get-app <git-url>

# install on your site
bench --site yoursite.local install-app go_train
bench --site yoursite.local migrate
bench build
```

Open the **Go Train** workspace in Desk. Roles and starter sports are created
automatically.

## Design principles

Built the way Frappe wants it (see the app-builder conventions):

- **Metadata-first.** Every entity is a DocType; schema lives in committed JSON,
  not database-only customizations.
- **Upgrade-safe.** Nothing in `frappe/` or `erpnext/` is modified; everything is
  in the `go_train` app. `bench update` never touches it.
- **Permissions are data.** Role permissions live in each DocType's JSON.

## Roadmap

1. ✅ Training core (this release)
2. Membership & billing (Membership Plan, Membership → ERPNext Subscription/Invoice)
3. Facilities, equipment (Branch/Location, Asset) and front-desk POS
4. The **Go Train PWA** served from this app (`frontend/` Vue 3 + frappe-ui, the
   existing PWA adapted to Frappe's REST API)
5. Reports, dashboards, member self-service portal

## Notes

- `scripts/` holds one-time bootstrap generators used to create the initial DocType
  and workspace JSON. After generation those JSON files are the source of truth;
  the generators are not part of the installed app.
- App icon/logo: `go_train/public/images/go_train_logo.png`. Publisher mark:
  `nsdlabs.png`.
