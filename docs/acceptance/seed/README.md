# Test data (Development environment)

Seeded 2026-10-15 for the test plan (`docs/TEST_PLAN.md`). All names start with `TEST` so they are easy to find and remove.

| Kind | Name | Habit it exercises |
|---|---|---|
| Customer | TEST Alpha Pallets Ltd | Whole pallets, ambient, about 30 days |
| Customer | TEST Beta Cartons BV | Mixed cartons and boxes on shared pallets, about 14 days |
| Customer | TEST Gamma Cold Foods | Cold goods in crates, 90-day stay |
| Transporter | TEST Carrier North (client-own) | Client brings its own carrier |
| Transporter | TEST Carrier South (client-own) | Second client carrier (two drivers, same day) |
| Transporter | TEST Warehouse Haulage (warehouse-contracted) | Warehouse books the carrier |

Warehouses and locations already exist (Rotterdam DC1/DC2, Hamburg DC, Antwerp DC; DC2, Hamburg and Antwerp each have 48 locations in 2 zones). Users for the access tests (Manager in one warehouse, Operator in another, one with no assignment) are created from Administration with a second email address.

Browser tests create their own inbounds and outbounds and label them `AUTOTEST` in the customer reference.

## Running the browser tests

1. `cd client-src`
2. `npm run e2e:login` and sign in in the window that opens (once; repeat if the session expires). Your password is never read or stored; only the signed-in session is saved, in a git-ignored file.
3. `npm run e2e` (set `WOMS_URL` to test the Slate site instead of the default `/app/` site).
