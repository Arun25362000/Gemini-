# Implementation Plan: Payment & Loan Installment Receipt Generator

## Completed Features
1. **Contribution Payment Receipts**:
   - `src/lib/contributionReceiptPdfExport.ts`: Generates official A4 receipts for monthly contributions and multi-month advance payments (`UT-REC-...` / `UT-ADV-...`).
   - Integrated in 'Your History' desktop table and mobile cards.
   - Interactive Preview & Print Modal with PDF download and print options.

2. **Loan Installment Repayment Receipts**:
   - `src/lib/loanReceiptPdfExport.ts`: Generates official A4 receipts for loan installment repayments (`UT-EMI-...`).
   - Formats borrower particulars, loan reference, installment schedule number, principal repayment amount, 0.5% monthly interest, grand total, and amount in Indian Rupees in words.
   - Positioned in 'View Schedule' repayment schedule items directly between **Mode** and **Paid ON** across:
     - Admin Desktop View Schedule table
     - Admin Mobile View Schedule card grid
     - Member Loan Dashboard View Schedule grid
   - Provides direct one-click PDF download icon as well as an interactive digital receipt preview modal with native 'Print' and 'Download PDF' actions.
