"""Control-by-control audit of the InsideOut UI.

Clicks every control in every mode and records PASS/FAIL for each instead of
stopping at the first failure. Run against a running app:
    python3 e2e/audit.py http://localhost:3000
"""
import json
import os
import re
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
results = []


def check(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
    except Exception as e:  # noqa: BLE001
        lines = [l.strip() for l in str(e).splitlines() if l.strip()]
        msg = " | ".join(lines[:3])[:260]
        results.append(("FAIL", name, msg))


def map_click(page, x, y):
    page.locator("svg.map").scroll_into_view_if_needed()
    sx, sy = page.evaluate(
        """([x, y]) => { const s = document.querySelector('svg.map');
        const p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return [p.x, p.y]; }""",
        [x, y],
    )
    page.mouse.click(sx, sy)


def map_drag(page, x0, y0, x1, y1):
    page.locator("svg.map").scroll_into_view_if_needed()
    pts = page.evaluate(
        """(a) => { const s = document.querySelector('svg.map'); const m = s.getScreenCTM();
        return a.map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(m); return [p.x, p.y]; }); }""",
        [[x0, y0], [x1, y1]],
    )
    page.mouse.move(*pts[0])
    page.mouse.down()
    page.mouse.move((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, steps=5)
    page.mouse.move(*pts[1], steps=5)
    page.mouse.up()


def pick(page, label, query, option):
    box = page.get_by_role("searchbox", name=label)
    box.click()
    box.fill(query)
    page.get_by_role("option", name=option).first.dispatch_event("mousedown")
    page.wait_for_timeout(200)


def mode(page, name):
    page.get_by_role("button", name=name, exact=True).click()


def run(page):
    steps = page.locator("ol.steps li")

    # ---------------- Navigate ----------------
    def nav_pick_and_swap():
        pick(page, "From", "101", "Room 101")
        pick(page, "To", "library", "Library")
        expect(steps.last).to_contain_text("Library")
        page.get_by_role("button", name="Swap").click()
        expect(steps.last).to_contain_text("Room 101")
        expect(steps.first).to_contain_text("Library")
    check("Navigate: From/To search + Swap", nav_pick_and_swap)

    def nav_clear():
        page.get_by_role("button", name="Clear To").click()
        expect(page.locator(".route-summary")).to_have_count(0)
        page.get_by_role("button", name="Clear From").click()
        expect(page.get_by_role("searchbox", name="From")).to_have_value("")
    check("Navigate: clear (x) buttons", nav_clear)

    def nav_enter_key():
        box = page.get_by_role("searchbox", name="From")
        box.click()
        box.fill("cafeteria")
        box.press("Enter")
        page.wait_for_timeout(200)
        expect(box).to_have_value("Cafeteria")
    check("Navigate: Enter picks first search result", nav_enter_key)

    def nav_floor_tabs():
        for f in ["Floor 3", "Floor 2", "Floor 1"]:
            page.get_by_role("tab", name=f).click()
            expect(page.locator("svg.map")).to_have_attribute("aria-label", f"Map of {f}")
    check("Navigate: floor tabs", nav_floor_tabs)

    def nav_map_tap():
        page.get_by_role("button", name="Clear From").click()
        page.get_by_role("tab", name="Floor 1").click()
        map_click(page, 10, 4)   # Room 101
        map_click(page, 50, 26)  # Room 110
        expect(steps.last).to_contain_text("Room 110")
    check("Navigate: tap rooms on the map to set A and B", nav_map_tap)

    for chip, expected in [("Washroom", "Washrooms (Floor 1)"), ("Food", "Cafeteria"), ("Elevator", "Elevator"), ("Exit", "Main Entrance")]:
        def chip_check(chip=chip, expected=expected):
            page.get_by_role("button", name=chip, exact=True).click()
            expect(steps.last).to_contain_text(expected)
        check(f"Navigate: quick chip '{chip}'", chip_check)

    def chip_without_start():
        page.get_by_role("button", name="Clear To").click()
        page.get_by_role("button", name="Clear From").click()
        page.get_by_role("button", name="Washroom", exact=True).click()
        expect(page.locator(".toast")).to_contain_text("starting point")
    check("Navigate: quick chip without a start explains why", chip_without_start)

    def step_click_switches_floor():
        pick(page, "From", "entrance", "Main Entrance")
        pick(page, "To", "301", "Lecture Hall 301")
        steps.last.locator("button").click()
        expect(page.get_by_role("tab", name="Floor 3")).to_have_attribute("aria-selected", "true")
    check("Navigate: clicking a step shows its floor", step_click_switches_floor)

    # ---------------- HUD ----------------
    def hud_controls():
        page.get_by_role("button", name="Start", exact=True).click()
        hud = page.locator(".hud")
        expect(hud).to_contain_text("Step 1 of")
        expect(page.get_by_role("button", name="Previous step")).to_be_disabled()
        page.get_by_role("button", name="Next").click()
        expect(hud).to_contain_text("Step 2 of")
        page.get_by_role("button", name="Previous step").click()
        expect(hud).to_contain_text("Step 1 of")
    check("HUD: Start / Next / Back", hud_controls)

    def hud_auto():
        page.get_by_role("button", name="Auto walk").click()
        expect(page.locator(".hud")).to_contain_text("Step 2 of", timeout=8000)
        page.get_by_role("button", name="Pause").click()
    check("HUD: Auto walk advances and pauses", hud_auto)

    def hud_floor_follow():
        hud = page.locator(".hud")
        for _ in range(10):
            if "Floor 3" in hud.inner_text() and "Take the" not in hud.inner_text():
                break
            page.get_by_role("button", name="Next").click()
        expect(page.get_by_role("tab", name="Floor 3")).to_have_attribute("aria-selected", "true")
    check("HUD: map follows the walker to the next floor", hud_floor_follow)

    def hud_voice():
        btn = page.get_by_role("button", name=re.compile("^Voice"))
        if btn.count() == 0:
            return  # speech not supported in this browser
        before = btn.inner_text()
        btn.click()
        expect(btn).not_to_have_text(before)
    check("HUD: Voice toggle", hud_voice)

    def hud_end():
        page.get_by_role("button", name="End").click()
        expect(page.locator(".hud")).to_have_count(0)
        expect(page.get_by_role("button", name="Start", exact=True)).to_be_visible()
    check("HUD: End", hud_end)

    # ---------------- Ask ----------------
    mode(page, "Ask")
    for q, expected in [("Nearest washroom", "Washrooms"), ("Where can I get food?", "Cafeteria"), ("Take me to the nearest exit", "Main Entrance"), ("Where is the elevator?", "Elevator")]:
        def ask_chip(q=q, expected=expected):
            page.get_by_role("button", name=q).click()
            expect(page.locator(".msg.ai").last).to_contain_text(expected)
        check(f"Ask: suggestion '{q}'", ask_chip)

    def ask_free_text():
        box = page.get_by_role("textbox", name="Ask a question")
        box.fill("where is room 207")
        page.get_by_role("button", name="Ask", exact=True).last.click()
        expect(page.locator(".msg.ai").last).to_contain_text("Room 207")
        page.locator(".msg.ai").last.get_by_role("button").click()
        expect(steps.last).to_contain_text("Room 207")
    check("Ask: free text + Route to", ask_free_text)

    # ---------------- Report ----------------
    mode(page, "Report")

    def report_cancel():
        page.get_by_role("tab", name="Floor 1").click()
        map_click(page, 15, 20)
        expect(page.locator(".modal")).to_be_visible()
        page.get_by_role("button", name="Cancel").click()
        expect(page.locator(".modal")).to_have_count(0)
    check("Report: corridor dialog + Cancel", report_cancel)

    def report_stairs_and_confirm():
        page.locator("g.node.stairs").first.click()
        page.get_by_role("button", name="Submit report").click()
        item = page.locator("ul.reports li").filter(has_text="Stairwell closed")
        expect(item).to_contain_text("1 confirmed")
        item.get_by_role("button", name="Still there").click()
        expect(item).to_contain_text("2 confirmed")
        item.get_by_role("button", name="Cleared").click()
        expect(item).to_contain_text("1 cleared")
        item.get_by_role("button", name="Cleared").click()
        expect(page.locator("ul.reports li").filter(has_text="Stairwell closed")).to_have_count(0)
    check("Report: stairwell + Still there + Cleared", report_stairs_and_confirm)

    def report_enter_submits():
        map_click(page, 15, 20)
        page.get_by_placeholder("Optional note").fill("Wet floor")
        page.get_by_placeholder("Optional note").press("Enter")
        expect(page.locator("ul.reports")).to_contain_text("Wet floor")
        page.locator("ul.reports li").filter(has_text="Wet floor").get_by_role("button", name="Cleared").click()
    check("Report: Enter submits with note", report_enter_submits)

    # ---------------- Edit ----------------
    mode(page, "Edit map")
    page.get_by_role("tab", name="Floor 1").click()

    for tool, cls, xy in [("+ Corridor point", "corridor", (40, 15)), ("+ Entrance", "entrance", (1, 28)), ("+ Stairs", "stairs", (45, 15)), ("+ Elevator", "elevator", (15, 15))]:
        def add_tool(tool=tool, cls=cls, xy=xy):
            n = page.locator(f"g.node.{cls}").count()
            page.get_by_role("button", name=tool).click()
            map_click(page, *xy)
            expect(page.locator(f"g.node.{cls}")).to_have_count(n + 1)
        check(f"Edit: {tool}", add_tool)

    def edit_select_props():
        page.get_by_role("button", name="Select / move").click()
        map_click(page, 10, 4)
        props = page.locator(".props").first
        props.get_by_label("Name").fill("Dean's Office")
        props.get_by_label("Name").blur()
        props.get_by_label("Search aliases").fill("dean, 101")
        props.get_by_label("Search aliases").blur()
        expect(page.locator("svg.map")).to_contain_text("Dean's Office")
    check("Edit: select, rename, aliases", edit_select_props)

    def edit_type_change():
        props = page.locator(".props").first
        props.get_by_label("Type").select_option("entrance")
        expect(page.locator("g.node.entrance").filter(has_text="Dean's Office")).to_have_count(1)
        props.get_by_label("Type").select_option("room")
    check("Edit: change point type", edit_type_change)

    def edit_drag():
        before = page.locator(".props small.muted").first.inner_text()
        map_drag(page, 10, 4, 12, 6)
        expect(page.locator(".props small.muted").first).not_to_have_text(before)
    check("Edit: drag to move", edit_drag)

    def edit_connect_error():
        page.get_by_role("button", name="Connect").click()
        map_click(page, 10, 26)
        page.get_by_role("tab", name="Floor 2").click()
        map_click(page, 10, 26)
        expect(page.locator(".panel .error")).to_contain_text("Only stairs")
    check("Edit: Connect rejects room-to-room across floors", edit_connect_error)

    def edit_delete_segment():
        page.get_by_role("tab", name="Floor 1").click()
        page.get_by_role("button", name="Delete", exact=True).click()
        n = page.locator("line.walkway").count()
        map_click(page, 45, 10)
        expect(page.locator("line.walkway")).to_have_count(n - 1)
    check("Edit: Delete corridor segment", edit_delete_segment)

    def edit_delete_point():
        n = page.locator("g.node.corridor").count()
        map_click(page, 40, 15)  # corridor point added above
        expect(page.locator("g.node.corridor")).to_have_count(n - 1)
    check("Edit: Delete point", edit_delete_point)

    def edit_floor_rename_add_delete():
        page.get_by_role("button", name="Select / move").click()
        floor_box = page.get_by_label("Floor name")
        floor_box.fill("Ground")
        floor_box.blur()
        expect(page.get_by_role("tab", name="Ground")).to_be_visible()
        page.get_by_role("button", name="Add floor above").click()
        expect(page.get_by_role("tab", name="Floor 4")).to_have_attribute("aria-selected", "true")
        page.get_by_role("button", name="Delete this floor").click()
        expect(page.get_by_role("tab", name="Floor 4")).to_have_count(0)
    check("Edit: rename / add / delete floor", edit_floor_rename_add_delete)

    def edit_export():
        btn = page.get_by_role("button", name="Export JSON")
        with page.expect_download(timeout=5000) as dl:
            btn.click()
        data = json.loads(open(dl.value.path()).read())
        assert data["name"] == "Demo Hall", data.get("name")
    check("Edit: Export JSON downloads the building", edit_export)

    def edit_copy():
        btn = page.get_by_role("button", name="Copy JSON")
        btn.click()
        expect(page.locator(".toast")).to_contain_text("copied")
    check("Edit: Copy JSON (works where downloads are blocked)", edit_copy)

    def edit_import():
        tmp = os.path.join(tempfile.gettempdir(), "io-import.json")
        data = page.evaluate("JSON.parse(localStorage.getItem('insideout.buildings.v2'))[0]")
        data["name"] = "Imported Hall"
        open(tmp, "w").write(json.dumps(data))
        page.locator("input[type=file][accept*=json]").set_input_files(tmp)
        expect(page.get_by_label("Building")).to_contain_text("Imported Hall")
    check("Edit: Import JSON adds a building", edit_import)

    def edit_reset():
        page.get_by_label("Building").select_option(label="Demo Hall")
        page.get_by_role("button", name="Reset to demo").click()
        expect(page.get_by_role("tab", name="Floor 1")).to_be_visible()
        expect(page.locator("svg.map")).not_to_contain_text("Dean's Office")
    check("Edit: Reset to demo", edit_reset)

    # ---------------- Add floor ----------------
    mode(page, "Add floor")

    def add_camera():
        page.get_by_role("button", name="Scan with camera").click()
        expect(page.get_by_role("dialog", name="Scan a floor plan with the camera")).to_be_visible()
        page.get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("button", name="Scan with camera")).to_be_visible()
    check("Add floor: Scan with camera opens and cancels", add_camera)

    def add_upload():
        png = os.path.join(tempfile.gettempdir(), "plan.png")
        page.screenshot(path=png)
        page.locator("input[type=file][accept='image/*']").first.set_input_files(png)
        expect(page.locator("img.plan-thumb")).to_be_visible()
        btn = page.get_by_role("button", name="Analyse with Gemini")
        key = page.get_by_label("Gemini API key")
        if key.count():
            expect(btn).to_be_disabled()
            key.fill("not-a-real-key")
            expect(btn).to_be_enabled()
            key.fill("")
    check("Add floor: upload preview + Analyse needs a key", add_upload)

    def add_sample_and_review():
        page.get_by_role("button", name="Try a sample result").click()
        page.get_by_label("Building type").select_option("Hospital")
        rename = page.get_by_label("Room name").first
        rename.fill("Room 401 Renamed")
        page.get_by_label("Keep corridor 1").uncheck()
        page.get_by_label("Keep corridor 1").check()
        page.get_by_role("button", name="Add verified floor").click()
        expect(page.get_by_role("tab", name="Floor 4")).to_be_visible()
    check("Add floor: sample review + add", add_sample_and_review)

    # ---------------- Buildings ----------------
    for name in ["Helix Innovation Hub", "Mercy Medical Pavilion", "Skyline Terminal B", "Demo Hall"]:
        def switch(name=name):
            mode(page, "Navigate")
            page.get_by_label("Building").select_option(label=name)
            expect(page.locator("svg.map")).to_be_visible()
            first = page.get_by_role("searchbox", name="From")
            first.click()
            first.fill("a")
            expect(page.locator(".results [role=option]").first).to_be_visible()
            first.press("Escape")
            page.locator("header").click()
        check(f"Buildings: switch to {name}", switch)


def main():
    errors = []
    with sync_playwright() as p:
        kw = {"channel": "chrome"} if os.path.exists("/usr/bin/google-chrome") else {}
        browser = p.chromium.launch(**kw)
        for label, vp in [("desktop", {"width": 1400, "height": 900}), ("mobile", {"width": 390, "height": 844})]:
            ctx = browser.new_context(viewport=vp, accept_downloads=True, permissions=["clipboard-read", "clipboard-write"],
                                      is_mobile=label == "mobile", has_touch=label == "mobile")
            page = ctx.new_page()
            page.on("pageerror", lambda e, label=label: errors.append(f"[{label}] {e}"))
            page.on("console", lambda m, label=label: m.type == "error" and "api/health" not in m.text and "404" not in m.text and errors.append(f"[{label}] {m.text}"))
            page.goto(URL)
            page.evaluate("localStorage.clear()")
            page.reload()
            start = len(results)
            run(page)
            for r in results[start:]:
                results[results.index(r)] = (r[0], f"[{label}] {r[1]}", r[2])
            ctx.close()
        browser.close()
    fails = [r for r in results if r[0] == "FAIL"]
    for status, name, msg in results:
        print(f"{status}  {name}" + (f"  -- {msg}" if msg else ""))
    print(f"\n{len(results) - len(fails)}/{len(results)} controls passed")
    if errors:
        print("Browser errors:", *errors, sep="\n  ")
    sys.exit(1 if fails or errors else 0)


if __name__ == "__main__":
    main()
