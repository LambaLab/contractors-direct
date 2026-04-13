"""Test 1: Session creation - landing page to intake overlay."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # 1. Load the landing page
        print("Step 1: Load landing page")
        page.goto(BASE_URL, wait_until="networkidle", timeout=PAGE_TIMEOUT)
        screenshot(page, "01_landing_page")

        # 2. Verify hero input exists
        hero = page.locator('textarea[aria-label="Describe your renovation project"]')
        assert_true(hero.is_visible(), "Hero textarea is visible")

        # 3. Type a project description
        print("Step 2: Type project description")
        hero.fill("I want to renovate my 2 bedroom apartment in Dubai Marina, modern style")
        screenshot(page, "01_typed_message")

        # 4. Click send
        print("Step 3: Submit message")
        page.locator('button[aria-label="Send message"]').click()

        # 5. Wait for the overlay to open
        print("Step 4: Wait for overlay")
        wait_for_overlay(page, timeout=30_000)
        screenshot(page, "01_overlay_opened")

        # 6. Verify session in localStorage
        print("Step 5: Verify session data")
        session = get_session_data(page)
        assert_true(session is not None, "Session data exists in localStorage")
        assert_true("sessionId" in session, "Session has sessionId")
        assert_true("proposalId" in session, "Session has proposalId")
        print(f"  Session ID: {session['sessionId'][:8]}...")
        print(f"  Proposal ID: {session['proposalId'][:8]}...")

        # 7. Wait for AI to respond
        print("Step 6: Wait for AI response")
        wait_for_ai_done(page)
        screenshot(page, "01_ai_responded")

        # 8. Verify at least one message bubble exists
        # Check that there's at least an assistant message
        assistant_bubbles = page.locator('[class*="rounded-2xl"][class*="bg-"]').count()
        assert_true(assistant_bubbles >= 1, f"At least 1 message bubble visible (found {assistant_bubbles})")

        print("\n  All checks passed!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
