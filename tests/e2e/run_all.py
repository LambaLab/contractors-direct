"""Run all E2E tests sequentially and report results."""
import subprocess, sys, os, time

SCRIPTS = [
    "01_session_creation.py",
    "02_message_flow.py",
    "03_quick_replies.py",
    "04_phase_transitions.py",
    "05_pause_resume.py",
    "06_ballpark.py",
    "07_proposal_drawer.py",
]

PYTHON = "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    passed = 0
    failed = 0
    results = []

    for script in SCRIPTS:
        path = os.path.join(SCRIPT_DIR, script)
        print(f"\n{'='*60}")
        print(f"  Running: {script}")
        print(f"{'='*60}")

        start = time.time()
        result = subprocess.run(
            [PYTHON, path],
            cwd=SCRIPT_DIR,
            timeout=180,  # 3 min max per test
        )
        elapsed = time.time() - start

        if result.returncode == 0:
            passed += 1
            status = "PASSED"
        else:
            failed += 1
            status = f"FAILED (exit {result.returncode})"

        results.append((script, status, elapsed))
        print(f"\n  {status} ({elapsed:.1f}s)")

    print(f"\n{'='*60}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*60}")
    for script, status, elapsed in results:
        icon = "+" if "PASSED" in status else "x"
        print(f"  [{icon}] {script}: {status} ({elapsed:.1f}s)")
    print(f"\n  Total: {passed} passed, {failed} failed, {passed+failed} total")
    print(f"  Screenshots: {os.path.join(SCRIPT_DIR, 'screenshots')}/")

    sys.exit(1 if failed > 0 else 0)

if __name__ == "__main__":
    main()
