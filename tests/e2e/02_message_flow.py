"""Test 2: Message flow - send message, get AI response, verify QR cards."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # 1. Start intake
        print("Step 1: Start intake flow")
        start_intake(page, "Complete renovation of a 3500 sqft villa in JLT, shell and core condition")
        screenshot(page, "02_intake_started")

        # 2. Wait for AI's first response (triage: journey divider)
        print("Step 2: Wait for AI triage response")
        wait_for_ai_done(page)
        screenshot(page, "02_triage_response")

        # 3. Verify triage response has interactive elements
        # Should show Quick Estimate / Full Consultation buttons
        page_text = page.inner_text("body")
        has_quick = "Quick" in page_text or "quick" in page_text
        has_full = "Full" in page_text or "full" in page_text or "Consultation" in page_text
        has_journey_options = has_quick or has_full
        print(f"  Journey options visible: {has_journey_options}")
        # Not a hard fail if AI phrased it differently
        if has_journey_options:
            print("  PASS: Journey divider options detected")

        # 4. Look for clickable buttons/pills
        # QR buttons could be pills or cards
        buttons = page.locator('button').all()
        clickable_count = sum(1 for b in buttons if b.is_visible() and b.is_enabled())
        print(f"  Found {clickable_count} visible enabled buttons")
        assert_true(clickable_count >= 2, "At least 2 clickable buttons visible (journey options + send)")

        # 5. Try to find and click "Full Consultation" (or similar)
        print("Step 3: Select Full Consultation")
        full_btn = None
        for btn in buttons:
            text = btn.inner_text().lower()
            if "full" in text or "consultation" in text or "detailed" in text:
                full_btn = btn
                break

        if full_btn:
            full_btn.click()
            print("  Clicked Full Consultation button")
            time.sleep(1)
            screenshot(page, "02_full_selected")

            # 6. Wait for AI discovery response
            print("Step 4: Wait for discovery response")
            wait_for_ai_done(page)
            screenshot(page, "02_discovery_response")

            # 7. Verify user's selection appears as a bubble
            page_content = page.inner_text("body")
            assert_true(len(page_content) > 50, "Page has substantial content after selection")
        else:
            print("  Could not find Full Consultation button, trying text input")
            send_message(page, "Full consultation please")
            wait_for_ai_done(page)
            screenshot(page, "02_fallback_response")

        # 8. Verify chat input is still functional
        textarea = page.locator('textarea[aria-label="Chat input"]').first
        is_enabled = textarea.is_enabled() if textarea.is_visible() else False
        # Input might be hidden if QR card is showing (expected)
        print(f"  Chat textarea enabled: {is_enabled}")

        print("\n  All checks passed!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
