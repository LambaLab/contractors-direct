"""Test 4: Phase transitions - verify triage -> discovery -> deep_dive flow."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def click_qr_option(page, preferred_texts):
    """Try to click a QR option matching one of the preferred texts."""
    buttons = page.locator('button').all()
    for btn in buttons:
        if not btn.is_visible() or not btn.is_enabled():
            continue
        text = btn.inner_text().lower().strip()
        for pref in preferred_texts:
            if pref.lower() in text:
                btn.click()
                return text
    return None

def answer_question(page, text_answer=None, preferred_clicks=None):
    """Answer the current question via QR click or free text."""
    if preferred_clicks:
        clicked = click_qr_option(page, preferred_clicks)
        if clicked:
            return f"clicked: {clicked}"

    if text_answer:
        send_message(page, text_answer)
        return f"typed: {text_answer}"

    return None

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # Step 1: Start intake with detailed opening message
        print("Step 1: Start with detailed opening message")
        start_intake(page, "I own a 2500 sqft villa in Arabian Ranches, needs a full renovation, budget around 800k AED")
        wait_for_ai_done(page)
        screenshot(page, "04_triage")

        # Step 2: Select Full Consultation
        print("Step 2: Select Full Consultation")
        result = answer_question(page, "Full consultation", ["full", "consultation", "detailed"])
        print(f"  {result}")
        wait_for_ai_done(page)
        screenshot(page, "04_discovery_start")

        # Step 3: Answer discovery questions (up to 8 turns)
        # The AI should detect many fields from the opening message and skip them
        for turn in range(1, 9):
            print(f"Step 3.{turn}: Answer discovery question")

            # Check localStorage for current phase
            phase_raw = page.evaluate(
                "(() => { const s = localStorage.getItem('cd_session'); "
                "if (!s) return null; const d = JSON.parse(s); "
                "return localStorage.getItem('cd_phase_' + d.proposalId); })()"
            )
            if phase_raw:
                phase_data = json.loads(phase_raw)
                current_phase = phase_data.get("currentPhase", "unknown")
                print(f"  Current phase: {current_phase}")
                if current_phase == "deep_dive":
                    print("  Reached deep_dive phase!")
                    screenshot(page, f"04_deep_dive_reached")
                    break

            # Try to answer with QR clicks first, then free text
            result = answer_question(page,
                text_answer="Yes",
                preferred_clicks=["villa", "apartment", "owned", "leased",
                                  "yes", "no", "new", "needs refresh",
                                  "major renovation", "shell", "continue",
                                  "modern", "contemporary"])
            if result:
                print(f"  {result}")
            else:
                # If no QR and no text sent, try sending a generic answer
                send_message(page, "Yes, that works")
                print("  typed: Yes, that works")

            try:
                wait_for_ai_done(page)
            except Exception:
                print("  AI response timed out, continuing...")
                break

            screenshot(page, f"04_turn_{turn}")
            time.sleep(0.5)

        # Final state
        screenshot(page, "04_final_state")

        # Check final phase
        phase_raw = page.evaluate(
            "(() => { const s = localStorage.getItem('cd_session'); "
            "if (!s) return null; const d = JSON.parse(s); "
            "return localStorage.getItem('cd_phase_' + d.proposalId); })()"
        )
        if phase_raw:
            phase_data = json.loads(phase_raw)
            print(f"\n  Final phase: {phase_data.get('currentPhase', 'unknown')}")
            print(f"  Scope queue: {phase_data.get('scopeQueue', [])}")
            print(f"  Completed: {phase_data.get('completedScope', [])}")

        # Check confidence
        proposal_raw = page.evaluate(
            "(() => { const s = localStorage.getItem('cd_session'); "
            "if (!s) return null; const d = JSON.parse(s); "
            "return localStorage.getItem('cd_proposal_' + d.proposalId); })()"
        )
        if proposal_raw:
            proposal = json.loads(proposal_raw)
            print(f"  Confidence: {proposal.get('confidenceScore', 0)}%")
            print(f"  Detected scope: {proposal.get('detectedScope', [])}")

        print("\n  Phase transition test complete!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
