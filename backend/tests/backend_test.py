"""
Comprehensive backend tests for ITR Operations Management System.
Covers: auth, masters (users/clients/stages/options), returns, queries,
dashboard, escalations, exports, role enforcement, imports.
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://itr-command-center.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@taxops.com"
ADMIN_PASSWORD = "Admin@123"
USER_EMAIL = "priya.sharma@taxops.com"
USER_PASSWORD = "User@123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_h(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"

    def test_login_user(self, user_token):
        assert isinstance(user_token, str)

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code in (400, 401)

    def test_me(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_h)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)


# ---------- Masters ----------
class TestMasters:
    def test_list_users(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/users", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 4
        # ensure password_hash not exposed
        for u in data:
            assert "password_hash" not in u
            assert "_id" not in u

    def test_list_clients(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/clients", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        for c in data:
            assert "_id" not in c

    def test_workflow_stages_15(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/workflow-stages", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 15, f"Expected 15 stages, got {len(data)}"
        # ordered
        seqs = [s.get("sequence") for s in data]
        assert seqs == sorted(seqs)

    def test_dropdown_options(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dropdown-options", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Returns ----------
class TestReturns:
    def test_list_returns_enriched(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/returns", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        sample = data[0]
        for key in ["current_stage_name", "person_assigned_name", "stage_ageing_days",
                    "total_ageing_days", "next_action_required"]:
            assert key in sample, f"missing {key}"

    def test_admin_create_and_stage_move(self, admin_h):
        import uuid
        uniq = uuid.uuid4().hex[:8]
        # fetch a stage + client
        stages = requests.get(f"{BASE_URL}/api/workflow-stages", headers=admin_h).json()
        clients = requests.get(f"{BASE_URL}/api/clients", headers=admin_h).json()
        users = requests.get(f"{BASE_URL}/api/users", headers=admin_h).json()
        stage0 = stages[0]["id"]
        stage1 = stages[1]["id"]
        payload = {
            "return_inward_no": f"TEST_RIN_{uniq}",
            "return_inward_date": "2025-01-15",
            "fy": "2024-25",
            "file_no": f"TEST_FILE_{uniq}",
            "client_name": clients[0].get("client_name") or clients[0].get("name"),
            "return_type": "ITR",
            "current_stage_id": stage0,
        }
        r = requests.post(f"{BASE_URL}/api/returns", json=payload, headers=admin_h)
        assert r.status_code in (200, 201), r.text
        ret = r.json()
        rid = ret["id"]

        # Move stage
        r2 = requests.patch(f"{BASE_URL}/api/returns/{rid}",
                            json={"current_stage_id": stage1}, headers=admin_h)
        assert r2.status_code == 200, r2.text
        # verify via GET
        g = requests.get(f"{BASE_URL}/api/returns/{rid}", headers=admin_h)
        assert g.status_code == 200
        assert g.json()["current_stage_id"] == stage1

        # Reassign
        non_admin = next((u for u in users if u.get("role") != "admin"), None)
        if non_admin:
            r3 = requests.post(f"{BASE_URL}/api/returns/{rid}/reassign",
                               json={"person_assigned_id": non_admin["id"]},
                               headers=admin_h)
            assert r3.status_code == 200, r3.text

        # Audit logs created
        al = requests.get(f"{BASE_URL}/api/audit-logs", headers=admin_h,
                          params={"entity_type": "return", "entity_id": rid})
        assert al.status_code == 200
        logs = al.json()
        # accept list or {items:...}
        if isinstance(logs, dict):
            logs = logs.get("items", logs.get("logs", []))
        assert len(logs) >= 2, f"Expected audit log entries, got {len(logs)}"

        # cleanup
        requests.delete(f"{BASE_URL}/api/returns/{rid}", headers=admin_h)

    def test_non_admin_cannot_create_return(self, user_h, admin_h):
        stages = requests.get(f"{BASE_URL}/api/workflow-stages", headers=admin_h).json()
        clients = requests.get(f"{BASE_URL}/api/clients", headers=admin_h).json()
        payload = {
            "file_no": "TEST_FILE_002",
            "return_inward_no": "TEST_RIN_002",
            "return_inward_date": "2025-01-15",
            "fy": "2024-25",
            "client_name": clients[0].get("client_name") or clients[0].get("name"),
            "return_type": "ITR",
            "current_stage_id": stages[0]["id"],
        }
        r = requests.post(f"{BASE_URL}/api/returns", json=payload, headers=user_h)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------- Queries ----------
class TestQueries:
    def test_query_crud_and_auto_close_date(self, admin_h):
        returns = requests.get(f"{BASE_URL}/api/returns", headers=admin_h).json()
        assert len(returns) > 0
        rid = returns[0]["id"]
        payload = {
            "return_id": rid,
            "query_description": "TEST_QUERY: please confirm pan",
            "query_status": "Open",
        }
        r = requests.post(f"{BASE_URL}/api/queries", json=payload, headers=admin_h)
        assert r.status_code in (200, 201), r.text
        qid = r.json()["id"]

        # List
        lst = requests.get(f"{BASE_URL}/api/queries", headers=admin_h).json()
        assert any(q["id"] == qid for q in lst)

        # Close
        r2 = requests.patch(f"{BASE_URL}/api/queries/{qid}",
                            json={"query_status": "Closed"}, headers=admin_h)
        assert r2.status_code == 200
        # verify via GET list
        lst2 = requests.get(f"{BASE_URL}/api/queries", headers=admin_h).json()
        closed = next((q for q in lst2 if q["id"] == qid), None)
        assert closed is not None
        assert closed.get("query_status") == "Closed"
        assert closed.get("query_closed_date") is not None, "closed date should auto-set"

        # cleanup
        requests.delete(f"{BASE_URL}/api/queries/{qid}", headers=admin_h)


# ---------- Dashboard ----------
class TestDashboard:
    def test_kpis_has_7_keys(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/kpis", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert len(data) >= 7, f"Expected at least 7 KPI keys, got {len(data)}: {list(data.keys())}"

    def test_funnel_15(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/funnel", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        # may be list or dict
        items = data if isinstance(data, list) else data.get("stages", [])
        assert len(items) == 15
        for it in items:
            assert "count" in it
            assert "percentage" in it or "percent" in it

    def test_ageing_heatmap_buckets(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/ageing-heatmap", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        body = str(data)
        for b in ["0-3", "4-7", "8-15"]:
            assert b in body, f"bucket {b} missing"

    def test_sla(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/sla", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        for k in ["sla_breaches", "upcoming_sla_breaches", "stage_delays"]:
            assert k in data, f"missing key {k}"

    def test_queries_dashboard(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/queries", headers=admin_h)
        assert r.status_code == 200

    def test_team_dashboard(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/dashboard/team", headers=admin_h)
        assert r.status_code == 200


# ---------- Escalations ----------
class TestEscalations:
    def test_escalations(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/escalations", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        # expect breaches + logs keys
        assert ("breaches" in data) or ("current_breaches" in data)
        assert ("logs" in data) or ("notification_log" in data)


# ---------- Exports ----------
class TestExports:
    @pytest.mark.parametrize("fmt,ct_part", [
        ("csv", "csv"),
        ("xlsx", "spreadsheet"),
        ("pdf", "pdf"),
    ])
    def test_returns_export(self, admin_h, fmt, ct_part):
        r = requests.get(f"{BASE_URL}/api/returns/export/file",
                         params={"format": fmt}, headers=admin_h)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "").lower()
        assert ct_part in ct, f"content-type mismatch: {ct}"
        assert len(r.content) > 50

    def test_clients_export(self, admin_h):
        # try standard path first
        r = requests.get(f"{BASE_URL}/api/clients/export", headers=admin_h)
        if r.status_code == 404:
            r = requests.get(f"{BASE_URL}/api/clients/export/file",
                             params={"format": "csv"}, headers=admin_h)
        assert r.status_code == 200
        assert len(r.content) > 10

    def test_queries_export(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/queries/export/file",
                         params={"format": "csv"}, headers=admin_h)
        assert r.status_code == 200
        assert len(r.content) > 10


# ---------- Workflow stage reorder ----------
class TestStageReorder:
    def test_reorder(self, admin_h):
        stages = requests.get(f"{BASE_URL}/api/workflow-stages", headers=admin_h).json()
        ordered_ids = [s["id"] for s in stages]
        # Reverse last two
        ordered_ids[-1], ordered_ids[-2] = ordered_ids[-2], ordered_ids[-1]
        r = requests.post(f"{BASE_URL}/api/workflow-stages/reorder",
                          json={"ordered_ids": ordered_ids}, headers=admin_h)
        assert r.status_code == 200, r.text
        # restore
        ordered_ids[-1], ordered_ids[-2] = ordered_ids[-2], ordered_ids[-1]
        requests.post(f"{BASE_URL}/api/workflow-stages/reorder",
                      json={"ordered_ids": ordered_ids}, headers=admin_h)


# ---------- Client import ----------
class TestClientImport:
    def test_csv_import(self, admin_h):
        csv = b"file_no,client_name,group,category\nTEST_IMP_001,TEST_IMP_ACME,TEST_GRP,Individual\n"
        files = {"file": ("clients.csv", io.BytesIO(csv), "text/csv")}
        r = requests.post(f"{BASE_URL}/api/clients/import", files=files, headers=admin_h)
        assert r.status_code in (200, 201), r.text
        # verify
        clients = requests.get(f"{BASE_URL}/api/clients", headers=admin_h).json()
        match = [c for c in clients if (c.get("client_name") == "TEST_IMP_ACME" or c.get("name") == "TEST_IMP_ACME")]
        assert len(match) >= 1, "imported client not found"
        # cleanup
        for c in match:
            requests.delete(f"{BASE_URL}/api/clients/{c['id']}", headers=admin_h)


# ---------- Role enforcement ----------
class TestRoleEnforcement:
    def test_user_cannot_create_client(self, user_h):
        payload = {"file_no": "TEST_DENIED_FN", "client_name": "TEST_DENIED"}
        r = requests.post(f"{BASE_URL}/api/clients", json=payload, headers=user_h)
        assert r.status_code == 403
