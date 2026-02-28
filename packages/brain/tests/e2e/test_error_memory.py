#!/usr/bin/env python3
"""
Brain v1.8.1 — Error Memory Complete Flow Test
Tests the full error lifecycle: report → match → solve → learn → prevent
~50 assertions covering every error-related endpoint.
"""

import sys
import time
import httpx

BASE = "http://localhost:7777/api/v1"
PASS = 0
FAIL = 0
ERRORS: list[str] = []


def check(condition: bool, label: str) -> bool:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  \033[32mPASS\033[0m {label}")
    else:
        FAIL += 1
        ERRORS.append(label)
        print(f"  \033[31mFAIL\033[0m {label}")
    return condition


def post(path: str, json: dict | list | None = None) -> httpx.Response:
    return httpx.post(f"{BASE}{path}", json=json or {}, timeout=15)


def get(path: str, params: dict | None = None) -> httpx.Response:
    return httpx.get(f"{BASE}{path}", params=params, timeout=15)


# ──────────────────────────────────────────────────────────────
# Test Data: 12 realistic errors across 2 projects, 3 languages
# ──────────────────────────────────────────────────────────────
TYPESCRIPT_ERRORS = [
    {
        "project": "test-frontend",
        "errorOutput": """TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:24:18)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)
    at mountIndeterminateComponent (/app/node_modules/react-dom/cjs/react-dom.development.js:17811:13)""",
        "filePath": "/app/src/components/UserList.tsx",
        "command": "npm run dev",
    },
    {
        "project": "test-frontend",
        "errorOutput": """SyntaxError: Unexpected token '<' (at index.html:1:1)
    at Object.compileFunction (node:vm:360:18)
    at wrapSafe (node:internal/modules/cjs/loader:1094:15)
    at Module._compile (node:internal/modules/cjs/loader:1129:27)""",
        "filePath": "/app/public/index.html",
        "command": "npm run build",
    },
    {
        "project": "test-frontend",
        "errorOutput": """RangeError: Maximum call stack size exceeded
    at deepClone (/app/src/utils/clone.ts:8:12)
    at deepClone (/app/src/utils/clone.ts:15:16)
    at deepClone (/app/src/utils/clone.ts:15:16)
    at deepClone (/app/src/utils/clone.ts:15:16)""",
        "filePath": "/app/src/utils/clone.ts",
        "command": "npm test",
    },
    {
        "project": "test-frontend",
        "errorOutput": """Error: ENOENT: no such file or directory, open '/app/config/settings.json'
    at Object.openSync (node:fs:603:3)
    at readFileSync (node:fs:471:35)
    at loadConfig (/app/src/config/loader.ts:12:22)""",
        "filePath": "/app/src/config/loader.ts",
        "command": "npm start",
    },
]

PYTHON_ERRORS = [
    {
        "project": "test-backend",
        "errorOutput": """Traceback (most recent call last):
  File "/app/src/api/routes.py", line 45, in get_user
    user = db.users.find_one({"_id": ObjectId(user_id)})
  File "/app/venv/lib/python3.11/site-packages/pymongo/collection.py", line 1382, in find_one
    return next(cursor, None)
bson.errors.InvalidId: '123abc' is not a valid ObjectId, it must be a 12-byte input or a 24-character hex string""",
        "filePath": "/app/src/api/routes.py",
        "command": "python -m pytest",
    },
    {
        "project": "test-backend",
        "errorOutput": """Traceback (most recent call last):
  File "/app/src/services/auth.py", line 67, in verify_token
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
  File "/app/venv/lib/python3.11/site-packages/jwt/api_jwt.py", line 210, in decode
    decoded = api_jws.decode(jwt_value, key, algorithms)
jwt.exceptions.ExpiredSignatureError: Signature has expired""",
        "filePath": "/app/src/services/auth.py",
        "command": "python manage.py runserver",
    },
    {
        "project": "test-backend",
        "errorOutput": """Traceback (most recent call last):
  File "/app/src/tasks/worker.py", line 23, in process_job
    result = heavy_computation(data)
  File "/app/src/tasks/compute.py", line 89, in heavy_computation
    return np.dot(matrix_a, matrix_b)
MemoryError: Unable to allocate 2.00 GiB for an array with shape (16384, 16384) and data type float64""",
        "filePath": "/app/src/tasks/compute.py",
        "command": "celery -A app worker",
    },
    {
        "project": "test-backend",
        "errorOutput": """Traceback (most recent call last):
  File "/app/src/db/connection.py", line 31, in connect
    self.conn = psycopg2.connect(dsn=self.dsn, connect_timeout=5)
  File "/app/venv/lib/python3.11/site-packages/psycopg2/__init__.py", line 122, in connect
    conn = _connect(dsn, connection_factory=connection_factory, **kwasync)
psycopg2.OperationalError: could not connect to server: Connection refused
\tIs the server running on host "localhost" (127.0.0.1) and accepting TCP/IP connections on port 5432?""",
        "filePath": "/app/src/db/connection.py",
        "command": "python manage.py migrate",
    },
]

RUST_ERRORS = [
    {
        "project": "test-backend",
        "errorOutput": """thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value: Os { code: 2, kind: NotFound, message: "No such file or directory" }', src/config/loader.rs:42:10
stack backtrace:
   0: rust_begin_unwind at /rustc/a178d0322ce20e33eac124758e837cbd80a6f633/library/std/src/panicking.rs:652:5
   1: core::panicking::panic_fmt at /rustc/a178d0322ce20e33eac124758e837cbd80a6f633/library/core/src/panicking.rs:72:14
   2: core::result::unwrap_failed at /rustc/a178d0322ce20e33eac124758e837cbd80a6f633/library/core/src/result.rs:1654:5
   3: myapp::config::loader::load_config at ./src/config/loader.rs:42:10""",
        "filePath": "src/config/loader.rs",
        "command": "cargo run",
    },
    {
        "project": "test-backend",
        "errorOutput": """thread 'tokio-runtime-worker' panicked at 'index out of bounds: the len is 3 but the index is 5', src/handlers/api.rs:78:22
stack backtrace:
   0: rust_begin_unwind
   1: core::panicking::panic_fmt
   2: core::panicking::panic_bounds_check
   3: myapp::handlers::api::process_items at ./src/handlers/api.rs:78:22
   4: myapp::handlers::api::handle_request at ./src/handlers/api.rs:45:9""",
        "filePath": "src/handlers/api.rs",
        "command": "cargo test",
    },
    {
        "project": "test-frontend",
        "errorOutput": """TypeError: Cannot read properties of null (reading 'addEventListener')
    at initDropdown (/app/src/components/Dropdown.tsx:18:8)
    at mountComponent (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)
    at commitLayoutEffects (/app/node_modules/react-dom/cjs/react-dom.development.js:23426:9)""",
        "filePath": "/app/src/components/Dropdown.tsx",
        "command": "npm run dev",
    },
    {
        "project": "test-frontend",
        "errorOutput": """ReferenceError: process is not defined
    at getEnvVar (/app/src/utils/env.ts:3:10)
    at loadConfig (/app/src/config/index.ts:8:22)
    at Object.<anonymous> (/app/src/index.ts:4:1)""",
        "filePath": "/app/src/utils/env.ts",
        "command": "npm run build",
    },
]

ALL_ERRORS = TYPESCRIPT_ERRORS + PYTHON_ERRORS + RUST_ERRORS

# ──────────────────────────────────────────────────────────────
# Solutions to report
# ──────────────────────────────────────────────────────────────
SOLUTIONS = [
    {
        "description": "Add optional chaining before .map() and provide fallback empty array",
        "commands": None,
        "codeChange": "const items = data?.users?.map(u => u.name) ?? [];",
        "source": "manual",
    },
    {
        "description": "Validate ObjectId format before querying database",
        "commands": "pip install bson",
        "codeChange": "if not ObjectId.is_valid(user_id): raise HTTPException(400, 'Invalid ID')",
        "source": "manual",
    },
    {
        "description": "Implement token refresh flow with sliding window expiration",
        "commands": None,
        "codeChange": "token = jwt.encode({...payload, 'exp': datetime.utcnow() + timedelta(hours=24)}, SECRET_KEY)",
        "source": "manual",
    },
    {
        "description": "Use chunk processing to avoid memory allocation failures",
        "commands": None,
        "codeChange": "result = np.zeros(shape); for i in range(0, n, chunk_size): result[i:i+chunk_size] = np.dot(a[i:i+chunk_size], b)",
        "source": "auto",
    },
    {
        "description": "Add connection retry with exponential backoff for database connections",
        "commands": "pip install tenacity",
        "codeChange": "@retry(wait=wait_exponential(min=1, max=30), stop=stop_after_attempt(5))\ndef connect(self): ...",
        "source": "manual",
    },
]


def main() -> int:
    print("\n" + "=" * 60)
    print("  BRAIN E2E TEST: Error Memory Complete Flow")
    print("=" * 60)

    # Store IDs for later use
    error_ids: list[int] = []
    solution_ids: list[int] = []

    # ── 1. Report 12 realistic errors ──────────────────────────
    print("\n[1] Reporting 12 errors across 2 projects...")
    for i, err in enumerate(ALL_ERRORS):
        r = post("/errors", err)
        ok = r.status_code == 201
        data = r.json().get("result", {})
        eid = data.get("errorId")
        is_new = data.get("isNew")
        check(ok and eid is not None, f"Error #{i+1} reported (id={eid})")
        if eid:
            error_ids.append(eid)

    check(len(error_ids) == 12, f"All 12 errors created ({len(error_ids)} IDs)")

    # ── 2. Duplicate detection ─────────────────────────────────
    print("\n[2] Testing duplicate detection...")
    r = post("/errors", ALL_ERRORS[0])
    data = r.json().get("result", {})
    dup_is_new = data.get("isNew")
    check(dup_is_new is False, f"Duplicate detected (isNew={dup_is_new})")
    check(data.get("errorId") == error_ids[0], "Duplicate returns same errorId")

    # ── 3. Similar error matching ──────────────────────────────
    print("\n[3] Testing similar error matching...")
    # Report a near-duplicate (similar TypeError but slightly different)
    near_dup = {
        "project": "test-frontend",
        "errorOutput": """TypeError: Cannot read properties of undefined (reading 'forEach')
    at UserGrid (/app/src/components/UserGrid.tsx:31:12)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)""",
        "filePath": "/app/src/components/UserGrid.tsx",
        "command": "npm run dev",
    }
    r = post("/errors", near_dup)
    near_dup_id = r.json().get("result", {}).get("errorId")
    matches_inline = r.json().get("result", {}).get("matches", [])
    check(near_dup_id is not None, f"Near-duplicate reported (id={near_dup_id})")

    # Explicitly call match endpoint
    if error_ids:
        r = get(f"/errors/{error_ids[0]}/match")
        match_data = r.json().get("result", [])
        check(r.status_code == 200, "Match endpoint returns 200")
        check(isinstance(match_data, list), f"Match returns list ({len(match_data)} matches)")

    # ── 4. Report 5 solutions linked to errors ─────────────────
    print("\n[4] Reporting 5 solutions...")
    for i, sol in enumerate(SOLUTIONS):
        payload = {**sol, "errorId": error_ids[i] if i < len(error_ids) else error_ids[0]}
        r = post("/solutions", payload)
        sid = r.json().get("result")
        check(r.status_code == 201 and sid is not None, f"Solution #{i+1} reported (id={sid})")
        if sid is not None:
            solution_ids.append(sid)

    check(len(solution_ids) >= 4, f"At least 4 solutions created ({len(solution_ids)})")

    # ── 5. Query solutions for an error ────────────────────────
    print("\n[5] Querying solutions for error...")
    if error_ids:
        r = get("/solutions", params={"errorId": str(error_ids[0])})
        check(r.status_code == 200, "Solution query returns 200")
        sols = r.json().get("result", [])
        check(isinstance(sols, list) and len(sols) >= 1, f"Found {len(sols)} solution(s) for error")

    # ── 6. Rate solution outcomes ──────────────────────────────
    print("\n[6] Rating solution outcomes...")
    ratings = [
        (0, 0, True),   # sol 0 for error 0: success
        (1, 1, True),   # sol 1 for error 1 (mapped to error_ids[4]): success
        (2, 2, True),   # sol 2 for error 2 (mapped to error_ids[5]): success
        (3, 3, False),  # sol 3 for error 3 (mapped to error_ids[6]): failure
    ]
    for sol_idx, err_idx, success in ratings:
        if sol_idx < len(solution_ids) and err_idx < len(error_ids):
            payload = {
                "errorId": error_ids[err_idx],
                "solutionId": solution_ids[sol_idx],
                "success": success,
                "output": "Applied successfully" if success else "Still failing",
                "durationMs": 1200 if success else 5000,
            }
            r = post("/solutions/rate", payload)
            label = "success" if success else "failure"
            check(r.status_code == 201, f"Rated solution #{sol_idx+1} as {label}")

    # ── 7. Solution efficiency ─────────────────────────────────
    print("\n[7] Checking solution efficiency...")
    r = get("/solutions/efficiency")
    check(r.status_code == 200, "Efficiency endpoint returns 200")
    eff = r.json().get("result")
    check(eff is not None, f"Efficiency data returned: {type(eff)}")

    # ── 8. Error chains ────────────────────────────────────────
    print("\n[8] Testing error chains...")
    if error_ids:
        r = get(f"/errors/{error_ids[0]}/chain")
        check(r.status_code == 200, "Chain endpoint returns 200")
        chain = r.json().get("result")
        check(chain is not None, f"Chain data returned: {type(chain)}")

    # ── 9. Cross-project matching ──────────────────────────────
    print("\n[9] Testing cross-project matching...")
    # Error 3 (ENOENT frontend) and Error 8 (Rust NotFound) are conceptually similar
    if len(error_ids) >= 9:
        r = get(f"/errors/{error_ids[3]}/match")
        cross_matches = r.json().get("result", [])
        check(r.status_code == 200, "Cross-project match returns 200")
        check(isinstance(cross_matches, list), f"Cross-project matches: {len(cross_matches)}")

    # ── 10. Query/filter errors ────────────────────────────────
    print("\n[10] Querying and filtering errors...")
    r = get("/errors", params={"search": "TypeError"})
    check(r.status_code == 200, "Error query by text returns 200")
    results = r.json().get("result", [])
    check(isinstance(results, list) and len(results) >= 1, f"Found {len(results)} TypeErrors")

    r = get("/errors", params={"search": "database"})
    check(r.status_code == 200, "Error query 'database' returns 200")

    # Get single error
    if error_ids:
        r = get(f"/errors/{error_ids[0]}")
        check(r.status_code == 200, "Get single error returns 200")
        err_detail = r.json().get("result", {})
        check(err_detail.get("id") == error_ids[0], "Error detail has correct ID")

    # ── 11. Resolve an error with a solution ───────────────────
    print("\n[11] Resolving an error...")
    if error_ids and solution_ids:
        r = post(f"/errors/{error_ids[0]}/resolve", {"solutionId": solution_ids[0]})
        check(r.status_code == 201, "Resolve endpoint returns 201")

        # Verify resolved
        r = get(f"/errors/{error_ids[0]}")
        resolved = r.json().get("result", {}).get("resolved")
        check(resolved == 1 or resolved is True, f"Error marked as resolved (resolved={resolved})")

    # ── 12. Analytics explain ──────────────────────────────────
    print("\n[12] Testing analytics explain...")
    if error_ids:
        r = get(f"/analytics/explain/{error_ids[0]}")
        check(r.status_code == 200, "Explain endpoint returns 200")
        explanation = r.json().get("result")
        check(explanation is not None, "Explanation data returned")
        if isinstance(explanation, dict):
            check("error" in explanation or "solutions" in explanation or "context" in explanation,
                  "Explanation has expected structure")

    # ── 13. Trigger learning cycle ─────────────────────────────
    print("\n[13] Triggering learning cycle...")
    r = post("/learning/run")
    check(r.status_code == 201, "Learning run endpoint returns 201")
    learning_result = r.json().get("result")
    check(learning_result is not None, f"Learning result: {type(learning_result)}")

    # Small delay for learning effects
    time.sleep(0.5)

    # ── 14. Prevention endpoints ───────────────────────────────
    print("\n[14] Testing prevention endpoints...")
    # Check rules
    r = post("/prevention/check", {
        "errorType": "TypeError",
        "message": "Cannot read properties of undefined",
        "projectId": None,
    })
    check(r.status_code == 201, "Prevention check returns 201")
    rules = r.json().get("result")
    check(rules is not None, f"Prevention rules returned: {type(rules)}")

    # Check antipatterns
    r = post("/prevention/antipatterns", {
        "errorType": "TypeError",
        "message": "Cannot read properties of undefined (reading 'map')",
    })
    check(r.status_code == 201, "Antipatterns check returns 201")
    antipatterns = r.json().get("result")
    check(antipatterns is not None, f"Antipatterns returned: {type(antipatterns)}")

    # Check code
    r = post("/prevention/code", {
        "source": "const x = obj.prop.nested.deep;\nconsole.log(x.map(i => i.name));",
        "filePath": "test.ts",
    })
    check(r.status_code == 201, "Code prevention check returns 201")
    code_result = r.json().get("result")
    check(code_result is not None, f"Code check returned: {type(code_result)}")

    # ── 15. Synapse verification ───────────────────────────────
    print("\n[15] Verifying synapses between errors and solutions...")
    if error_ids:
        r = get(f"/synapses/context/{error_ids[0]}")
        check(r.status_code == 200, "Synapse context returns 200")
        ctx = r.json().get("result", {})
        check(isinstance(ctx, dict), "Synapse context is a dict")
        has_solutions = len(ctx.get("solutions", [])) > 0
        check(has_solutions, f"Synapse context has solutions: {len(ctx.get('solutions', []))}")

    # Synapse stats
    r = get("/synapses/stats")
    check(r.status_code == 200, "Synapse stats returns 200")
    stats = r.json().get("result", {})
    total = stats.get("totalSynapses", 0)
    check(total > 0, f"Synapses exist in network: {total}")

    # ── Summary ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    total = PASS + FAIL
    print(f"  Results: {PASS}/{total} passed, {FAIL} failed")
    if ERRORS:
        print(f"\n  Failed tests:")
        for e in ERRORS:
            print(f"    - {e}")
    print("=" * 60 + "\n")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except httpx.ConnectError:
        print("\n\033[31mERROR: Cannot connect to Brain daemon on port 7777.\033[0m")
        print("Run 'brain start' or 'brain doctor' first.\n")
        sys.exit(2)
    except Exception as e:
        print(f"\n\033[31mFATAL: {e}\033[0m\n")
        import traceback
        traceback.print_exc()
        sys.exit(2)
