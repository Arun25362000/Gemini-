# Multi-Month Advance Payments & Automatic Ledger Allocation

Allow Unnati members and administrators to record advance payments covering multiple upcoming months (e.g., 3, 6, or 12 months) in a single consolidated transaction (such as ₹3,000, ₹6,000, or custom amounts), with automated schedule allocation and tagged single-entry ledger tracking.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed during the interactive clarification phase:

- **Supported Payment Streams (Confirmed)**: Both monthly contributions (₹1,000/mo) and active loan repayments/EMIs, including customizable split options when paying both simultaneously.
- **Period Selection Interface (Confirmed)**: Checkboxes to pick individual upcoming months with flexible customization, supplemented by quick 3-month, 6-month, and 12-month preset selectors for high speed.
- **Ledger & Statement Representation (Confirmed)**: Single consolidated ledger entry tagged with the advance coverage span (e.g., *Nov 2026 – Apr 2027 · 6 Months*), maintaining pristine financial ledger clarity without cluttering statement lines.

---

## 1. Overview & Core Concept

Currently, recording monthly contributions or loan EMIs requires recording transactions month-by-month. Members who prefer to clear 3, 6, or 12 months upfront (or pay an entire year's contribution of ₹12,000 at once) face unnecessary friction, and admins must manually execute repeated monthly records.

This feature introduces **Multi-Month Advance Payment Handling**:
- **Consolidated Advance Payment**: Payers can select multiple upcoming months directly via clear multi-select checkboxes or rapid one-tap presets (3, 6, 12 months).
- **Automated Period Allocation**: The total amount is dynamically calculated and allocated across the chosen months. The schedule breakdown visibly marks those future months as "Advance Paid", preventing duplicate reminders or false "due" flags.
- **Unified Single Ledger Record**: Records a single, clean ledger transaction in Firestore with metadata tags detailing the span of months covered (`coveredMonths: [{ month: 11, year: 2026 }, ...], spanText: "Nov 2026 – Apr 2027"`).
- **Schedule Synchronicity**: Future repayment and contribution schedules recognize the advance payment tag and display each covered installment as satisfied with reference to the advance transaction receipt.

---

## 2. User Experience & Visual Design

Following the **SaaS & Financial Dashboard Constitution** (`references/3_saas_dashboard.md`), this flow adheres to zero-pill discipline, tabular numerals (`tabular-nums`), high-contrast hierarchy, and responsive feedback.

### Key User Flows

```
[Member / Admin]
       │
       ▼
[Tap "Record Payment" / "Pay Contribution" / "Pay EMI"]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ Payment Modal: Advance Payment Toggle / Options        │
│                                                        │
│ • Mode: [Online] | [Cash]                              │
│ • Stream: [Contribution (₹1,000/mo)] / [Loan EMI]      │
│ • Quick Presets: [3 Mos (₹3,000)] [6 Mos] [12 Mos]     │
│ • Interactive Month Checkboxes:                        │
│   ☑ Nov 2026 (₹1,000)   ☑ Dec 2026 (₹1,000)            │
│   ☑ Jan 2027 (₹1,000)   ☐ Feb 2027 (₹1,000) ...        │
│                                                        │
│ • Dynamic Total Calculation: ₹3,000 (3 Months)         │
│ • Tag Summary: "Coverage: Nov 2026 – Jan 2027"         │
└────────────────────────────────────────────────────────┘
       │
       ▼
[Confirm Payment]
       │
       ├─► Generates Single Ledger Entry with `advanceSpan`
       ├─► Updates Member's Future Months Status to 'paid' (Advance)
       ├─► Sends 1 Consolidated WhatsApp / SMS Receipt with Span Detail
       └─► Repayment Schedules & Monthly Insights reflect satisfied future state
```

### Visual Styling & Component Hierarchy
- **Month Picker Grid**: Clean multi-column checkbox list with Month Year labels, unboxed metadata, and clear amounts formatted with `font-mono tabular-nums`.
- **Preset Quick Bars**: Segmented control pills allowing 1-tap selection of 3, 6, 12 months or custom selection.
- **Coverage Summary Box**: High-contrast, clean container summarizing:
  - Total Months Selected (e.g., `6 Months`)
  - Effective Span (e.g., `November 2026 – April 2027`)
  - Total Payable (e.g., `₹6,000`)
- **Ledger & Table Presentation**: 
  - Ledger displays the transaction date, member name, payment mode, and a distinctive badge `Advance (6 Months: Nov 2026 – Apr 2027)`.
  - In monthly breakdown matrices and member details, future months covered by this payment display a clean checkmark with a tooltip linking to the parent advance record.

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Ledger Storage Model** | Single ledger document with `coveredPeriods` array and `isAdvance: true` | As chosen by user (Option 3), avoids cluttering ledger views with 12 identical rows while preserving full auditability. | N separate records (creates 12 separate receipt entries and clutter). |
| **Schedule Resolution** | Virtual projection resolution based on active advance spans | When calculating whether a given month is paid, the system checks both exact month records and overlapping advance payment spans. | Duplicating records in DB (risks sync mismatches and double-counting totals in financial summaries). |
| **Split Allocation** | Allow distinct checkboxes for monthly contributions and loan EMIs | Allows members with both a recurring contribution and a loan to pay both ahead or pay one stream independently. | Enforcing linked payments only. |

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           UI Layer (React 19)                             │
├─────────────────────────────────────┬─────────────────────────────────────┤
│  PaymentModal                       │  MemberLedger & Schedules           │
│  - Stream Selector (Contrib/Loan)   │  - Month-by-month status resolver   │
│  - Month Multi-Select Checkboxes    │  - Advance coverage badge indicator │
│  - Dynamic Amount Breakdown         │  - Consolidated receipt generator   │
└──────────────────┬──────────────────┴──────────────────▲──────────────────┘
                   │                                     │
                   ▼                                     │
┌────────────────────────────────────────────────────────┴──────────────────┐
│                     Payment Resolution Service                            │
│  - `calculateAdvanceCoverage(months, stream, baseAmount)`                 │
│  - `isMonthCoveredByAdvance(userId, month, year, stream)`                 │
│  - `recordAdvancePayment(payload)`                                        │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      Firestore Persistent Layer                           │
│  • `/contributions/{id}`: `{ amount, coveredMonths: [...], isAdvance }`   │
│  • `/loanPayments/{id}`: `{ amount, coveredMonths: [...], isAdvance }`    │
│  • Consolidated WhatsApp Receipt Payload Builder                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Model Enhancements

1. **`Contribution` Interface**:
   ```typescript
   export interface Contribution {
     id?: string;
     userId: string;
     userEmail: string;
     month: number;
     year: number;
     amount: number;
     status: 'paid' | 'pending';
     paymentMethod?: 'cash' | 'online';
     timestamp: any;
     // Advance Payment Metadata:
     isAdvance?: boolean;
     coveredMonths?: Array<{ month: number; year: number; amount: number }>;
     advanceSpanText?: string; // e.g. "Nov 2026 – Apr 2027 (6 Months)"
   }
   ```

2. **`LoanPayment` Interface**:
   ```typescript
   export interface LoanPayment {
     id?: string;
     loanId: string;
     userId: string;
     month: number;
     year: number;
     amount: number;
     interest: number;
     status: 'paid' | 'pending';
     timestamp: any;
     // Advance Payment Metadata:
     isAdvance?: boolean;
     coveredMonths?: Array<{ month: number; year: number; principal: number; interest: number }>;
     advanceSpanText?: string;
   }
   ```

3. **Status Query Resolution**:
   - `isUserMonthPaid(userId, month, year)` checks if a direct record exists **OR** if any advance contribution has `{ month, year }` in its `coveredMonths` list.
   - Financial summaries correctly account for the advance payment in total collections while attributing the forward balances accurately.
   - Prevents false "due" warnings and exclusion from reminder batches for months covered in advance.

### Security Rules Validation
- Ensure Firestore rules allow the optional `isAdvance`, `coveredMonths`, and `advanceSpanText` fields in `contributions` and `loanPayments` without triggering rule validation rejections.
