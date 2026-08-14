"""
The financial model. This had no tests at all, which for an underwriting
product is the highest-risk gap in the codebase — a wrong cap rate is worse
than a missing feature, because it looks authoritative.

Expected values are computed independently here (standard amortization and
NOI/cap-rate definitions), not copied from the implementation's output, so a
regression in the model fails rather than silently updating the baseline.
"""
import math

import pytest

from backend.schemas.underwriting import UnderwritingInputs
from backend.services.underwriting_service import (
    brrrr_analysis,
    compute_underwriting,
    flip_analysis,
)


def inputs(**over) -> UnderwritingInputs:
    base = dict(
        purchase_price=342_000,
        down_payment_pct=25,
        interest_rate=7.25,
        monthly_rent=2_240,
        vacancy_pct=6,
        management_pct=8,
        maintenance_pct=1.0,
        insurance_monthly=140,
        capex_pct=5,
        state="TX",
    )
    base.update(over)
    return UnderwritingInputs(**base)


def amortized_payment(principal: float, annual_rate_pct: float, months: int) -> float:
    """Textbook amortization, derived here rather than imported."""
    r = annual_rate_pct / 100 / 12
    if r == 0:
        return principal / months
    return principal * (r * (1 + r) ** months) / ((1 + r) ** months - 1)


# ── Mortgage ─────────────────────────────────────────────────────────────────

def test_mortgage_matches_standard_amortization():
    o = compute_underwriting(inputs())
    expected = amortized_payment(342_000 * 0.75, 7.25, 360)
    assert o.mortgage == pytest.approx(expected, abs=0.01)
    # Sanity anchor: 256.5k at 7.25% over 30y is ~$1,750/mo.
    assert 1_700 < o.mortgage < 1_800


def test_fifteen_year_costs_more_monthly_than_thirty():
    thirty = compute_underwriting(inputs(loan_type="30yr Fixed"))
    fifteen = compute_underwriting(inputs(loan_type="15yr Fixed"))
    assert fifteen.mortgage > thirty.mortgage
    assert fifteen.mortgage == pytest.approx(amortized_payment(342_000 * 0.75, 7.25, 180), abs=0.01)


def test_interest_only_is_principal_times_monthly_rate():
    o = compute_underwriting(inputs(loan_type="Interest Only"))
    assert o.mortgage == pytest.approx(342_000 * 0.75 * (7.25 / 100 / 12), abs=0.01)


def test_zero_interest_amortizes_evenly_without_dividing_by_zero():
    o = compute_underwriting(inputs(interest_rate=0))
    assert o.mortgage == pytest.approx(342_000 * 0.75 / 360, abs=0.01)


# ── Income and expenses ──────────────────────────────────────────────────────

def test_egi_and_noi_follow_their_definitions():
    i = inputs()
    o = compute_underwriting(i)

    egi = 2_240 * (1 - 0.06)
    assert o.effective_gross_income == pytest.approx(egi, abs=0.01)

    tax = 342_000 * 0.016 / 12          # TX rate from the state table
    expected_opex = egi * 0.08 + tax + 140 + (342_000 * 0.01 / 12) + egi * 0.05
    assert o.total_expenses == pytest.approx(expected_opex, abs=0.01)
    assert o.noi == pytest.approx(egi - expected_opex, abs=0.01)


def test_cap_rate_is_annual_noi_over_price():
    o = compute_underwriting(inputs())
    assert o.cap_rate == pytest.approx((o.noi * 12) / 342_000 * 100, abs=1e-9)


def test_cash_flow_is_noi_less_debt_service():
    o = compute_underwriting(inputs())
    assert o.cash_flow == pytest.approx(o.noi - o.mortgage, abs=1e-9)
    assert o.annual_cash_flow == pytest.approx(o.cash_flow * 12, abs=1e-9)


def test_expense_ratio_excludes_debt_service():
    """Operating expense ratio is opex/EGI — including the mortgage would be wrong."""
    o = compute_underwriting(inputs())
    assert o.expense_ratio == pytest.approx(o.total_expenses / o.effective_gross_income * 100, abs=1e-9)
    assert o.expense_ratio < 100


# ── Property tax by state ────────────────────────────────────────────────────

def test_state_changes_the_tax_and_therefore_the_cap_rate():
    """
    The model applied one national 2.2% rate, so identical deals in different
    states scored identically on the one input that varies most by state.
    """
    tx = compute_underwriting(inputs(state="TX"))   # 1.6%
    az = compute_underwriting(inputs(state="AZ"))   # 0.6%

    assert az.cap_rate > tx.cap_rate
    # A full point of price in annual tax on a 342k property is ~$285/mo.
    assert az.cash_flow - tx.cash_flow == pytest.approx(342_000 * 0.01 / 12, abs=0.01)


def test_explicit_rate_overrides_the_state_default():
    o = compute_underwriting(inputs(state="TX", property_tax_rate_pct=0.5))
    egi = 2_240 * 0.94
    expected_tax = 342_000 * 0.005 / 12
    expected_opex = egi * 0.08 + expected_tax + 140 + (342_000 * 0.01 / 12) + egi * 0.05
    assert o.total_expenses == pytest.approx(expected_opex, abs=0.01)


def test_unknown_state_uses_the_national_default():
    unknown = compute_underwriting(inputs(state="ZZ"))
    none_state = compute_underwriting(inputs(state=None))
    assert unknown.total_expenses == pytest.approx(none_state.total_expenses, abs=1e-9)


# ── DSCR ─────────────────────────────────────────────────────────────────────

def test_dscr_is_noi_over_debt_service():
    o = compute_underwriting(inputs())
    assert o.dscr == pytest.approx(o.noi / o.mortgage, abs=1e-9)


def test_dscr_is_undefined_with_no_debt():
    """
    An all-cash purchase has no debt service. Reporting 0.0 read as the worst
    possible coverage for the safest possible capital structure — and the UI
    then said "Does Not Qualify at 0.00" for a buyer who needs no loan.
    """
    o = compute_underwriting(inputs(down_payment_pct=100))
    assert o.mortgage == 0
    assert o.dscr is None
    assert o.cash_flow > 0  # no mortgage to pay, so it should be positive


# ── Boundary inputs reachable from the UI sliders ────────────────────────────

@pytest.mark.parametrize("down_pct", [3.5, 25, 50, 99.5, 100])
def test_no_nan_or_infinity_across_the_down_payment_slider(down_pct):
    o = compute_underwriting(inputs(down_payment_pct=down_pct))
    numeric = [
        o.cash_flow, o.cap_rate, o.cash_on_cash, o.grm, o.noi, o.mortgage,
        o.total_expenses, o.effective_gross_income, o.break_even_rent,
        o.break_even_occupancy, o.expense_ratio, o.total_cash_to_close,
        o.annual_cash_flow,
    ]
    if o.dscr is not None:
        numeric.append(o.dscr)
    for v in numeric:
        assert not math.isnan(v), f"NaN at {down_pct}% down"
        assert not math.isinf(v), f"Infinity at {down_pct}% down"


def test_zero_rent_does_not_divide_by_zero():
    o = compute_underwriting(inputs(monthly_rent=0))
    assert o.grm == 0
    assert o.break_even_occupancy == 0
    assert o.expense_ratio == 0


# ── Scenarios ────────────────────────────────────────────────────────────────

def test_scenarios_are_ordered_bear_base_bull():
    o = compute_underwriting(inputs())
    bear, base, bull = o.scenarios
    assert (bear.name, base.name, bull.name) == ("Bear", "Base", "Bull")
    assert bear.cash_flow < base.cash_flow < bull.cash_flow
    assert bear.year_one_return < base.year_one_return < bull.year_one_return


def test_base_scenario_cash_flow_matches_the_headline():
    """Base applies no rent or vacancy adjustment, so it must equal the top-line."""
    o = compute_underwriting(inputs())
    base = next(s for s in o.scenarios if s.name == "Base")
    assert base.cash_flow == pytest.approx(o.cash_flow, abs=1e-9)
    assert base.cap_rate == pytest.approx(o.cap_rate, abs=1e-9)


def test_scenario_capex_scales_with_scenario_income():
    """
    CapEx is a percent of EGI, so it must move with the scenario's rent. The
    model reused the base-case figure while recomputing management off the
    scenario, understating Bear expenses and overstating Bull's.
    """
    i = inputs(capex_pct=10)
    o = compute_underwriting(i)
    bear = next(s for s in o.scenarios if s.name == "Bear")

    e2 = (2_240 * 0.90) * (1 - 0.10)  # -10% rent, +4pts vacancy
    tax = 342_000 * 0.016 / 12
    expected_op = e2 * 0.08 + tax + 140 + (342_000 * 0.01 / 12) + e2 * 0.10
    expected_cf = (e2 - expected_op) - o.mortgage
    assert bear.cash_flow == pytest.approx(expected_cf, abs=0.01)


def test_year_one_return_is_not_labelled_irr():
    """A single-period return isn't an IRR; the field name should not claim it."""
    o = compute_underwriting(inputs())
    assert hasattr(o.scenarios[0], "year_one_return")
    dumped = o.scenarios[0].model_dump()
    assert "yearOneReturn" in dumped or "year_one_return" in dumped


# ── Recommendation thresholds ────────────────────────────────────────────────

def test_strong_cash_flow_recommends_buying():
    o = compute_underwriting(inputs(purchase_price=180_000, monthly_rent=2_600, down_payment_pct=40))
    assert o.cash_flow > 200 and o.cash_on_cash > 6
    assert o.recommendation == "Strong Buy"


def test_deeply_negative_cash_flow_recommends_avoid():
    o = compute_underwriting(inputs(purchase_price=900_000, monthly_rent=1_500))
    assert o.recommendation == "Avoid"


# ── BRRRR ────────────────────────────────────────────────────────────────────

def test_brrrr_equity_captured_is_value_created_not_a_double_subtraction():
    """
    Was `arv - refi_loan - purchase - rehab`, which subtracts project cost
    twice. On this deal — 300k + 50k rehab, 450k ARV — it reported -$237,500
    of equity captured on roughly +$82k of real value creation.
    """
    base = UnderwritingInputs(
        purchase_price=300_000, down_payment_pct=25, interest_rate=7.25,
        monthly_rent=2_400, state="TX",
    )
    r = brrrr_analysis(base, rehab_cost=50_000, arv=450_000)

    holding = 300_000 * 0.12 / 12 * 6
    total_cost = 300_000 + 50_000 + holding

    assert r["equityCaptured"] == pytest.approx(round(450_000 - total_cost), abs=1)
    assert r["equityCaptured"] > 0
    assert r["equityRetained"] == pytest.approx(450_000 - 450_000 * 0.75, abs=1)
    assert r["equityCapturePct"] > 0


def test_brrrr_arv_confidence_drops_as_the_arv_assumption_stretches():
    base = UnderwritingInputs(
        purchase_price=300_000, down_payment_pct=25, interest_rate=7.25,
        monthly_rent=2_400, state="TX",
    )
    modest = brrrr_analysis(base, rehab_cost=20_000, arv=330_000)
    stretch = brrrr_analysis(base, rehab_cost=80_000, arv=420_000)
    assert modest["arvConfidence"] == "High"
    assert stretch["arvConfidence"] == "Low"


def test_brrrr_cash_left_in_deal_never_negative():
    base = UnderwritingInputs(
        purchase_price=300_000, down_payment_pct=25, interest_rate=7.25,
        monthly_rent=2_400, state="TX",
    )
    r = brrrr_analysis(base, rehab_cost=10_000, arv=600_000)  # refi exceeds cost
    assert r["cashLeftInDeal"] == 0


# ── Flip ─────────────────────────────────────────────────────────────────────

def test_flip_profit_falls_as_rehab_rises():
    a = flip_analysis(purchase_price=300_000, rehab_cost=40_000, arv=450_000)
    b = flip_analysis(purchase_price=300_000, rehab_cost=90_000, arv=450_000)
    assert a["netProfit"] > b["netProfit"]


def test_flip_longer_hold_costs_more():
    short = flip_analysis(purchase_price=300_000, rehab_cost=40_000, arv=450_000, hold_months=3)
    long = flip_analysis(purchase_price=300_000, rehab_cost=40_000, arv=450_000, hold_months=12)
    assert long["holdingCosts"] > short["holdingCosts"]
    assert long["netProfit"] < short["netProfit"]


# ── STR ──────────────────────────────────────────────────────────────────────

def test_str_cleaning_fees_are_pass_through_not_profit():
    """
    Cleaning is collected from the guest and paid to the cleaner. Counting only
    the inflow added ~$720/month of invented revenue on a typical listing
    (6 stays x $120) and inflated every STR cap rate with it.
    """
    from backend.services.underwriting_service import str_analysis

    base = inputs(monthly_rent=2_240)
    r = str_analysis(base, 180, 220, 260)

    gross = 220 * 30 * 0.70
    expected = gross - gross * 0.03
    assert r["strMonthlyRevenueMid"] == pytest.approx(round(expected), abs=1)


def test_str_cleaning_fee_amount_does_not_change_revenue():
    """Pass-through means the fee level is irrelevant to net revenue."""
    from backend.services.underwriting_service import str_analysis

    base = inputs()
    cheap = str_analysis(base, 180, 220, 260, cleaning_fee_per_stay=50)
    pricey = str_analysis(base, 180, 220, 260, cleaning_fee_per_stay=300)
    assert cheap["strMonthlyRevenueMid"] == pricey["strMonthlyRevenueMid"]


def test_str_revenue_rises_with_nightly_rate_and_occupancy():
    from backend.services.underwriting_service import str_analysis

    base = inputs()
    r = str_analysis(base, 150, 200, 250)
    assert r["strMonthlyRevenueLow"] < r["strMonthlyRevenueMid"] < r["strMonthlyRevenueHigh"]
    assert r["strCapRateLow"] < r["strCapRateHigh"]


def test_str_uses_state_property_tax():
    from backend.services.underwriting_service import str_analysis

    tx = str_analysis(inputs(state="TX"), 180, 220, 260)
    az = str_analysis(inputs(state="AZ"), 180, 220, 260)
    assert az["strCapRateMid"] > tx["strCapRateMid"]
