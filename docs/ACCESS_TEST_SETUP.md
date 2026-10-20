# Access tests: setting up the second user

Purpose: prove that a person limited to some warehouses sees and can do only what their role allows (test plan A1 to A7).

## 1. Invite the test user (you, as System Administrator, about 3 minutes)

Use a second email address you can open (a plus-address of your own works, e.g. `yourname+staff@gmail.com`).

1. Administration -> **Invite User**.
2. Business role: **Warehouse Staff**.
3. Warehouse access, two rows:
   - **Rotterdam DC2** as **Warehouse Manager**
   - **Hamburg DC** as **Warehouse Operator**
4. Do not give any access to **Antwerp DC** (the test checks it stays hidden).
5. Open the invitation email, accept it and set the password. Sign in once to see the home screen: it should say `Role: Warehouse Staff`.

## 2. Save that user's session for the tests (you, 1 minute)

```
cd client-src
npm run e2e:login:staff
```

A browser window opens. Sign in as the test user (not as yourself). When the home screen shows, the window closes by itself and the terminal says "Saved". Your administrator session (`e2e/.auth/state.json`) is not touched.

## 3. Run

```
npm run e2e -- access.spec.js
```

(Warehouse names can be changed with `WOMS_MANAGER_WH`, `WOMS_OPERATOR_WH`, `WOMS_OTHER_WH`.)

## What it checks

| Test | Plan ID |
|---|---|
| Administrator creates one empty request in each of the three warehouses | set-up |
| The user has role Warehouse Staff, no Administration menu, and the warehouse selector lists Rotterdam DC2 and Hamburg DC but not Antwerp DC | A1, A4, A5 |
| The inbound list shows the Rotterdam and Hamburg requests, not Antwerp's; as Manager in Rotterdam the next step is offered; as Operator in Hamburg it is not | A1, A3 |
| New Inbound is enabled for Rotterdam DC2 and disabled for Hamburg DC | A1 |
| Warehouse Management shows Availability only | A5 |
| A direct link to Antwerp's request says "You don't have access to this warehouse's records" (Slate only) | A3 |

Each run leaves three empty `Requested` inbounds (one per warehouse); delete them from the inbound list when no longer wanted.

## Not covered by this file

A2 (an operator sees only the rows assigned to them), A6 and A7 (removing a warehouse from the user takes effect at the next load) are done by hand: Administration -> Manage access, change the user's warehouses, reload as the user.

## Verified configuration

Run on 2026-10-20 with `zitraar.tech@gmail.com`: Warehouse Supervisor in Hamburg DC, Warehouse Operator in Rotterdam DC2, no access to Antwerp DC (run with `WOMS_MANAGER_WH="Hamburg DC" WOMS_OPERATOR_WH="Rotterdam DC2"`). Catalyst refuses `+` in email addresses; a dotted Gmail address works, but mind the dot position (`zitraa.artech` is a different mailbox from `zitraar.tech`).
