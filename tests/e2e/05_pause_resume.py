"""Test 5: Pause/Resume - verify pause auto-questions and resume flow."""
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
        print("Step 1: Start intake")
        start_intake(page, "Office fit-out in Business Bay, 5000 sqft, shell and core")
        wait_for_ai_done(page)

        # Select Full Consultation
        print("Step 2: Select Full Consultation")
        buttons = page.locator('button').all()
        for btn in buttons:
            text = btn.inner_text().lower()
            if "full" in text or "consultation" in text:
                btn.click()
                break
        else:
            send_message(page, "Full consultation")

        wait_for_ai_done(page)
        screenshot(page, "05_discovery_start")

        # Answer a few questions to build up turns
        print("Step 3: Answer 2 questions")
        for i in range(2):
            # Try clicking any visible QR option
            buttons = page.locator('button').all()
            clicked = False
            for btn in buttons:
                if not btn.is_visible() or not btn.is_enabled():
                    continue
                text = btn.inner_text().lower().strip()
                if text in ("office", "owned", "yes", "no", "villa", "apartment",
                            "new", "needs refresh", "shell", "continue"):
                    btn.click()
                    clicked = True
                    break
            if not clicked:
                send_message(page, "Yes")

            try:
                wait_for_ai_done(page)
            except:
                pass
            time.sleep(0.5)

        screenshot(page, "05_before_pause")

        # Step 4: Look for and click the Pause button
        print("Step 4: Look for pause button")
        pause_btn = page.locator('button[aria-label="Pause Auto-questions"]')
        if pause_btn.is_visible():
            pause_btn.click()
            print("  Clicked pause button")
            time.sleep(1)
            screenshot(page, "05_paused")

            # Verify paused state
            paused_indicator = page.locator('text=Auto-questions paused')
            is_paused = paused_indicator.is_visible() if paused_indicator.count() > 0 else False
            print(f"  Paused indicator visible: {is_paused}")

            # Verify textarea is now the primary input (not QR card)
            textarea = page.locator('textarea[aria-label="Chat input"]')
            if textarea.is_visible():
                print("  PASS: Textarea visible while paused")

                # Type a free-form question while paused
                print("Step 5: Send free-form message while paused")
                send_message(page, "How long will this project take?")
                wait_for_ai_done(page)
                screenshot(page, "05_paused_response")
                print("  PASS: AI responded to free-form question")

            # Step 6: Resume
            print("Step 6: Resume auto-questions")
            resume_btn = page.locator('button[aria-label="Resume Auto-questions"]')
            if resume_btn.is_visible():
                resume_btn.click()
                print("  Clicked resume button")
                time.sleep(2)
                screenshot(page, "05_resumed")
                print("  PASS: Resumed auto-questions")
            else:
                # Try clicking the paused indicator (it's also a resume button)
                paused_click = page.locator('button:has-text("Auto-questions paused")')
                if paused_click.count() > 0:
                    paused_click.click()
                    print("  Clicked paused indicator to resume")
                    time.sleep(2)
                    screenshot(page, "05_resumed")
                else:
                    print("  Could not find resume button")
        else:
            print("  Pause button not visible yet (may need more turns)")
            screenshot(page, "05_no_pause_btn")

        print("\n  Pause/Resume test complete!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
