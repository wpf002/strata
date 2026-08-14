"""
Financial model — mirrors web/src/api/client.ts computeUnderwriting() exactly.
Both TS and Python must return identical numbers for identical inputs.
"""
from ..schemas.underwriting import UnderwritingInputs, UnderwritingOutputs, ScenarioOutput
from .tax_service import default_tax_rate_pct, monthly_tax


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

    tax_rate_pct = (
        i.property_tax_rate_pct
        if i.property_tax_rate_pct is not None
        else default_tax_rate_pct(i.state)
    )

    vacancy_loss = i.monthly_rent * (i.vacancy_pct / 100)
    egi = i.monthly_rent - vacancy_loss
    mgmt_cost = egi * (i.management_pct / 100)
    tax_mo = monthly_tax(i.purchase_price, tax_rate_pct)
    maintenance_mo = (i.purchase_price * (i.maintenance_pct / 100)) / 12
    capex_mo = egi * (i.capex_pct / 100)
    total_opex = mgmt_cost + tax_mo + i.insurance_monthly + maintenance_mo + capex_mo
    noi = egi - total_opex
    cash_flow = noi - mortgage
    cash_to_close = down_amount + i.closing_costs
    coc_return = ((cash_flow * 12) / cash_to_close) * 100 if cash_to_close else 0.0
    cap_rate = ((noi * 12) / i.purchase_price) * 100 if i.purchase_price else 0.0
    grm = i.purchase_price / (i.monthly_rent * 12) if i.monthly_rent else 0
    # Undefined with no debt rather than 0 — see the schema note.
    dscr = (noi / mortgage) if mortgage else None

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
        # CapEx scales with the scenario's effective gross income, same as
        # management. It previously reused the base-case capex_mo while
        # recomputing management, which understated expenses in Bear and
        # overstated them in Bull.
        capex_2 = e2 * (i.capex_pct / 100)
        op = e2 * (i.management_pct / 100) + tax_mo + i.insurance_monthly + maintenance_mo + capex_2
        n2 = e2 - op
        cf = n2 - mortgage
        year_one = (
            ((cf * 12) / cash_to_close)
            + (s["apr_adj"] / 100 * (i.purchase_price / cash_to_close))
        ) if cash_to_close else 0.0
        scenarios.append(
            ScenarioOutput(
                name=s["name"],
                cash_flow=cf,
                year_one_return=year_one * 100,
                cap_rate=(n2 * 12 / i.purchase_price) * 100 if i.purchase_price else 0.0,
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
        total_cash_to_close=cash_to_close,
        annual_cash_flow=cash_flow * 12,
        recommendation=recommendation,
        scenarios=scenarios,
    )


# ── BRRRR Analysis ────────────────────────────────────────────────────────────

def brrrr_analysis(base: UnderwritingInputs, rehab_cost: float, arv: float,
                   refi_ltv_pct: float = 75.0, refi_rate: float = 7.0) -> dict:
    ltr = compute_underwriting(base)
    purchase = base.purchase_price
    hold_months = 6
    hard_money_rate = 0.12

    holding_costs = (purchase * hard_money_rate / 12) * hold_months
    total_project_cost = purchase + rehab_cost + holding_costs

    arv_confidence: str
    if arv > purchase * 1.30:
        arv_confidence = "Low"
    elif arv > purchase * 1.15:
        arv_confidence = "Medium"
    else:
        arv_confidence = "High"

    refi_loan_amount = arv * (refi_ltv_pct / 100)

    # `equity_captured` was `arv - refi_loan_amount - purchase - rehab_cost`,
    # which subtracts the project cost twice (once directly, once via the loan
    # that funded it). On a textbook-profitable BRRRR — 300k purchase, 50k
    # rehab, 450k ARV — it reported -$237,500 of "equity captured" against
    # roughly +$82k of real value creation, i.e. it made good deals look
    # catastrophic. Two distinct, correct figures now:
    #   value created  = ARV - everything spent to get there
    #   equity retained = ARV - the new loan against it
    equity_captured = arv - total_project_cost
    equity_retained = arv - refi_loan_amount
    cash_left_in_deal = max(0, total_project_cost - refi_loan_amount)
    equity_capture_pct = (equity_captured / total_project_cost * 100) if total_project_cost else 0

    # Post-refi cash flow
    refi_monthly_rate = refi_rate / 100 / 12
    refi_payments = 360
    if refi_monthly_rate == 0:
        refi_mortgage = refi_loan_amount / refi_payments
    else:
        refi_mortgage = refi_loan_amount * (
            refi_monthly_rate * (1 + refi_monthly_rate) ** refi_payments
        ) / ((1 + refi_monthly_rate) ** refi_payments - 1)

    vacancy_loss = base.monthly_rent * (base.vacancy_pct / 100)
    egi = base.monthly_rent - vacancy_loss
    tax_rate_pct = (
        base.property_tax_rate_pct
        if base.property_tax_rate_pct is not None
        else default_tax_rate_pct(base.state)
    )
    tax_mo = monthly_tax(purchase, tax_rate_pct)
    maintenance_mo = (purchase * (base.maintenance_pct / 100)) / 12
    capex_mo = egi * (base.capex_pct / 100)
    total_opex = (
        egi * (base.management_pct / 100)
        + tax_mo
        + base.insurance_monthly
        + maintenance_mo
        + capex_mo
    )
    noi = egi - total_opex
    post_refi_cash_flow = noi - refi_mortgage
    post_refi_dscr = noi / refi_mortgage if refi_mortgage else None
    brrrr_roe = (post_refi_cash_flow * 12 / cash_left_in_deal * 100) if cash_left_in_deal > 0 else 0

    return {
        **ltr.model_dump(),
        "rehabCost": rehab_cost,
        "arv": arv,
        "arvConfidence": arv_confidence,
        "refiLtvPct": refi_ltv_pct,
        "refiRate": refi_rate,
        "holdingCosts": round(holding_costs),
        "totalProjectCost": round(total_project_cost),
        "refiLoanAmount": round(refi_loan_amount),
        "equityCaptured": round(equity_captured),
        "equityRetained": round(equity_retained),
        "cashLeftInDeal": round(cash_left_in_deal),
        "equityCapturePct": round(equity_capture_pct, 1),
        "postRefiCashFlow": round(post_refi_cash_flow, 2),
        "postRefiDscr": round(post_refi_dscr, 2) if post_refi_dscr is not None else None,
        "brrrrReturnOnEquity": round(brrrr_roe, 1),
    }


# ── Flip Analysis ─────────────────────────────────────────────────────────────

def flip_analysis(purchase_price: float, rehab_cost: float, arv: float,
                  hold_months: int = 6, financing_rate: float = 0.12,
                  agent_commission_pct: float = 0.055) -> dict:
    holding_costs = (purchase_price * financing_rate / 12) * hold_months
    financing_costs = holding_costs  # interest-only on purchase
    closing_costs_buy = purchase_price * 0.02
    closing_costs_sell = arv * 0.01

    total_cost = purchase_price + rehab_cost + holding_costs + financing_costs + closing_costs_buy
    gross_profit = arv - total_cost
    agent_fees = arv * agent_commission_pct
    net_profit = gross_profit - agent_fees - closing_costs_sell

    return_on_cost = (net_profit / total_cost * 100) if total_cost else 0
    annualized_return = return_on_cost * (12 / hold_months) if hold_months else 0
    break_even_arv = total_cost + agent_fees + closing_costs_sell

    return {
        "purchasePrice": purchase_price,
        "rehabCost": rehab_cost,
        "arv": arv,
        "holdMonths": hold_months,
        "financingRate": financing_rate,
        "agentCommissionPct": agent_commission_pct,
        "holdingCosts": round(holding_costs),
        "financingCosts": round(financing_costs),
        "totalCost": round(total_cost),
        "grossProfit": round(gross_profit),
        "agentFees": round(agent_fees),
        "netProfit": round(net_profit),
        "returnOnCost": round(return_on_cost, 1),
        "annualizedReturn": round(annualized_return, 1),
        "breakEvenArv": round(break_even_arv, -2),
    }


# ── STR Analysis ──────────────────────────────────────────────────────────────

def str_analysis(base: UnderwritingInputs,
                 nightly_rate_low: float, nightly_rate_mid: float, nightly_rate_high: float,
                 occupancy_low: float = 0.55, occupancy_mid: float = 0.70, occupancy_high: float = 0.82,
                 platform_fee_pct: float = 0.03,
                 cleaning_fee_per_stay: float = 120.0,
                 avg_stay_nights: float = 3.5) -> dict:
    ltr = compute_underwriting(base)

    stays_per_month_low = (30 * occupancy_low) / avg_stay_nights
    stays_per_month_mid = (30 * occupancy_mid) / avg_stay_nights
    stays_per_month_high = (30 * occupancy_high) / avg_stay_nights

    def monthly_str_revenue(rate, occ, stays):
        """
        Net rental revenue. Cleaning fees are pass-through: the guest pays
        them and the cleaner is paid out of them, so they belong in neither
        side of the model by default.

        This previously did `gross - platform_cut + cleaning`, adding the
        cleaning collection as income while booking no cleaning expense
        anywhere — about $720/month of invented revenue on a typical listing
        (6 stays at $120), inflating STR revenue by roughly 16% and every
        STR cap rate with it.
        """
        gross = rate * 30 * occ
        platform_cut = gross * platform_fee_pct
        cleaning_collected = stays * cleaning_fee_per_stay
        cleaning_paid_out = cleaning_collected  # pass-through
        return gross - platform_cut + cleaning_collected - cleaning_paid_out

    str_monthly_low = monthly_str_revenue(nightly_rate_low, occupancy_low, stays_per_month_low)
    str_monthly_mid = monthly_str_revenue(nightly_rate_mid, occupancy_mid, stays_per_month_mid)
    str_monthly_high = monthly_str_revenue(nightly_rate_high, occupancy_high, stays_per_month_high)

    purchase = base.purchase_price

    def str_cap_rate(monthly_rev: float) -> float:
        # Reuse LTR opex but replace rent with STR revenue
        vacancy_loss = 0  # vacancy already baked into occupancy
        egi = monthly_rev
        tax_rate_pct = (
            base.property_tax_rate_pct
            if base.property_tax_rate_pct is not None
            else default_tax_rate_pct(base.state)
        )
        tax_mo = monthly_tax(purchase, tax_rate_pct)
        maintenance_mo = (purchase * (base.maintenance_pct / 100)) / 12
        capex_mo = egi * (base.capex_pct / 100)
        mgmt_str = egi * 0.20  # STR mgmt typically 20%
        opex = mgmt_str + tax_mo + base.insurance_monthly * 1.3 + maintenance_mo + capex_mo
        noi = egi - opex
        return (noi * 12 / purchase * 100) if purchase else 0

    cap_low = str_cap_rate(str_monthly_low)
    cap_mid = str_cap_rate(str_monthly_mid)
    cap_high = str_cap_rate(str_monthly_high)

    ltr_mid = ltr.effective_gross_income
    str_vs_ltr_premium = ((str_monthly_mid - ltr_mid) / ltr_mid * 100) if ltr_mid else 0

    # Occupancy break-even (what occ rate equals LTR income)
    if nightly_rate_mid > 0:
        occ_break_even = ltr_mid / (nightly_rate_mid * 30) * 100
    else:
        occ_break_even = 100.0

    return {
        **ltr.model_dump(),
        "nightlyRateLow": nightly_rate_low,
        "nightlyRateMid": nightly_rate_mid,
        "nightlyRateHigh": nightly_rate_high,
        "occupancyLow": occupancy_low,
        "occupancyMid": occupancy_mid,
        "occupancyHigh": occupancy_high,
        "platformFeePct": platform_fee_pct,
        "strMonthlyRevenueLow": round(str_monthly_low),
        "strMonthlyRevenueMid": round(str_monthly_mid),
        "strMonthlyRevenueHigh": round(str_monthly_high),
        "strAnnualRevenueLow": round(str_monthly_low * 12),
        "strAnnualRevenueMid": round(str_monthly_mid * 12),
        "strAnnualRevenueHigh": round(str_monthly_high * 12),
        "strCapRateLow": round(cap_low, 2),
        "strCapRateMid": round(cap_mid, 2),
        "strCapRateHigh": round(cap_high, 2),
        "strVsLtrPremium": round(str_vs_ltr_premium, 1),
        "occupancyBreakEven": round(occ_break_even, 1),
        "ltrMonthlyRevenue": round(ltr_mid),
        "ltrCapRate": round(ltr.cap_rate, 2),
    }
