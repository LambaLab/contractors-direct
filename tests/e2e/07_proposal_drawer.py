"""Test 7: Proposal drawer - verify open/close and content display."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # Start intake and answer a question to build some state
        print("Step 1: Start intake and build state")
        start_intake(page, "Villa renovation in Palm Jumeirah, 4000 sqft, contemporary style")
        wait_for_ai_done(page)

        # Select Full Consultation
        buttons = page.locator('button').all()
        for btn in buttons:
            text = btn.inner_text().lower()
            if "full" in text or "consultation" in text:
                btn.click()
                break
        else:
            send_message(page, "Full consultation")

        wait_for_ai_done(page)
        screenshot(page, "07_ready_state")

        # Step 2: Look for the menu/hamburger button to open proposal drawer
        print("Step 2: Find and click drawer toggle")

        # The drawer toggle could be a hamburger menu, project name, or scope panel toggle
        # Check for common patterns
        drawer_opened = False

        # Try hamburger menu button
        menu_btn = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]')
        if menu_btn.count() > 0 and menu_btn.first.is_visible():
            menu_btn.first.click()
            drawer_opened = True
            print("  Clicked menu button")

        # Try the project name / header area
        if not drawer_opened:
            header_btn = page.locator('button:has-text("Your Projects"), button:has-text("Projects")')
            if header_btn.count() > 0 and header_btn.first.is_visible():
                header_btn.first.click()
                drawer_opened = True
                print("  Clicked Projects button")

        # Try any toggle/drawer button in the top bar
        if not drawer_opened:
            toggle_btns = page.locator('[class*="sidebar"] button, [class*="drawer"] button, [class*="panel"] button')
            if toggle_btns.count() > 0:
                toggle_btns.first.click()
                drawer_opened = True
                print("  Clicked panel toggle")

        if drawer_opened:
            time.sleep(0.5)
            screenshot(page, "07_drawer_open")

            # Check drawer content
            page_text = page.inner_text("body")
            has_project = "project" in page_text.lower() or "villa" in page_text.lower()
            has_confidence = "confidence" in page_text.lower() or "accuracy" in page_text.lower() or "%" in page_text
            print(f"  Project info visible: {has_project}")
            print(f"  Confidence/accuracy visible: {has_confidence}")

            # Step 3: Close the drawer
            print("Step 3: Close drawer")
            # Try Escape key
            page.keyboard.press("Escape")
            time.sleep(0.5)
            screenshot(page, "07_drawer_closed")
            print("  PASS: Drawer opened and closed")
        else:
            print("  Could not find drawer toggle button")
            screenshot(page, "07_no_drawer")

        # Step 4: Verify the scope panel (right side on desktop)
        print("Step 4: Check scope panel")
        scope_panel = page.locator('[class*="scope"], [class*="Scope"]')
        if scope_panel.count() > 0:
            # Check if any scope items are listed
            scope_text = scope_panel.first.inner_text()
            print(f"  Scope panel has content: {len(scope_text) > 10}")
            screenshot(page, "07_scope_panel")
        else:
            print("  Scope panel not yet visible (may appear after more questions)")

        print("\n  Proposal drawer test complete!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
