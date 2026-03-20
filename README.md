# LoanTracker (Special Loans Edition)

A specialized React/Vite application designed to digitize complex legacy loan ledgers dating back to 2012. This version of the tracker focuses exclusively on **Special Loans**—interest-only loans where members can take multiple top-ups and make partial principal payments at any time.

## 🌟 Key Features

*   **Dynamic Principal Tracking:** Outstanding balances are calculated on-the-fly based on original principal + top-ups - principal repayments.
*   **Manual Interest Proration:** Supports overwriting standard monthly interest amounts to account for 15-day or 20-day partial borrowing periods.
*   **No Auto-Late Fees:** Designed to perfectly match historical handwritten books, the system will never auto-calculate late fees. Late fees are only recorded if explicitly provided by the operator.
*   **Chronological Audit Trail:** Dedicated views to track every disbursement and repayment event historically.

## 🚀 Quick Start

### 1. Prerequisites
*   Node.js (v18+)
*   A [Supabase](https://supabase.com/) project to host the PostgreSQL database.

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy the sample environment file and add your Supabase credentials:
```bash
cp .env.example .env
```
Open `.env` and fill in:
*   `VITE_SUPABASE_URL`
*   `VITE_SUPABASE_ANON_KEY`

### 4. Run the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173`. The default operator login code is managed within your Supabase `app_settings` table.

---

## 🛠️ Tech Stack
*   **Framework:** React 19
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS + Lucide React Icons
*   **Build Tool:** Vite 6
*   **Database & Auth:** Supabase (Client-side)

## 🐛 Troubleshooting Common Issues

### 1. IDE Errors (VS Code / WSL)
If your IDE reports TypeScript errors like `Cannot find module 'react'` even though builds succeed:
- Open VS Code Command Palette (`Ctrl + Shift + P`).
- Search for and execute **"TypeScript: Restart TS server"**.

### 2. Blank UI Post-Deployment
If the UI is blank after building:
- Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were present in your environment **during** `npm run build`.
- Check the browser console. The app is designed to log initialization errors rather than crashing.
- **WSL Route Issues**: The app uses relative pathing (`./`). If you are serving from a path, ensure your server is configured to resolve assets relatively.

## 📄 Documentation
For detailed business logic and architectural decisions, refer to the [Product Requirements Document (PRD.md)](./PRD.md).

## 🗄️ Database Setup & Security

The application requires a specific schema and security configuration to function with Supabase.

1.  Open your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Navigate to the **SQL Editor**.
3.  Copy and run the contents of [migration.sql](file:///mnt/d/VibeCodeProjects/LoanTracker/migration.sql).

**What this script does:**
- **Recreates Tables**: Sets up `members`, `loans`, `payments`, etc., with the correct types.
- **Enables Security**: Activates Row Level Security (RLS) to remove the "UNRESTRICTED" warning.
- **Grants Access**: Adds policies to allow your web app (via the `anon` key) to read and write data.
- **Idempotency**: Safe to run multiple times; it will only add missing pieces.
