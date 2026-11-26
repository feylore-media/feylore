# Feylore Authorization

## Principles

1. **Server-side authorization is authoritative.** UI hiding is not security.
2. **Permission-based, never role-name checks.** Code calls `can(user, permission, resource?)`. Never `if (role === 'admin')`.
3. **Multi-role union.** Effective grants = union of all assigned role permissions.
4. **Resource-level checks** where needed (files, shelves, user-owned data).

## Default roles

| Role    | Purpose                                  |
| ------- | ---------------------------------------- |
| Admin   | Full system administration               |
| Curator | Library curation, scans, metadata config |
| Member  | Personal library use                     |
| Kid     | Restricted consume-only access           |

First-run user receives **Admin**. New users default to **Member**.

Admin UI **may warn** when Kid is combined with Admin. Foundation does **not** block the assignment or special-case authorization for role combinations.

The **admin** role always has all permissions via seed. Its permission mappings cannot be modified through the API.

## Permission catalog

Permissions are string keys. Roles grant permissions; features check permissions.

### System

| Permission              | Description            |
| ----------------------- | ---------------------- |
| `system.settings.read`  | View system settings   |
| `system.settings.write` | Modify system settings |
| `audit.read`            | View audit log         |

### Users

| Permission           | Description           |
| -------------------- | --------------------- |
| `users.read`         | List/view users       |
| `users.write`        | Create/update users   |
| `users.roles.assign` | Assign roles to users |

### Roles & permissions

| Permission    | Description                     |
| ------------- | ------------------------------- |
| `roles.read`  | List roles and permissions      |
| `roles.write` | Modify role-permission mappings |

### Libraries & storage

| Permission        | Description              |
| ----------------- | ------------------------ |
| `libraries.read`  | View libraries           |
| `libraries.write` | Manage libraries         |
| `storage.read`    | View storage locations   |
| `storage.write`   | Manage storage locations |
| `storage.scan`    | Trigger scans            |

### Files

| Permission     | Description         |
| -------------- | ------------------- |
| `files.read`   | View file metadata  |
| `files.stream` | Stream file content |

### Jobs

| Permission     | Description  |
| -------------- | ------------ |
| `jobs.read`    | View jobs    |
| `jobs.enqueue` | Enqueue jobs |
| `jobs.cancel`  | Cancel jobs  |

### Metadata & integrations

| Permission                 | Description                         |
| -------------------------- | ----------------------------------- |
| `metadata.providers.read`  | View provider registry (no secrets) |
| `metadata.providers.write` | Configure providers                 |
| `metadata.formatting.read` | View metadata formatting vocabulary and language settings |
| `metadata.formatting.write` | Manage genres, tags, aliases, and language representation |
| `integrations.read`        | View integrations (no secrets)      |
| `integrations.write`       | Configure integrations              |

### Shelves

| Permission      | Description             |
| --------------- | ----------------------- |
| `shelves.read`  | View accessible shelves |
| `shelves.write` | Create/edit own shelves |
| `shelf.publish` | Make shelf public       |

### Downloads & devices

| Permission         | Description          |
| ------------------ | -------------------- |
| `downloads.manage` | Manage own downloads |
| `devices.manage`   | Manage own devices   |

### Activity

| Permission          | Description                      |
| ------------------- | -------------------------------- |
| `activity.read.own` | View own activity                |
| `activity.read.all` | View all users' activity (admin) |

### Notifications

| Permission            | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `notifications.read.own` | Read, mark read/seen, and configure own notifications |
| `notifications.send`  | Publish system-wide announcements (admin only)       |

## Default role grants

### Admin

All permissions.

### Curator

`libraries.*`, `storage.read`, `storage.scan`, `files.read`, `files.stream`, `jobs.read`, `jobs.enqueue`, `metadata.providers.read`, `metadata.providers.write`, `metadata.formatting.read`, `metadata.formatting.write`, `shelves.*`, `shelf.publish`, `activity.read.own`, `notifications.read.own`, `downloads.manage`, `devices.manage`

### Member

`files.read`, `files.stream`, `shelves.read`, `shelves.write`, `activity.read.own`, `notifications.read.own`, `downloads.manage`, `devices.manage`

### Kid

`files.read`, `files.stream`, `shelves.read`, `activity.read.own`, `notifications.read.own`, `downloads.manage`, `devices.manage`

(No admin, metadata provider secrets, integrations, or shelf.publish unless separately granted.)

## Shelf authorization

- **Private:** only the owner can view and edit.
- **Shared:** all authenticated users with `shelves.read` can view; only the owner can edit. Requires `shelf.publish` to create or switch to shared.
- **Collaborative:** all authenticated users with `shelves.read` can view; the owner and users in `shelf_grants` with `canEdit = true` can edit. Only the owner manages the editor list via `/shelves/:id/grants`.
- **Scope:** shelves are global or domain-scoped (`books`, `movies`, etc.). Scope controls eligible membership and where the shelf appears in module UI.
- **Membership:** manual (`shelf_items`) and rule-derived (`membership_expression`) are distinct; rule evaluation respects per-subject field applicability on global shelves.

## CSRF

Cookie sessions require Origin/Referer validation on POST/PATCH/DELETE/PUT. Same-origin production deployment assumed.

## Activity vs audit

- **Activity events:** user-facing; privacy-controlled visibility.
- **Audit events:** admin/security; separate retention policy.

Never use one for the other.
