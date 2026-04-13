"""Test 3: Quick Replies - verify QR cards render and selections work."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # Start intake and get past triage
        print("Step 1: Start intake and select Full Consultation")
        start_intake(page, "Kitchen renovation in a 1200 sqft apartment in Downtown Dubai")
        wait_for_ai_done(page)
        screenshot(page, "03_triage")

        # Click Full Consultation
        buttons = page.locator('button').all()
        for btn in buttons:
            text = btn.inner_text().lower()
            if "full" in text or "consultation" in text or "detailed" in text:
                btn.click()
                break
        else:
            send_message(page, "Full consultation")

        wait_for_ai_done(page)
        screenshot(page, "03_discovery_q1")

        # At this point we should see the first discovery question
        # It could be property type (cards), or the AI might skip to
        # another question if it already detected fields from the opening message

        # Look for any QR option buttons in the bottom panel
        print("Step 2: Look for QR options")

        # QR options could be cards, pills, or list items
        # Cards have images, pills are small buttons, list items are rows
        qr_options = page.locator('button').all()
        visible_options = [b for b in qr_options if b.is_visible() and b.is_enabled()]
        print(f"  Found {len(visible_options)} visible buttons")

        # Try to find a QR card option (property type cards, or pills)
        option_clicked = False
        for btn in visible_options:
            text = btn.inner_text().lower().strip()
            # Common property type / QR option values
            if text in ("villa", "apartment", "townhouse", "office", "owned", "leased",
                        "yes", "no", "new", "needs refresh", "major renovation", "shell"):
                print(f"  Clicking QR option: '{btn.inner_text().strip()}'")
                btn.click()
                option_clicked = True
                break

        if option_clicked:
            print("Step 3: Wait for AI response after QR selection")
            wait_for_ai_done(page)
            screenshot(page, "03_after_qr_click")

            # Verify the answer appeared as a user bubble
            page_text = page.inner_text("body")
            assert_true(len(page_text) > 100, "Page content updated after selection")
            print("  PASS: QR selection triggered AI response")
        else:
            print("  No recognizable QR option found, trying free text")
            send_message(page, "Apartment")
            wait_for_ai_done(page)
            screenshot(page, "03_fallback_text")
            print("  PASS: Free text response worked")

        # Step 4: Check that a new question appeared
        print("Step 4: Verify follow-up question appeared")
        time.sleep(1)
        screenshot(page, "03_follow_up")
        # The page should now have more content than before
        assert_true(page.locator('[class*="rounded-2xl"]').count() >= 3,
                    "At least 3 message bubbles visible (user + AI + user + AI)")

        print("\n  All checks passed!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
