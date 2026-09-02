# Commercial travel services

Source of truth: the approved Commercial Manager screenshots, including the
Services list and inline custom-service form. Repeated screenshots represent
the same states and do not introduce duplicate requirements.

## Acceptance checklist

- [x] The Services page lists baggage, hot meal, insurance, CIP, refund fee,
  pet, wheelchair, and seat selection in the approved RTL layout.
- [x] Existing active and purchase flags can be changed and saved together.
- [x] Prices are entered in تومان and sent to the API as IRR decimal strings.
- [x] Managers can create multiple custom services with independent title,
  description, price, state, and a stable unique code.
- [x] Custom services returned by the backend render safely and can be deleted.
- [x] Backend validation rejects unsupported codes while accepting `PET`,
  `WHEELCHAIR`, and valid `CUSTOM_<identifier>` values.
- [x] Manager mutations remain role-protected; the public endpoint exposes only
  active purchase-enabled services.
- [x] Backend and frontend tests cover fixed and custom services.
- [x] Backend/frontend lint, tests, and production builds pass.
