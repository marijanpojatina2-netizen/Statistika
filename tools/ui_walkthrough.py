"""Prolaz kroz sučelje kao na tabletu (dodiri), sa snimkama ekrana. Nije dio pytest-a jer traži
pokrenut poslužitelj i Chromium.

    JASTUK_VAR=/tmp/jastuk_demo python3 -m uvicorn api.main:app --port 8765 &
    pip install playwright   # + preglednik: playwright install chromium, ili CHROME=/putanja/do/chrome
    python3 tools/ui_walkthrough.py /tmp/shots
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("JASTUK_URL", "http://127.0.0.1:8765")
OUT = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO = os.path.join(ROOT, "fotke", "mala_kupa_stola.jpg")
CHROME = os.environ.get("CHROME")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True) if CHROME else p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1180, "height": 2300}, has_touch=True, device_scale_factor=1)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(BASE + "/#/")
    page.wait_for_selector("text=Poslovi")
    page.screenshot(path=f"{OUT}/01_poslovi.png")

    page.click("text=Novi posao")
    page.fill("#q", "lagoon 42")
    page.wait_for_selector("#boats a")
    page.click("#boats a")
    page.fill("#boat_name", "Morska vila")
    page.fill("#customer", "Test kupac")
    page.fill("#marina", "ACI Split")
    page.screenshot(path=f"{OUT}/02_novi_posao.png")
    page.click("#save")
    page.wait_for_selector("#c")
    page.screenshot(path=f"{OUT}/03_posao_prazan.png")

    # novi element -> crtanje prstom (4 dodira na shemi)
    page.click("#add")
    page.wait_for_selector("#code")
    c = page.locator("#c")
    box = c.bounding_box()
    for nx, ny in [(0.30, 0.68), (0.48, 0.68), (0.48, 0.9), (0.30, 0.9)]:
        page.touchscreen.tap(box["x"] + nx * box["width"], box["y"] + ny * box["height"])
    page.fill("#code", "KOKPIT SJEDALO LIJEVA")
    page.select_option("#zone", "kokpit")
    page.fill("#th", "50")
    page.screenshot(path=f"{OUT}/04_element_crtanje.png")
    page.click("#savemirror")
    page.wait_for_selector("text=Elementi (2)")
    page.screenshot(path=f"{OUT}/05_posao_2_elementa.png")

    # dodir na shemi otvara element
    box = page.locator("#c").bounding_box()
    page.touchscreen.tap(box["x"] + 0.39 * box["width"], box["y"] + 0.79 * box["height"])
    page.wait_for_selector("#code")
    assert page.input_value("#code") == "KOKPIT SJEDALO LIJEVA", page.input_value("#code")

    # mjerenje: fotografija + 3 dodira
    page.click("text=Mjeri →")
    page.wait_for_selector("#file", state="attached")
    page.set_input_files("#file", PHOTO)
    page.wait_for_selector("#work:not([hidden])")
    page.wait_for_function("document.querySelector('#pc').height > 0")
    pc = page.locator("#pc")
    box = pc.bounding_box()
    W, H = 1500, 2000
    def tap_orig(x, y):
        page.touchscreen.tap(box["x"] + x / W * box["width"], box["y"] + y / H * box["height"])
    tap_orig(375, 1878); page.wait_for_timeout(300); page.screenshot(path=f"{OUT}/06_mjeri_ishodiste.png")
    page.evaluate("window.scrollTo(0,0)"); page.click("#next", timeout=5000)
    tap_orig(975, 1878); page.click("#next")
    tap_orig(760, 1100); page.click("#next")
    page.wait_for_selector("#result:not([hidden]) table", timeout=60000)
    page.screenshot(path=f"{OUT}/07_mjeri_rezultat.png")
    txt = page.inner_text("#result")
    print("REZULTAT:", txt.replace("\n", " | ")[:300])
    page.click("#next")     # prihvati
    page.wait_for_selector("text=izmjeren")
    page.click("#exp")
    page.wait_for_selector("#files a")
    page.screenshot(path=f"{OUT}/08_posao_izvoz.png")
    print("DATOTEKE:", page.inner_text("#files").replace("\n", " | "))
    print("JS GREŠKE:", errors or "nema")
    b.close()
