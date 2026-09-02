# Customer account responsive sidebar

## Scope

Expose the existing customer-account destinations in the account sidebar without adding new API or database behavior.

## Acceptance checklist

- [x] On mobile, the account sidebar keeps Profile and Account Information and also shows Trips, Refund Ticket, Wallet, and Loyalty Points/Club. — `AccountPage.test.tsx`: “shows the requested compact navigation in the mobile sidebar and opens its tabs”
- [x] On mobile, advanced account destinations that were not requested (saved flights, price locks, passengers, support, identity, security, bank accounts, and referrals) remain out of the account sidebar. — same responsive-sidebar test
- [x] On desktop, every existing customer-account destination is visible in the account sidebar. — `AccountPage.test.tsx`: “shows every existing account destination in the desktop sidebar”
- [x] Selecting any newly exposed item updates the active tab through the existing `?tab=` navigation. — responsive-sidebar test opens the real refunds tab
- [x] Persian, English, and Arabic sidebar labels remain available. — translated-tab-label tests in `AccountPage.test.tsx`
- [x] The expanded desktop sidebar stays usable on shorter viewports by scrolling within the sticky sidebar. — desktop-sidebar style assertion in `AccountPage.test.tsx`

## Automated proof

- `frontend/src/features/public-site/AccountPage.test.tsx` — responsive and desktop sidebar visibility, translated labels, and tab navigation.
