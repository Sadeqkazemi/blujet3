# IT employee unit access

## Goal

The IT manager creates an employee account under an organizational unit and
grants capabilities from the same real surfaces that exist in that unit
manager's panel. The employee must see and call only the granted surfaces.

## Unit ownership

| Employee unit | Owning manager panel | Grant catalog source |
| --- | --- | --- |
| Commercial | Commercial Manager | Commercial capabilities |
| Sales | Commercial Manager | Commercial capabilities |
| Finance | Finance Manager | Finance capabilities |
| IT | IT Manager | IT capabilities |

Custom units start without a permission catalog. They cannot receive an
unmapped permission accidentally.

## Acceptance criteria

- The create form contains full name, username, mobile, initial password,
  position/unit, organizational rank, referral scope and grouped permissions.
- Unit cards identify the owning manager panel and changing a unit clears
  permissions selected from the previous unit.
- The catalog names every real surface in the owning manager panel and the
  action keys are wired to the corresponding controllers with
  `EmployeePermissionGuard`/`@RequiresPermission`. Legacy umbrella grants
  remain accepted for backwards compatibility, while a new action grant only
  unlocks its own route (plus the documented read prerequisite).
- The create API rejects unknown or cross-unit permission keys instead of
  silently dropping them.
- After creation, `GET /panels/nav` is computed from the employee's live grants.
- Revoking a grant removes the related navigation item on the next nav request
  and the protected API returns 403 immediately.
- Read-only and write capabilities remain distinct (`fl_view` does not permit
  flight mutations; `fl_manage` does). A write grant implies the read access
  required to load that same management surface.
- IT employees with `us_manage`, `sv_control`, `sc_manage`, or `lg_view` receive
  only the corresponding IT surface, not the full IT Manager panel.
- The users page includes the reference employee table, access-level policy
  matrix, IT scope card and password-management card.
- A real end-to-end test proves create -> login -> allowed nav/API -> denied
  nav/API -> revoke behavior.
- IT can delete an employee account through a confirmed archive action. The
  account disappears from the roster, all grants and sessions are revoked,
  login identifiers are released for reuse, and its audit/business history is
  retained.

## Security invariants

- Frontend navigation is not authorization. Every employee API remains guarded
  by `EmployeePermissionGuard` and `@RequiresPermission`.
- Employee permissions are looked up live; they are not embedded permanently in
  the access token.
- IT cannot grant a permission outside the selected employee unit.
- IT cannot grant itself access to CEO, Senior Manager, or Board Chair panels.
- Employee mobile remains mandatory because staff login uses mandatory 2FA.
- Account deletion is a soft archive (`deletedAt` plus `isActive = false`), not
  a destructive database delete; archived employees cannot be fetched,
  reactivated, or authenticated.
