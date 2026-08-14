#!/usr/bin/env python3
"""
Generate parity fixtures for the underwriting model.

`underwriting_service.py` opens with "mirrors web/src/api/client.ts
computeUnderwriting() exactly. Both TS and Python must return identical numbers
for identical inputs." Nothing enforced that, and the two had already drifted:
at 100% down TypeScript produced Infinity where Python produced 0.

This runs the Python model over a spread of inputs — including the boundaries
reachable from the UI sliders — and writes the results for the TS test to
assert against.

    bin/gen-underwriting-fixtures.py
"""
import json
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.schemas.underwriting import UnderwritingInputs  # noqa: E402
from backend.services.underwriting_service import compute_underwriting  # noqa: E402

DST = ROOT / "web" / "src" / "test" / "fixtures" / "underwriting-parity.json"

CASES = [
    {"name": "typical Dallas SFR", "purchasePrice": 342000, "downPaymentPct": 25, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "TX"},
    {"name": "low-tax state, same deal", "purchasePrice": 342000, "downPaymentPct": 25, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "AZ"},
    {"name": "no state — national default", "purchasePrice": 342000, "downPaymentPct": 25, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5},
    {"name": "explicit tax override", "purchasePrice": 342000, "downPaymentPct": 25, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "TX",
     "propertyTaxRatePct": 0.9},
    {"name": "all cash — no debt service", "purchasePrice": 342000, "downPaymentPct": 100, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "TX"},
    {"name": "minimum down payment", "purchasePrice": 342000, "downPaymentPct": 3.5, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2240, "vacancyPct": 6, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "TX"},
    {"name": "15yr fixed", "purchasePrice": 425000, "downPaymentPct": 20, "interestRate": 6.5,
     "loanType": "15yr Fixed", "monthlyRent": 3100, "vacancyPct": 5, "managementPct": 10,
     "maintenancePct": 1.5, "insuranceMonthly": 180, "capexPct": 6, "state": "FL"},
    {"name": "interest only", "purchasePrice": 500000, "downPaymentPct": 30, "interestRate": 8.0,
     "loanType": "Interest Only", "monthlyRent": 3800, "vacancyPct": 7, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 220, "capexPct": 5, "state": "NV"},
    {"name": "zero interest", "purchasePrice": 250000, "downPaymentPct": 20, "interestRate": 0,
     "loanType": "30yr Fixed", "monthlyRent": 1900, "vacancyPct": 5, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 120, "capexPct": 5, "state": "OH"},
    {"name": "zero rent", "purchasePrice": 250000, "downPaymentPct": 20, "interestRate": 7.0,
     "loanType": "30yr Fixed", "monthlyRent": 0, "vacancyPct": 5, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 120, "capexPct": 5, "state": "TN"},
    {"name": "high vacancy", "purchasePrice": 300000, "downPaymentPct": 25, "interestRate": 7.25,
     "loanType": "30yr Fixed", "monthlyRent": 2200, "vacancyPct": 30, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 140, "capexPct": 5, "state": "GA"},
    {"name": "strong cash flow deal", "purchasePrice": 180000, "downPaymentPct": 40, "interestRate": 6.75,
     "loanType": "30yr Fixed", "monthlyRent": 2600, "vacancyPct": 5, "managementPct": 8,
     "maintenancePct": 1.0, "insuranceMonthly": 130, "capexPct": 5, "state": "AL"},
]


def to_snake(case: dict) -> dict:
    mapping = {
        "purchasePrice": "purchase_price", "downPaymentPct": "down_payment_pct",
        "interestRate": "interest_rate", "loanType": "loan_type",
        "monthlyRent": "monthly_rent", "vacancyPct": "vacancy_pct",
        "managementPct": "management_pct", "maintenancePct": "maintenance_pct",
        "insuranceMonthly": "insurance_monthly", "capexPct": "capex_pct",
        "propertyTaxRatePct": "property_tax_rate_pct", "state": "state",
        "closingCosts": "closing_costs",
    }
    return {mapping[k]: v for k, v in case.items() if k in mapping}


fixtures = []
for case in CASES:
    out = compute_underwriting(UnderwritingInputs(**to_snake(case)))
    d = out.model_dump()
    fixtures.append({
        "name": case["name"],
        "inputs": {k: v for k, v in case.items() if k != "name"},
        "expected": {
            "cashFlow": d["cash_flow"], "capRate": d["cap_rate"],
            "cashOnCash": d["cash_on_cash"], "dscr": d["dscr"], "grm": d["grm"],
            "noi": d["noi"], "mortgage": d["mortgage"],
            "totalExpenses": d["total_expenses"],
            "effectiveGrossIncome": d["effective_gross_income"],
            "breakEvenRent": d["break_even_rent"],
            "breakEvenOccupancy": d["break_even_occupancy"],
            "expenseRatio": d["expense_ratio"],
            "totalCashToClose": d["total_cash_to_close"],
            "annualCashFlow": d["annual_cash_flow"],
            "recommendation": d["recommendation"],
            "scenarios": [
                {"name": s["name"], "cashFlow": s["cash_flow"], "capRate": s["cap_rate"],
                 "yearOneReturn": s["year_one_return"]}
                for s in d["scenarios"]
            ],
        },
    })

DST.parent.mkdir(parents=True, exist_ok=True)
DST.write_text(json.dumps({
    "_comment": (
        "GENERATED by bin/gen-underwriting-fixtures.py from the Python model. "
        "Do not hand-edit. Regenerate whenever the model changes intentionally; "
        "a diff here means the TS and Python implementations disagree."
    ),
    "cases": fixtures,
}, indent=2) + "\n")

print(f"wrote {DST.relative_to(ROOT)} ({len(fixtures)} cases)")
