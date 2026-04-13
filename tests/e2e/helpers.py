"""Shared helpers for Playwright E2E tests."""
import time
import os
import json

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3002")
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
PYTHON = "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"

# Timeouts (ms)
PAGE_TIMEOUT = 60_000
AI_TIMEOUT = 120_000  # AI responses can take a while


def ensure_screenshot_dir():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def screenshot(page, name):
    ensure_screenshot_dir()
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  [screenshot] {name}.png")
    return path


def wait_for_overlay(page, timeout=PAGE_TIMEOUT):
    """Wait for the intake overlay to mount (chat textarea appears)."""
    page.wait_for_selector(
        'textarea[aria-label="Chat input"]',
        timeout=timeout,
        strict=False,
    )


def wait_for_ai_done(page, timeout=AI_TIMEOUT):
    """Wait for AI streaming to finish.

    Detected by the chat input textarea becoming enabled again,
    or a QR card / picker appearing.
    """
    # Wait for the textarea to not be disabled (use strict=False since
    # desktop + mobile layouts both render a textarea with the same label)
    page.wait_for_selector(
        'textarea[aria-label="Chat input"]:not([disabled])',
        timeout=timeout,
        strict=False,
    )
    # Extra settle time for QR card rendering
    time.sleep(1.5)


def send_message(page, text):
    """Type and send a message in the chat input."""
    textarea = page.locator('textarea[aria-label="Chat input"]').first
    textarea.fill(text)
    page.locator('button[aria-label="Send message"]').first.click()


def get_session_data(page):
    """Read the cd_session from localStorage."""
    raw = page.evaluate("localStorage.getItem('cd_session')")
    if raw:
        return json.loads(raw)
    return None


def count_message_bubbles(page):
    """Count visible message bubbles in the chat."""
    return page.locator('[class*="rounded-2xl"][class*="px-"]').count()


def get_last_assistant_text(page):
    """Get the text content of the last assistant message bubble."""
    bubbles = page.locator('[class*="bg-secondary"]')
    if bubbles.count() > 0:
        return bubbles.last.inner_text()
    return ""


def assert_true(condition, message):
    """Simple assertion with clear error messages."""
    if condition:
        print(f"  PASS: {message}")
    else:
        print(f"  FAIL: {message}")
        raise AssertionError(message)


def start_intake(page, idea="I want to renovate my 2 bedroom apartment in Dubai Marina"):
    """Navigate to homepage and submit an idea to open the intake overlay."""
    page.goto(BASE_URL, wait_until="networkidle", timeout=PAGE_TIMEOUT)
    time.sleep(1)

    # Find the hero textarea and type the idea
    hero = page.locator('textarea').first
    hero.fill(idea)

    # Click the send/submit button
    send_btn = page.locator('button[type="submit"], button[aria-label="Send message"], button[aria-label="Start your project"]').first
    send_btn.click()

    # Wait for the overlay to appear
    wait_for_overlay(page)
