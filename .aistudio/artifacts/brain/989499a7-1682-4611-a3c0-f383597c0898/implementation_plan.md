# Implementation Plan: Payment & Loan Installment Receipt Generator & Analytics

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

3. **Loan Payment WhatsApp Acknowledgment Installment (EMI) Number**:
   - Calculated which installment number (e.g., 1st EMI, 2nd EMI, 3rd EMI, etc.) is being paid based on loan repayment schedule, sanction date, and paid history.
   - Updated `*Unnati Trust - Loan Payment Acknowledgment*` and `*Unnati Trust - Loan Payment Approved*` WhatsApp messages:
     - Opening sentence now states: `Your 1st EMI repayment of ₹...` (or 2nd EMI, 3rd EMI, etc.)
     - Bullet list includes: `• Installment: 1st EMI` (or `${getOrdinal(emiNumber)} EMI (Extra Principal)` for extra principal repayments).

4. **Principal Recovery Dynamic Progress Bar**:
   - Integrated directly into the **Principal vs. Interest Recovery Analytics** ribbon at the bottom of the 4 cards.
   - Calculates the exact percentage of the principal repaid by the selected member (`(repaidPrincipalAllTime / sanctionedAmount) * 100`).
   - Displays a vibrant gradient fill from **orange (0%)** through amber to **green (100%)**.
   - Includes badge with percentage/repayment status, a currency breakdown (Repaid), and milestone markers (0% Sanctioned to 100% Cleared).

5. **Payment Receipt Text & Header Alignments**:
   - **Payment Status**: Changed from `"SUCCESSFULLY RECEIVED & RECORDED"` to `"PAID"` in both Contribution and Loan Repayment PDF receipts.
   - **Payment Mode Label**: Changed from `"Repayment Mode:"` to `"Payment Mode:"` in LOAN INSTALLMENT REPAYMENT RECEIPT.
   - **Column Header Consistency**: Made the 2nd column header `"Particulars"` in both receipts (`PAYMENT RECEIPT (MONTHLY CONTRIBUTION)` and `LOAN INSTALLMENT REPAYMENT RECEIPT`).
   - **Column Label Simplifications**:
     - In Contribution Receipt: `"Payment Mode"` -> `"Mode"`.
     - In Loan Receipt: `"Installment Schedule"` -> `"Installment"`, `"Principal Amount"` -> `"Principal"`, `"Interest (0.5%)"` -> `"Interest"`, `"Net Amount (Rs.)"` -> `"Net Amount"`.
     - In Loan Receipt row description: `"Monthly Loan Principal & Interest Repayment"` -> `"Loan Principal & Interest Repayment"`.
   - **Short Month Names**: Formatted months as 3-letter abbreviations (`Jan`, `Feb`, `Mar`, ... `Nov`, `Dec`) across both receipts.
