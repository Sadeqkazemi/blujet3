# Price calendar and saved-passenger regression fixes

## Acceptance checklist

- [x] Clicking a price-calendar day immediately selects it and paints its card blue.
- [x] Selecting a visible day updates the flight-search date without refetching or shifting the calendar window.
- [x] The left control always goes to previous days and uses a left-pointing chevron.
- [x] The right control always goes to next days and uses a right-pointing chevron.
- [x] Arrow placement and behavior are identical in Persian, English, and Arabic.
- [x] Previous/next navigation remains available for every API-backed date window.
- [x] Selecting a compatible legacy saved passenger fills both Latin first-name and last-name inputs.
- [x] A Persian native name is never copied into a Latin ticket-name field as a fallback.
- [x] Focused and full frontend regression tests pass.
