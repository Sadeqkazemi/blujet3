# Bank accounts (حساب‌های بانکی)

Design: `design-reference-v2/پنل کاربر.dc.html` → `isBanks` tab.

## Acceptance checklist

- [x] `GET /my/bank-accounts` — USER only; returns `{ id, bankName, bankShort, brandColor, cardMasked, sheba, shebaMasked, isDefault, createdAt, updatedAt }` — `bank-accounts.e2e-spec.ts`
- [x] `POST /my/bank-accounts` — body `{ cardNo, sheba, bankName? }`; validates 16-digit card + mod-97 sheba; max 5 per user; first row is default; 409 duplicate sheba — `bank-accounts.e2e-spec.ts`
- [x] `PATCH /my/bank-accounts/:id` — `{ isDefault?: true }` clears other defaults — `bank-accounts.e2e-spec.ts`
- [x] `DELETE /my/bank-accounts/:id` — owner-only; promotes next row to default when deleting default — `bank-accounts.e2e-spec.ts`
- [x] Staff roles get 403 — `bank-accounts.e2e-spec.ts`
- [x] Card PAN + sheba encrypted at rest; sheba deduped via hash — `bank-accounts.e2e-spec.ts`
- [x] Frontend: `AccountBankAccountsTab` on `AccountPage` `banks` tab (list + inline add form + default badge + remove) — `AccountPage.test.tsx`
- [x] Persian digit input normalized server-side — `iban.util.spec.ts`
