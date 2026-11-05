"""End-to-end smoke test for InsideOut (desktop and mobile).

Run against a running app:
    npm run build && npm start &          # http://localhost:3000
    python3 e2e/smoke.py http://localhost:3000 [screenshot-dir]

Requires: pip install playwright (uses the system Chrome if available).
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


def map_click(page, x, y):
    """Clicks the map at floor coordinates (metres)."""
    sx, sy = page.evaluate(
        """([x, y]) => {
            const svg = document.querySelector('svg.map');
            const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
            return [p.x, p.y];
        }""",
        [x, y],
    )
    page.mouse.click(sx, sy)


def pick(page, label, query, option):
    box = page.get_by_role("searchbox", name=label)
    box.click()
    box.fill(query)
    page.get_by_role("option", name=option).first.dispatch_event("mousedown")
    page.wait_for_timeout(250)  # let the picker close


def fresh(page):
    page.goto(URL)
    page.evaluate("localStorage.clear()")
    page.reload()


def desktop(browser, errors):
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and "api/health" not in m.text and errors.append(m.text))
    fresh(page)

    # 1. Search and route across floors.
    pick(page, "From", "entrance", "Main Entrance")
    pick(page, "To", "301", "Lecture Hall 301")
    steps = page.locator("ol.steps li")
    expect(steps.first).to_contain_text("Start at Main Entrance")
    expect(steps.last).to_contain_text("Arrive at Lecture Hall 301")
    expect(page.locator(".route-summary")).to_contain_text("min")
    assert page.locator(".route line").count() >= 2, "route not drawn"
    shot(page, "01-route")

    # 2. Accessible route uses the elevator, never stairs.
    page.get_by_label("Wheelchair accessible").check()
    expect(page.locator("ol.steps")).to_contain_text("Take the elevator to Floor 3")
    expect(page.locator("ol.steps")).not_to_contain_text("stairs")

    # 3. Turn-by-turn navigation HUD.
    page.get_by_role("button", name="Start", exact=True).click()
    hud = page.locator(".hud")
    expect(hud).to_contain_text("Step 1 of")
    page.get_by_role("button", name="Next").click()
    expect(hud).to_contain_text("Step 2 of")
    expect(page.locator(".walker")).to_have_count(1)
    shot(page, "02-navigation-hud")
    page.get_by_role("button", name="End").click()
    expect(hud).to_have_count(0)

    # 4. Report the elevator out of service: no step-free route remains.
    page.get_by_role("button", name="Report", exact=True).click()
    page.get_by_role("tab", name="Floor 1").click()
    page.locator("g.node.elevator").first.click()
    page.get_by_placeholder("Optional note").fill("Out of order")
    page.get_by_role("button", name="Submit report").click()
    expect(page.locator(".error")).to_contain_text("No step-free route")
    expect(page.locator("ul.reports")).to_contain_text("Elevator out of service")
    shot(page, "03-elevator-out")
    page.get_by_role("button", name="Cleared").click()
    expect(page.locator("ol.steps")).to_contain_text("Take the elevator")

    # 5. Block a corridor on the active route and check it reroutes.
    page.get_by_label("Wheelchair accessible").uncheck()
    pick(page, "From", "101", "Room 101")
    pick(page, "To", "105", "Room 105")
    before = page.locator(".route-summary b").inner_text()
    map_click(page, 25, 10)  # north corridor between x=20 and x=30
    page.get_by_role("button", name="Submit report").click()
    expect(page.locator(".toast")).to_contain_text("Route updated")
    expect(page.locator("line.walkway.blocked")).to_have_count(1)
    shot(page, "04-reroute")
    print("  reroute:", before, "->", page.locator(".route-summary b").inner_text())

    # 6. Quick destination chip and the assistant.
    page.get_by_role("button", name="Navigate").click()
    pick(page, "From", "205", "Room 205")
    page.get_by_role("button", name="Washroom", exact=True).click()
    expect(page.locator("ol.steps li").last).to_contain_text("Arrive at Washrooms (Floor 2)")
    page.get_by_role("button", name="Ask", exact=True).click()
    page.get_by_role("button", name="Where can I get food?").click()
    expect(page.locator(".msg.ai").last).to_contain_text("Cafeteria")
    page.get_by_role("button", name="Route to Cafeteria").click()
    expect(page.locator("ol.steps li").last).to_contain_text("Arrive at Cafeteria")
    shot(page, "05-assistant-route")

    # 7. Editor: add a room, connect it, and route to it.
    page.get_by_role("button", name="Edit map").click()
    page.get_by_role("tab", name="Floor 1").click()
    page.get_by_role("button", name="+ Room").click()
    map_click(page, 58, 27)
    page.get_by_role("button", name="Select / move").click()
    name_box = page.locator(".props input").nth(0)
    name_box.fill("Server Room")
    name_box.blur()
    page.get_by_role("button", name="Connect").click()
    map_click(page, 58, 27)  # the new room
    map_click(page, 55, 20)  # corridor point at the east end of the south hallway
    expect(page.locator(".error")).to_have_count(0)
    shot(page, "06-editor")
    page.get_by_role("button", name="Navigate").click()
    pick(page, "From", "101", "Room 101")
    pick(page, "To", "server", "Server Room")
    expect(page.locator("ol.steps li").last).to_contain_text("Arrive at Server Room")

    # 8. Add a floor from a (sample) AI result and verify it before saving.
    page.get_by_role("button", name="Add floor").click()
    page.get_by_role("button", name="Try a sample result").click()
    expect(page.locator(".draft-list input[type=checkbox]")).to_have_count(16)
    page.get_by_label("Keep Office 405").uncheck()
    page.get_by_label("Link Elevator to another floor").select_option("elevator-main")
    shot(page, "07-import-review")
    page.get_by_role("button", name="Add verified floor").click()
    expect(page.get_by_role("tab", name="Floor 4")).to_be_visible()
    page.get_by_role("button", name="Navigate").click()
    page.get_by_label("Wheelchair accessible").check()
    pick(page, "From", "entrance", "Main Entrance")
    pick(page, "To", "402", "Room 402")
    expect(page.locator("ol.steps")).to_contain_text("Take the elevator to Floor 4")
    shot(page, "08-imported-route")

    # 9. FloorNav sample buildings with plan images and turn instructions.
    page.get_by_label("Building").select_option(label="Helix Innovation Hub")
    expect(page.locator("svg.map image.floor-image")).to_have_count(1)
    page.get_by_label("Wheelchair accessible").uncheck()
    pick(page, "From", "lobby", "Main Reception")
    pick(page, "To", "boardroom", "Boardroom Atlas")
    expect(page.locator("ol.steps")).to_contain_text("turn")
    shot(page, "09-helix")

    # 10. Persistence across reloads.
    page.get_by_label("Building").select_option(label="Demo Hall")
    page.reload()
    expect(page.get_by_role("tab", name="Floor 4")).to_be_visible()
    page.close()


def mobile(browser, errors):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))
    fresh(page)
    shot(page, "10-mobile-home")
    pick(page, "From", "entrance", "Main Entrance")
    pick(page, "To", "library", "Library")
    expect(page.locator("ol.steps li").last).to_contain_text("Arrive at Library")
    width = page.evaluate("document.documentElement.scrollWidth")
    assert width <= 392, f"horizontal overflow on mobile: {width}px"
    shot(page, "11-mobile-route")
    page.get_by_role("button", name="Start", exact=True).click()
    expect(page.locator(".hud")).to_be_in_viewport()
    shot(page, "12-mobile-hud")
    page.get_by_role("button", name="End").click()
    page.get_by_role("button", name="Add floor").click()
    expect(page.get_by_role("button", name="Scan with camera")).to_be_visible()
    page.close()


def main():
    errors = []
    with sync_playwright() as p:
        kwargs = {"channel": "chrome"} if os.path.exists("/usr/bin/google-chrome") else {}
        browser = p.chromium.launch(**kwargs)
        print("desktop...")
        desktop(browser, errors)
        print("mobile...")
        mobile(browser, errors)
        browser.close()
    if errors:
        print("Browser errors:", *errors, sep="\n  ")
        sys.exit(1)
    print("E2E smoke test passed")


if __name__ == "__main__":
    main()
