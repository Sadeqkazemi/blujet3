# Checkout passenger controls and profile deletion

## Acceptance checklist

- [x] The checkout passenger step shows the approved «افزودن مسافر جدید» control. (`CheckoutPage.test.tsx`)
- [x] Adding a passenger immediately renders another passenger card. (`CheckoutPage.test.tsx`)
- [x] When more than one checkout passenger exists, each card has a visible remove control. (`CheckoutPage.test.tsx`)
- [x] Removing a checkout passenger immediately removes that card and keeps at least one passenger. (`CheckoutPage.test.tsx`)
- [x] Checkout pricing and passenger labels use the passenger list after add/remove. (`CheckoutPage.test.tsx`)
- [x] Saved-passenger rows in the user account show an explicit localized remove button. (`AccountPage.test.tsx`)
- [x] Removing a saved passenger calls the existing owned-resource API and removes the row. (`AccountPage.test.tsx`)
- [x] Persian, English, and Arabic labels remain localized. (`PassengerStep.test.tsx`)

## Regression coverage

- `frontend/src/features/public-site/CheckoutPage.test.tsx`
- `frontend/src/features/public-site/checkout/PassengerStep.test.tsx`
- `frontend/src/features/public-site/AccountPage.test.tsx`
