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

## 🐛 Troubleshooting IDE Errors (VS Code / WSL)

If your IDE reports TypeScript errors like `Cannot find module 'react'` or `JSX element implicitly has type 'any'` **even though `npm run dev` and `npx tsc --noEmit` build successfully**, your IDE's built-in TypeScript language server is caching a failed module resolution schema.

**To permanently resolve this:**
1. Open VS Code Command Palette (`Ctrl + Shift + P` or `Cmd + Shift + P`).
2. Search for and execute **"TypeScript: Restart TS server"**.
3. (Alternatively) Completely close and reopen the VS Code window attached to your WSL instance.

*Note: The project's `tsconfig.json` has been specifically tailored with `moduleResolution: node` and explicit `typeRoots` to maximize compatibility with legacy TS servers.*

## 📄 Documentation
For detailed business logic and architectural decisions, refer to the [Product Requirements Document (PRD.md)](./PRD.md).
