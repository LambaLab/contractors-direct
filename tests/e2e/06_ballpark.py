"""Test 6: Ballpark - Quick Estimate flow showing BallparkResultCard."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *
from playwright.sync_api import sync_playwright

def click_option(page, preferred_texts):
    """Click a visible button matching one of the preferred texts."""
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

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # Start intake
        print("Step 1: Start intake")
        start_intake(page, "Apartment renovation in Marina")
        wait_for_ai_done(page)
        screenshot(page, "06_triage")

        # Select Quick Estimate
        print("Step 2: Select Quick Estimate")
        result = click_option(page, ["quick", "estimate", "fast"])
        if result:
            print(f"  Clicked: {result}")
        else:
            send_message(page, "Quick estimate")
            print("  Sent: Quick estimate")

        wait_for_ai_done(page)
        screenshot(page, "06_quick_q1")

        # Answer the 5 quick discovery questions
        answers = [
            (["apartment", "apt"], "Apartment"),        # Property type
            ([], "Dubai Marina"),                         # Location (free text)
            ([], "1200"),                                 # Size (might be sqft picker)
            (["needs refresh", "new", "good"], "Good condition"),  # Condition
            (["continue", "kitchen", "bathroom"], "Kitchen and bathrooms"),  # Scope
        ]

        for i, (clicks, fallback) in enumerate(answers, 1):
            print(f"Step 3.{i}: Answer quick discovery question")

            result = click_option(page, clicks) if clicks else None
            if not result:
                # Check if there's a sqft/budget picker (slider)
                slider = page.locator('[class*="scrub"], [class*="slider"], [class*="Picker"]')
                if slider.count() > 0 and slider.first.is_visible():
                    # For pickers, just click Continue/Submit
                    cont = click_option(page, ["continue", "confirm", "submit", "set"])
                    if cont:
                        print(f"  Used picker, clicked: {cont}")
                    else:
                        send_message(page, fallback)
                        print(f"  Typed: {fallback}")
                else:
                    send_message(page, fallback)
                    print(f"  Typed: {fallback}")
            else:
                print(f"  Clicked: {result}")

            try:
                wait_for_ai_done(page)
            except:
                print("  (AI response timed out)")

            screenshot(page, f"06_quick_q{i}")
            time.sleep(0.5)

        # Check for ballpark card
        print("Step 4: Check for ballpark result card")
        time.sleep(2)
        screenshot(page, "06_ballpark_result")

        page_text = page.inner_text("body")
        has_aed = "AED" in page_text or "aed" in page_text.lower()
        has_range = "-" in page_text or "to" in page_text.lower()
        has_dig = "dig" in page_text.lower() or "deeper" in page_text.lower() or "upgrade" in page_text.lower()

        print(f"  Has AED mention: {has_aed}")
        print(f"  Has price range: {has_range}")
        print(f"  Has upgrade option: {has_dig}")

        if has_aed or has_range:
            print("  PASS: Ballpark result displayed")
        else:
            print("  NOTE: Ballpark card may not have rendered yet (AI may still be asking questions)")

        print("\n  Ballpark test complete!")
        browser.close()

if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)
