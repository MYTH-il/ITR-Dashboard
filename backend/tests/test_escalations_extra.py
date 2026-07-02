"""Extra escalation tests:
- 403 enforcement on /test-fixtures/escalations/seed for non-admin users
- Explicit field-level checks per scenario (days_in_stage, escalation_days, stage_name)
- Ageing heatmap '15+' bucket non-zero after seed
- DELETE cleanup leaves zero TEST-* rows
"""
import os
import requests

BASE = os.environ.get("TEST_BASE_URL", "https://itr-command-center.preview.emergentagent.com/api")
ADMIN = ("admin@taxops.com", "Admin@123")
USER = ("priya.sharma@taxops.com", "User@123")


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_non_admin_cannot_seed_fixtures():
    u_tok = _login(*USER)
    r = requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(u_tok), timeout=10)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_seed_response_shape():
    tok = _login(*ADMIN)
    r = requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "scenarios" in body and len(body["scenarios"]) == 8
    bs = body["breach_summary"]
    assert bs["sla_breaches"] >= 4, f"sla_breaches={bs['sla_breaches']}"
    assert bs["escalation_breaches"] >= 3, f"escalation_breaches={bs['escalation_breaches']}"
    assert bs["upcoming_sla_breaches"] >= 1, f"upcoming={bs['upcoming_sla_breaches']}"


def test_sla_breach_fields_match_expectations():
    tok = _login(*ADMIN)
    requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    sla = requests.get(f"{BASE}/dashboard/sla", headers=_hdr(tok), timeout=10).json()
    by_rin = {b["return_inward_no"]: b for b in sla["sla_breaches"]}
    # SLA-BREACH: DVQ, 5 days, sla=3
    assert by_rin["TEST-RIN-SLA-BREACH"]["stage_name"] == "DVQ"
    assert by_rin["TEST-RIN-SLA-BREACH"]["days_in_stage"] >= 5
    assert by_rin["TEST-RIN-SLA-BREACH"]["sla_days"] == 3
    # ESCALATION: DVQ, 12d, esc=7
    assert by_rin["TEST-RIN-ESCALATION"]["stage_name"] == "DVQ"
    assert by_rin["TEST-RIN-ESCALATION"]["days_in_stage"] >= 12
    # CRITICAL: RTG-CC, 25d, esc=6
    assert by_rin["TEST-RIN-CRITICAL"]["stage_name"] == "RTG-CC"
    assert by_rin["TEST-RIN-CRITICAL"]["days_in_stage"] >= 25


def test_escalation_breach_fields_match_expectations():
    tok = _login(*ADMIN)
    requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    esc = requests.get(f"{BASE}/escalations", headers=_hdr(tok), timeout=10).json()
    by_rin = {b["return_inward_no"]: b for b in esc["breaches"]}
    assert "TEST-RIN-ESCALATION" in by_rin
    assert by_rin["TEST-RIN-ESCALATION"]["escalation_days"] == 7
    assert "TEST-RIN-CRITICAL" in by_rin
    assert by_rin["TEST-RIN-CRITICAL"]["escalation_days"] == 6
    assert "TEST-RIN-OVERDUE-ESC" in by_rin
    assert by_rin["TEST-RIN-OVERDUE-ESC"]["stage_name"] == "RTG"
    # SLA-only (no escalation breach yet) MUST NOT appear
    assert "TEST-RIN-SLA-BREACH" not in by_rin
    assert "TEST-RIN-COMPLETED" not in by_rin


def test_ageing_heatmap_buckets_after_seed():
    tok = _login(*ADMIN)
    requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    heat = requests.get(f"{BASE}/dashboard/ageing-heatmap", headers=_hdr(tok), timeout=10).json()
    buckets = heat["buckets"]
    # 25d CRITICAL + 15d OVERDUE-ESC -> 15+ bucket has at least 2 from fixtures
    assert buckets["15+"] >= 2, f"15+ bucket expected >=2, got {buckets['15+']}"
    # 12d ESCALATION -> 8-15 bucket
    assert buckets["8-15"] >= 1, f"8-15 bucket expected >=1, got {buckets['8-15']}"


def test_overdue_kpi_includes_fixtures():
    tok = _login(*ADMIN)
    requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    k = requests.get(f"{BASE}/dashboard/kpis", headers=_hdr(tok), timeout=10).json()
    assert k["overdue_returns"] >= 2, k


def test_cleanup_removes_test_rins():
    tok = _login(*ADMIN)
    requests.post(f"{BASE}/test-fixtures/escalations/seed", headers=_hdr(tok), timeout=15)
    requests.delete(f"{BASE}/test-fixtures/escalations", headers=_hdr(tok), timeout=10).raise_for_status()
    rs = requests.get(f"{BASE}/returns", headers=_hdr(tok), timeout=10).json()
    assert not any((r.get("return_inward_no") or "").startswith("TEST-RIN-") for r in rs)
