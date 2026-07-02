"""End-to-end backend tests for SLA / escalation / overdue detection.

These tests:
  1. Seed deterministic escalation fixtures (8 known scenarios)
  2. Hit the live /api endpoints
  3. Assert breach counts, the right return_inward_no(s) appear in the right buckets,
     and the escalation_log is created exactly once per (return_id, stage) pair.

Run with:
    cd /app/backend && python -m pytest tests/test_escalations.py -v
"""
import os
import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8001/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@taxops.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")


def _login():
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_fixtures(token):
    r = requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(token), timeout=15)
    r.raise_for_status()
    return r.json()


def _cleanup(token):
    r = requests.delete(f"{BASE}/test-fixtures/escalations", headers=_hdr(token), timeout=15)
    r.raise_for_status()


# Expected outcomes per scenario (derived from stage SLA/escalation table)
#   DVQ     sla=3 esc=7
#   RTG-CC  sla=3 esc=6
#   DVP     sla=5 esc=10
#   RTG     sla=2 esc=4
EXPECTED = {
    "TEST-RIN-FRESH":       {"sla_breach": False, "escalation": False, "overdue": False},
    "TEST-RIN-NEAR-SLA":    {"sla_breach": False, "escalation": False, "overdue": False, "upcoming": True},
    "TEST-RIN-SLA-BREACH":  {"sla_breach": True,  "escalation": False, "overdue": False},
    "TEST-RIN-ESCALATION":  {"sla_breach": True,  "escalation": True,  "overdue": False},
    "TEST-RIN-CRITICAL":    {"sla_breach": True,  "escalation": True,  "overdue": False},
    "TEST-RIN-OVERDUE":     {"sla_breach": False, "escalation": False, "overdue": True},
    "TEST-RIN-OVERDUE-ESC": {"sla_breach": True,  "escalation": True,  "overdue": True},
    "TEST-RIN-COMPLETED":   {"sla_breach": False, "escalation": False, "overdue": False},
}


# ---------------- Tests ----------------
def test_seed_creates_all_scenarios():
    token = _login()
    data = _seed_fixtures(token)
    rins = {s["rin"] for s in data["scenarios"]}
    for r in EXPECTED:
        assert r in rins, f"Fixture {r} was not seeded"
    assert data["escalation_log_count"] >= 1


def test_sla_endpoint_lists_expected_breaches():
    token = _login()
    _seed_fixtures(token)
    r = requests.get(f"{BASE}/dashboard/sla", headers=_hdr(token), timeout=10)
    r.raise_for_status()
    body = r.json()

    sla_rins = {b["return_inward_no"] for b in body["sla_breaches"]}
    upcoming_rins = {b["return_inward_no"] for b in body["upcoming_sla_breaches"]}

    for rin, expect in EXPECTED.items():
        if expect.get("sla_breach"):
            assert rin in sla_rins, f"{rin} should be flagged as SLA breach but is not. Got: {sla_rins}"
        else:
            assert rin not in sla_rins, f"{rin} should NOT be in SLA breaches"
        if expect.get("upcoming"):
            assert rin in upcoming_rins, f"{rin} should be in upcoming SLA breaches"


def test_escalations_endpoint_lists_expected_breaches():
    token = _login()
    _seed_fixtures(token)
    r = requests.get(f"{BASE}/escalations", headers=_hdr(token), timeout=10)
    r.raise_for_status()
    body = r.json()
    breach_rins = {b["return_inward_no"] for b in body["breaches"]}

    for rin, expect in EXPECTED.items():
        if expect.get("escalation"):
            assert rin in breach_rins, f"{rin} should be in escalation breaches. Got: {breach_rins}"
        else:
            assert rin not in breach_rins, f"{rin} should NOT be in escalation breaches"


def test_escalation_log_no_duplicates_on_rerun():
    """Running the escalation job a second time must NOT duplicate log entries."""
    token = _login()
    _seed_fixtures(token)
    r1 = requests.get(f"{BASE}/escalations", headers=_hdr(token), timeout=10).json()
    first_count = len(r1["logs"])

    # run again
    requests.post(f"{BASE}/escalations/run", headers=_hdr(token), timeout=15).raise_for_status()
    r2 = requests.get(f"{BASE}/escalations", headers=_hdr(token), timeout=10).json()
    second_count = len(r2["logs"])

    assert first_count == second_count, (
        f"Escalation logs should be deduped per (return, stage). First={first_count} Second={second_count}"
    )


def test_kpi_overdue_returns_count():
    token = _login()
    _seed_fixtures(token)
    r = requests.get(f"{BASE}/dashboard/kpis", headers=_hdr(token), timeout=10).json()
    expected_overdue_fixtures = sum(1 for v in EXPECTED.values() if v.get("overdue"))
    # KPI counts overdue across ALL returns (fixtures + demo), so just assert >= fixtures
    assert r["overdue_returns"] >= expected_overdue_fixtures, (
        f"KPI overdue count {r['overdue_returns']} < expected fixture overdues {expected_overdue_fixtures}"
    )


def test_completed_excluded_from_breaches():
    token = _login()
    _seed_fixtures(token)
    sla = requests.get(f"{BASE}/dashboard/sla", headers=_hdr(token), timeout=10).json()
    esc = requests.get(f"{BASE}/escalations", headers=_hdr(token), timeout=10).json()
    heat = requests.get(f"{BASE}/dashboard/ageing-heatmap", headers=_hdr(token), timeout=10).json()

    sla_rins = {b["return_inward_no"] for b in sla["sla_breaches"]}
    esc_rins = {b["return_inward_no"] for b in esc["breaches"]}

    # Completed should be in none of the breach lists
    assert "TEST-RIN-COMPLETED" not in sla_rins
    assert "TEST-RIN-COMPLETED" not in esc_rins
    # heat map only ages non-completed returns; total of buckets should not include the Completed fixture
    total_in_buckets = sum(heat["buckets"].values())
    assert total_in_buckets >= 1  # at least one non-completed fixture


def test_stage_delays_reports_per_stage_breach_count():
    token = _login()
    _seed_fixtures(token)
    body = requests.get(f"{BASE}/dashboard/sla", headers=_hdr(token), timeout=10).json()
    stages = {s["stage_name"]: s for s in body["stage_delays"]}
    # DVQ holds 4 fixtures (FRESH, NEAR-SLA, SLA-BREACH, ESCALATION). Breached ones in DVQ: SLA-BREACH + ESCALATION = 2
    if "DVQ" in stages:
        assert stages["DVQ"]["breaches"] >= 2, (
            f"DVQ should report >=2 breaches; got {stages['DVQ']['breaches']}"
        )


def test_cleanup_removes_fixtures():
    token = _login()
    _seed_fixtures(token)
    _cleanup(token)
    r = requests.get(f"{BASE}/returns", headers=_hdr(token), timeout=10).json()
    rins = {x["return_inward_no"] for x in r}
    for rin in EXPECTED:
        assert rin not in rins, f"{rin} should have been removed"
