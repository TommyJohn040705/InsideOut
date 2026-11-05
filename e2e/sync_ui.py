"""Two-user UI test of live sync through the Firebase emulators.

    npm run test:sync-ui
(builds an emulator-connected copy of the app, starts the emulators, and runs this.)
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4300"


def map_click(page, x, y):
    page.locator("svg.map").scroll_into_view_if_needed()
    sx, sy = page.evaluate(
        """([x, y]) => { const s = document.querySelector('svg.map');
        const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return [p.x, p.y]; }""",
        [x, y],
    )
    page.mouse.click(sx, sy)


def pick(page, label, query, option):
    box = page.get_by_role("searchbox", name=label)
    box.click()
    box.fill(query)
    page.get_by_role("option", name=option).first.dispatch_event("mousedown")
    page.wait_for_timeout(200)


def main():
    errors = []
    with sync_playwright() as p:
        kw = {"channel": "chrome"} if os.path.exists("/usr/bin/google-chrome") else {}
        browser = p.chromium.launch(**kw)
        alice = browser.new_context(viewport={"width": 1300, "height": 900}).new_page()
        bob = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
        for pg in (alice, bob):
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(URL)
            expect(pg.locator(".sync-pill")).to_have_text("Live", timeout=15000)

        # Bob is routing from Room 101 to Room 105 along the north corridor.
        pick(bob, "From", "101", "Room 101")
        pick(bob, "To", "105", "Room 105")
        expect(bob.locator("line.walkway.blocked")).to_have_count(0)

        # Alice reports that corridor blocked on her laptop.
        alice.get_by_role("button", name="Report", exact=True).click()
        map_click(alice, 25, 10)
        alice.get_by_placeholder("Optional note").fill("Construction")
        alice.get_by_role("button", name="Submit report").click()

        # Bob's phone sees it and reroutes automatically.
        expect(bob.locator("line.walkway.blocked")).to_have_count(1, timeout=10000)
        expect(bob.locator(".toast")).to_contain_text("Route updated")
        print("PASS  report from Alice reached Bob and rerouted him")

        # Bob confirms; Alice sees 2 confirmations.
        bob.get_by_role("button", name="Report", exact=True).click()
        bob.locator("ul.reports li").filter(has_text="Construction").get_by_role("button", name="Still there").click()
        expect(alice.locator("ul.reports li").filter(has_text="Construction")).to_contain_text("2 confirmed", timeout=10000)
        print("PASS  Bob's confirmation reached Alice")

        # Alice and Bob both clear it; it disappears for both.
        alice.locator("ul.reports li").filter(has_text="Construction").get_by_role("button", name="Cleared").click()
        expect(bob.locator("ul.reports li").filter(has_text="Construction")).to_contain_text("1 cleared", timeout=10000)
        bob.locator("ul.reports li").filter(has_text="Construction").get_by_role("button", name="Cleared").click()
        expect(alice.locator("line.walkway.blocked")).to_have_count(0, timeout=10000)
        print("PASS  clearing removed the closure for everyone")

        # Alice edits the map and submits it for approval (no admin, so it stays pending).
        alice.get_by_role("button", name="Edit map").click()
        expect(alice.get_by_role("button", name="Submit for approval")).to_be_disabled()
        map_click(alice, 10, 4)
        props = alice.locator(".props").first
        props.get_by_label("Name").fill("Dean Office")
        props.get_by_label("Name").blur()
        alice.get_by_label("Note for the reviewer").fill("Renamed 101")
        alice.get_by_role("button", name="Submit for approval").click()
        expect(alice.locator(".toast")).to_contain_text("Submitted for approval")
        expect(alice.locator(".chip.status-pending")).to_have_count(1, timeout=10000)
        print("PASS  map edit submitted for approval and shown as pending")

        # Bob still sees the original map.
        bob.get_by_role("button", name="Navigate").click()
        bob.get_by_role("searchbox", name="From").fill("dean")
        expect(bob.locator(".results [role=option]")).to_have_count(0)
        print("PASS  unapproved edit is not visible to other users")
        browser.close()

    if errors:
        print("Browser errors:", *errors, sep="\n  ")
        sys.exit(1)
    print("SYNC UI TEST PASSED")


if __name__ == "__main__":
    main()
