"""
Financial model — mirrors web/src/api/client.ts computeUnderwriting() exactly.
Both TS and Python must return identical numbers for identical inputs.
"""
from ..schemas.underwriting import UnderwritingInputs, UnderwritingOutputs, ScenarioOutput


def compute_underwriting(i: UnderwritingInputs) -> UnderwritingOutputs:
    down_amount = i.purchase_price * (i.down_payment_pct / 100)
    loan_amt = i.purchase_price - down_amount
    monthly_rate = i.interest_rate / 100 / 12
    num_payments = 180 if i.loan_type == "15yr Fixed" else 360

    if i.loan_type == "Interest Only":
        mortgage = loan_amt * monthly_rate
    else:
        if monthly_rate == 0:
            mortgage = loan_amt / num_payments
        else:
            mortgage = loan_amt * (monthly_rate * (1 + monthly_rate) ** num_payments) / (
                (1 + monthly_rate) ** num_payments - 1
            )

    vacancy_loss = i.monthly_rent * (i.vacancy_pct / 100)
    egi = i.monthly_rent - vacancy_loss
    mgmt_cost = egi * (i.management_pct / 100)
    tax_mo = (i.purchase_price * 0.022) / 12
    maintenance_mo = (i.purchase_price * (i.maintenance_pct / 100)) / 12
    capex_mo = egi * (i.capex_pct / 100)
    total_opex = mgmt_cost + tax_mo + i.insurance_monthly + maintenance_mo + capex_mo
    noi = egi - total_opex
    cash_flow = noi - mortgage
    coc_return = ((cash_flow * 12) / (down_amount + 8500)) * 100
    cap_rate = ((noi * 12) / i.purchase_price) * 100
    grm = i.purchase_price / (i.monthly_rent * 12) if i.monthly_rent else 0
    dscr = noi / mortgage if mortgage else 0

    scenario_defs = [
        {"name": "Bear", "rent_adj": -0.10, "vac_adj": 4, "apr_adj": -2},
        {"name": "Base", "rent_adj": 0.0,   "vac_adj": 0, "apr_adj": 3},
        {"name": "Bull", "rent_adj": 0.10,  "vac_adj": -2, "apr_adj": 6},
    ]
    scenarios = []
    for s in scenario_defs:
        r = i.monthly_rent * (1 + s["rent_adj"])
        v = i.vacancy_pct + s["vac_adj"]
        e2 = r * (1 - v / 100)
        op = e2 * (i.management_pct / 100) + tax_mo + i.insurance_monthly + maintenance_mo + capex_mo
        n2 = e2 - op
        cf = n2 - mortgage
        irr = ((cf * 12) / (down_amount + 8500)) + (
            s["apr_adj"] / 100 * (i.purchase_price / (down_amount + 8500))
        )
        scenarios.append(
            ScenarioOutput(
                name=s["name"],
                cash_flow=cf,
                irr=irr * 100,
                cap_rate=(n2 * 12 / i.purchase_price) * 100,
            )
        )

    if cash_flow > 200 and coc_return > 6:
        recommendation = "Strong Buy"
    elif cash_flow > 0 and coc_return > 4:
        recommendation = "Buy with Negotiation"
    elif cash_flow > -100:
        recommendation = "Marginal"
    else:
        recommendation = "Avoid"

    return UnderwritingOutputs(
        cash_flow=cash_flow,
        cap_rate=cap_rate,
        cash_on_cash=coc_return,
        dscr=dscr,
        grm=grm,
        noi=noi,
        mortgage=mortgage,
        total_expenses=total_opex,
        effective_gross_income=egi,
        break_even_rent=mortgage + total_opex,
        break_even_occupancy=((mortgage + total_opex) / i.monthly_rent * 100) if i.monthly_rent else 0,
        expense_ratio=(total_opex / egi * 100) if egi else 0,
        total_cash_to_close=down_amount + 8500,
        annual_cash_flow=cash_flow * 12,
        recommendation=recommendation,
        scenarios=scenarios,
    )
