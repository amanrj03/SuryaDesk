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

Open `http://localhost:5173` for the staff workspace or `http://localhost:5173/enquiry` for the public form. The frontend proxies `/api` to the local Express server. If port 5173 is already in use, append `-- --port 55173` to the frontend dev command. If you change the API port, set `SURYADESK_API_TARGET` for the Vite process to the corresponding URL. In a production-style build, serve the SPA and proxy `/api` to Express on the same origin, or supply `VITE_API_BASE` when building and configure the API CORS origin accordingly.

## Demo data

Role accounts use `<role>@demo.suryadesk.test` for admin, director, sales, surveyor, warehouse, technician, support, and finance. Use the password configured for the first seed. If you omit it, the seed prints a generated password when it first creates the accounts. Reruns preserve existing users and records.

The seed includes staff, 200 customers, 300 enquiries, 150 surveys, 180 quotations, 120 orders, 200 payments, 20 system packages, 500 serialized units, 20 suppliers, 60 purchase orders, shipment and warranty history, crew schedules, 12 completed installations with 24 labeled synthetic evidence files, invoices, subsidies, and 100 service tickets. Names, prices, systems, and contact information are illustrative. The database also contains covered and billable service cases. Choose **Last 180 days** on the overview to inspect historical collections and profitability.

The demo can be used to exercise the workflow:

- Sales can qualify an enquiry, schedule a survey, create and issue a package quotation, record acceptance, and convert it into an order.
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
