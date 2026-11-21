# SuryaDesk

SuryaDesk tracks rooftop solar work from the public enquiry through survey, quotation, order, payment, serialized dispatch, delivery, signed installation, and after-sales service. It runs locally with React, Express, Prisma, and PostgreSQL.

## Local setup

Prerequisites are Node.js 22.12+ on the 22.x release line, npm, and a running local PostgreSQL instance. The included Prisma version is 7.10.1.

1. Create an empty local PostgreSQL database and a dedicated local database user. Keep the database on loopback.
2. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` for your local instance, set a random `JWT_SECRET` of at least 32 characters, and set a local `SEED_DEMO_PASSWORD` of at least 12 characters and at most 72 bytes if you want a repeatable demo login.
3. Run the backend setup from the project root.

   ```powershell
   npm.cmd --prefix backend ci
   npm.cmd --prefix backend run db:generate
   npm.cmd --prefix backend run db:migrate
   npm.cmd --prefix backend run db:seed
   npm.cmd --prefix frontend ci
   ```

4. Start the two processes in separate terminals.

   ```powershell
   npm.cmd --prefix backend run dev
   npm.cmd --prefix frontend run dev
   ```

Open `http://localhost:5173` for the public landing page. It links to **Request a quote**, **Track order**, and **Staff sign in**. The frontend proxies `/api` to the local Express server. If port 5173 is already in use, append `-- --port 55173` to the frontend dev command. If you change the API port, set `SURYADESK_API_TARGET` for the Vite process to the corresponding URL. In a production-style build, serve the SPA and proxy `/api` to Express on the same origin, or supply `VITE_API_BASE` when building and configure the API CORS origin accordingly.

Admin, Sales, and Finance can open an order and select **Share tracking link**. Customers can open that link directly or paste it into **Track order**. The link is private to its holder, covers one order and its equipment warranties, and expires after 30 days. Staff share it through their usual customer communication channel.

## Demo data

Role accounts use `<role>@demo.suryadesk.test` for admin, director, sales, surveyor, warehouse, technician, support, and finance. Use the password configured for the first seed. If you omit it, the seed prints a generated password when it first creates the accounts. Reruns preserve existing users and records.

The seed includes 25 staff, 200 customers, 300 enquiries, 195 surveys, 183 quotations, 120 orders, 20 package templates, 21 products, 991 serialized units, 20 suppliers, 60 purchase orders, 40 signed installations with 80 labeled synthetic evidence files, and 100 service tickets. Equipment sizing, financial amounts, customer details, and work logs are fictional. Choose **Last 365 days** on the overview to inspect historical collections and profitability.

The demo can be used to exercise the workflow:

- Sales can qualify an enquiry, schedule a survey, create and issue a package quotation, record acceptance, and convert it into an order.
- Search for `QUO-0181`, `QUO-0182`, or `QUO-0183` to try **Create order** on an accepted quotation. For an existing seeded database, run `npm.cmd --prefix backend run db:seed -- --pending-order-quotes` to add these examples without resetting the demo.
- Warehouse can record stock receipts, allocate the order bill of materials by quantity and serial, record dispatch, and confirm delivery. Eligible warranties start at delivery.
- Assigned technicians can record the installation checklist, upload a photo, obtain a drawn signature, and complete the job.
- Support can look up covered equipment, track a ticket, record service charges, and close the ticket after customer confirmation.
- Finance can record collections, issue order invoices, track subsidy paperwork, and download reports.

Access tokens expire after one hour and are held in browser memory. Reloading the page requires signing in again. Local evidence files are saved under `backend/uploads/` by default and downloaded only through authenticated, assignment-aware APIs.

## Checks

```powershell
npm.cmd --prefix backend run test:integration
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e
```

Integration checks use the migrated local database and remove their synthetic fixtures. The Playwright suite uses a seeded development database, `SEED_DEMO_PASSWORD`, Microsoft Edge, and temporary ports 55300 and 55173.

## Implementation notes

- Confirming a quotation creates one order, one dispatch pick queue, and an installation placeholder. Warehouse allocates the full order bill of materials in a single dispatch and needs an advance or full payment for orders with a positive total.
- Contract revenue excludes tax. Cash collections and invoice totals are reported separately. Job profitability uses fulfilled material costs, technician work logs, and explicitly recorded costs. Open jobs show a cost completeness indicator.
- A delivery warranty uses India-local calendar months with an exclusive end timestamp. Covered replacements inherit any remaining term and preserve the links to the returned serial and original warranty.
- The application records quote and invoice issue inside the staff workspace. It provides downloadable report CSVs and tracks subsidy paperwork locally. Staff handle external customer communication and government submission.
- Admin and Finance can download or print invoice PDFs from invoice details and linked orders. Dispatch shows the invoice actions after stock is allocated for users with invoice access. Preparing a PDF from an allocated order reuses its invoice or creates a draft. Finance can issue drafts in **Invoices**. Set the optional `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_PAN`, and `INVOICE_SELLER_GSTIN` fields in `backend/.env` to include seller details.
- Configure tax rates in **Products**, or in **Packages** for services without products. Enter `0` for a zero rate and leave the field blank when the rate is unknown. New quotes split package prices by catalog selling-price weights, round tax on each line, and save the rates and amounts through order conversion and invoicing. Existing quotes retain their original totals. For a previously seeded local database, `npm.cmd --prefix backend run db:seed -- --configure-demo-tax` fills only missing rates on known fictional catalog items with illustrative rates.

## Evaluator walkthrough

For this workspace, keep the existing database and use independent API and web ports. Run each command block in its own PowerShell terminal from the repository root.

If PostgreSQL is stopped:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D .postgres/cluster -l .postgres/server.log -o '-p 55432 -h 127.0.0.1' -w start
```

Backend:

```powershell
$env:PORT = '55300'
npm.cmd --prefix backend run dev
```

Frontend:

```powershell
$env:SURYADESK_API_TARGET = 'http://127.0.0.1:55300'
npm.cmd --prefix frontend run dev -- --host 127.0.0.1 --port 55173
```

Sign in at `http://127.0.0.1:55173/login` as `admin@demo.suryadesk.test`. To retrieve the seeded demo password locally, use `node --env-file=backend/.env -p "process.env.SEED_DEMO_PASSWORD"`. The director, sales, surveyor, warehouse, technician, support, and finance demo accounts use the same password.

1. Send a 3 kW enquiry from `/enquiry`. In Enquiries, find it by customer name, record qualification details, and schedule a survey.
2. Open Dispatch, set the status filter to Allocated, and inspect `DEMO-DSP-0037` for an allocated pick with serials. In Equipment serials, look up `SD-INVERTER-00001` for delivered warranty coverage.
3. Inspect `DEMO-ORD-0001` and its completed installation evidence. In Service tickets, find `DEMO-TKT-0041` and its chargeable service invoice `DEMO-SVC-0041`.
4. Open Overview, choose Last 365 days, inspect job profitability and technician costs, then download the CSV.

### Local demo sign-in

When the frontend runs in Vite development mode on loopback, the sign-in page shows **Demo accounts** if `SEED_DEMO_PASSWORD` is configured in `backend/.env` or the development environment. Select a role to fill its seeded email and password, then click **Sign in**. Use the password from the original seed because rerunning the seed preserves existing accounts. The picker is unavailable in production builds.

### Refresh the demo dataset

Run `npm.cmd --prefix backend run db:seed -- --replace-demo` with local PostgreSQL running. This replaces the marked demo business records and regenerates synthetic installation evidence. Existing staff accounts are kept. Foreign-key conflicts, manual uploads on demo records, or stock activity outside the seed prevent the reset from committing.

Use the status filters to find rejected and pending surveys, expired and accepted quotes, cancelled orders, unpaid and partially paid invoices, low-stock products, expired warranties, and covered or billable service tickets. The overview includes recent enquiries as well as historical project and expense records.

For specific test cases, open `DEMO-TKT-0013` to inspect a covered serial replacement, `DEMO-TKT-0041` for an itemized billable service visit, `DEMO-INV-0102` for a draft invoice, and `DEMO-INVERTER-STRING` for an out-of-stock product.
