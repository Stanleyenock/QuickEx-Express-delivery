# QuickEx Shipping — React + Vite + Supabase

QuickEx is now a static React/Vite website. It does not require an Express server, Node API deployment, SQLite file, server session secret, or a persistent server disk. Supabase provides authentication and the PostgreSQL database; Vercel hosts the frontend.

## What works

- Fixed administrator account signs in through Supabase Auth.
- The administrator dashboard can create an order and automatically generate a unique `QEX-YYYY-<random-code>` tracking number.
- The administrator can edit shipment/recipient/route details and add status, location, date and note updates.
- Anyone with the tracking number can view the shipment route, current status, ETA and movement history without creating an account.
- Public tracking does not expose recipient email, full address, package contents or comments.
- Customers can register/sign in and see only shipments whose recipient email matches their signed-in email.
- The matching customer can view private shipment information and add a recipient comment.
- PostgreSQL Row Level Security (RLS) protects the underlying tables. Admin-only operations are also checked inside database functions.

## 1. Create and configure Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor → New query**.
3. Open `supabase/schema.sql`, copy the entire file, paste it into the SQL Editor and click **Run**. This creates the tables, indexes, profile trigger, RLS policies and database functions.
4. In **Project Settings → API**, confirm `public` is listed under Exposed schemas. The SQL file includes explicit table/function grants for the Supabase Data API.
5. Open **Authentication → Users → Add user** and create the one administrator account. Use the fixed administrator email and password you intend to keep using. Confirm the user if the dashboard offers that option.
6. Open `supabase/assign-admin.sql`. Replace `YOUR_ADMIN_EMAIL` in both places with the exact email used in step 4, then run that SQL in the Supabase SQL Editor. Confirm the result says `admin`.
7. In **Authentication → URL Configuration**, set the Site URL to your eventual Vercel website address. Add that address to the Redirect URLs list too. You can update it after the first deployment.
8. For immediate customer self-registration during setup, turn off email confirmation in the Supabase Auth email settings. When email confirmation is enabled, customers must confirm their email before they can sign in.

**Important:** Do not create the administrator through the public Sign up form. Public registration creates customer accounts only. The administrator must be added in the Supabase dashboard and then assigned the `admin` role using the SQL above. The browser never contains an administrator password or a Supabase service-role key.

## 2. Connect the local project

1. Install Node.js 24.x from <https://nodejs.org/>. The current Supabase JavaScript client line no longer supports Node.js 20, so use Node 24 locally and on Vercel.
2. Extract the project ZIP and open the `QuickEx-Shipping-React-Vite` folder in VS Code or PyCharm.
3. Open the terminal in that folder.
4. In PowerShell, copy `.env.example` and name the copy `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

5. In Supabase, open **Project Settings → API** (or **API Keys**) and copy the Project URL and the **Publishable key**. A legacy `anon` public key also works. Put them in `.env`:

   ```env
   VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

6. Open `.env` in Notepad, paste your Supabase Project URL and Publishable/anon key, save it, then install packages and start the app:

   ```powershell
   notepad .env
   npm install
   npm run dev
   ```

7. Open the local URL shown by Vite, usually `http://localhost:5173`.

Only the Supabase project URL and publishable/anon key belong in the frontend environment. **Never put the Supabase `service_role` key, database password, JWT secret, or administrator password into a `VITE_` variable or commit them to GitHub.** The publishable/anon key is intended for browser use; RLS is what restricts data access.

## 3. Test before deployment

1. Sign in with the administrator email and password created in Supabase.
2. Open **Create order**, enter a recipient email and delivery details, and create a test order.
3. Copy the new `QEX-...` tracking number.
4. Sign out and test the tracking number from the public tracking form. You should see the route, status, ETA and tracking history, but not the recipient's email/address/package contents.
5. Register a customer account using the exact email used for the test shipment. Sign in and confirm the shipment's private details are visible.
6. As the administrator, change the shipment status and add a location/note. Refresh the public tracking page and confirm that the new update appears.

## 4. Deploy to Vercel

1. Make sure `.env` is not committed. `.gitignore` already excludes it.
2. Create an empty GitHub repository (for example, `quickex-shipping`). In PowerShell, from the project folder, run the following commands and replace the URL with your own repository URL:

   ```powershell
   git init
   git add .
   git commit -m "Prepare QuickEx frontend with Supabase"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/quickex-shipping.git
   git push -u origin main
   ```

   Do not run `git add .env`. The `.gitignore` file excludes it.
3. Sign in to <https://vercel.com>, choose **Add New → Project**, and import the QuickEx GitHub repository.
4. Vercel should detect Vite. Set the project Node.js version to **24.x** under Project Settings → Build and Deployment → Node.js Version. Use these settings if it asks:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
5. Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase Publishable key (or legacy anon public key)
6. Apply the variables to **Production**, **Preview** and **Development** as appropriate, then click **Deploy**.
7. After deployment, copy the Vercel domain (for example `https://your-quickex-site.vercel.app`). Return to Supabase **Authentication → URL Configuration**, set it as the Site URL, and add it to Redirect URLs.
8. If you changed Vercel environment variables after deployment, go to **Deployments**, open the latest deployment menu and redeploy so the new build receives them.

## 5. Updating the website later

Edit the React files locally, run `npm run build`, then push the changes to GitHub. Vercel will build and deploy the frontend automatically. Orders and tracking updates remain in Supabase; they are not stored in the Vercel deployment.

## Migration note

The previous Express/SQLite administrator account is not automatically imported into Supabase Auth. Create the administrator Auth user once as described above, using the same fixed login details if you want to keep them. Customer passwords from the old SQLite database cannot be transferred as Supabase Auth credentials; customers must register/reset their access in Supabase. The old `.env`, SQLite database, Express server and session secrets are intentionally not included in this ZIP.
