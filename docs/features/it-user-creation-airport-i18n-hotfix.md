# IT user creation and public airport i18n hotfix

## Acceptance checklist

- [x] The IT manager add-user form requires a valid Iranian mobile number and sends it to `POST /it/employees` — `EmployeesPage.test.tsx`.
- [x] `POST /it/employees` normalizes the mobile to E.164, rejects duplicate usernames or mobiles, stores the employee with two-factor authentication enabled, and returns the mobile in the employee detail — `it-manager.e2e-spec.ts`.
- [x] A newly-created employee can immediately start the real staff-login flow and receive a two-factor challenge on the stored mobile — `it-manager.e2e-spec.ts` (`POST /auth/staff/login` assertion).
- [x] The assigned-credentials confirmation shows the mobile that will receive the login code — `EmployeesPage.test.tsx`.
- [x] English airport pickers render both city and airport names in English; Persian API presentation fields never leak into the visible label — `HomeSearchPage.test.tsx` and `airport-cities.test.ts`.
- [x] Arabic airport pickers render both city and airport names in Arabic; Persian API presentation fields never leak into the visible label — `HomeSearchPage.test.tsx` and `airport-cities.test.ts`.
- [x] English and Arabic popular-route cards localize legacy CMS rows whose origin/destination were stored as Persian city names, while navigation still uses valid IATA codes — `HomeSearchPage.test.tsx` and `airport-cities.test.ts`.
- [x] Unknown airports in English/Arabic fall back to the IATA code, not a Persian city or airport name — `airport-cities.test.ts`.
- [x] IT panel routes and navigation remain present; the hotfix does not remove any previously implemented IT section — existing `panel-nav.config.spec.ts` plus successful frontend production build.

## Touched API

- `POST /it/employees`
- `GET /it/employees/:id`
- `POST /auth/staff/login` (regression proof only; response contract unchanged)
- `GET /search/airports` (response contract unchanged; localized at the presentation edge)
- `GET /site-content/public/home` (response contract unchanged; legacy route values normalized at the presentation edge)
