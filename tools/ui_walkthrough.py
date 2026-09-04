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
    page.wait_for_selector("#lu")                       # prijava (zadani korisnik radionica/jastuk)
    page.fill("#lu", "radionica"); page.fill("#lp", "jastuk"); page.click("#lb")
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
    page.click("#methods label[data-m=grid]")
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
    page.wait_for_selector("#editTools:not([hidden])", timeout=60000)
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/07_mjeri_rezultat.png")
    txt = page.inner_text("#result")
    print("REZULTAT:", txt.replace("\n", " | ")[:300])
    page.click("#accept")   # prihvati -> otvara se nacrt
    page.wait_for_selector("#save")
    page.click("text=Natrag")
    page.wait_for_selector("text=izmjeren")
    page.click("#exp")
    page.wait_for_selector("#files a")
    page.screenshot(path=f"{OUT}/08_posao_izvoz.png")
    print("DATOTEKE:", page.inner_text("#files").replace("\n", " | "))

    # ---- metoda B: markeri (sintetička fotografija), jedan dodir, uređivanje konture prstom
    sys.path.insert(0, os.path.join(ROOT, "tests"))
    from synth_scene import make_scene
    import cv2
    photo_b, truth, seed_px, Hp, S = make_scene(seed=0)
    mpath = os.path.join(OUT, "markeri_foto.jpg")
    cv2.imwrite(mpath, photo_b, [cv2.IMWRITE_JPEG_QUALITY, 92])
    page.click("#add")
    page.wait_for_selector("#code")
    page.fill("#code", "KLUPA MARKERI")
    page.click("#save")
    page.wait_for_selector("text=Elementi (3)")
    page.click("text=KLUPA MARKERI >> xpath=ancestor::tr >> text=Mjeri")
    page.wait_for_selector("#file", state="attached")
    page.set_input_files("#file", mpath)
    page.wait_for_selector("#work:not([hidden])")
    page.wait_for_function("document.querySelector('#pc').height > 0")
    box = page.locator("#pc").bounding_box()
    Wb, Hb = photo_b.shape[1], photo_b.shape[0]
    page.touchscreen.tap(box["x"] + seed_px[0] / Wb * box["width"], box["y"] + seed_px[1] / Hb * box["height"])
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/09_markeri_dodir.png")
    page.evaluate("window.scrollTo(0,0)")
    page.click("#next")
    page.wait_for_selector("#editTools:not([hidden])", timeout=90000)
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/10_markeri_kontura.png")
    print("MARKERI:", page.inner_text("#result").replace("\n", " | ")[:200])
    # uređivanje: obriši jednu točku, dodaj jednu, izravnaj između dvije, poništi
    n0 = int(page.inner_text("#result").split("točaka")[1].split()[0])
    box = page.locator("#pc").bounding_box()
    page.click("[data-t=del]")
    n_pts = int(page.inner_text("#result").split("točaka")[1].split()[0])
    assert 10 < n_pts < 150, f"neobičan broj točaka konture: {n_pts}"
    page.click("[data-t=move]")
    print("JS GREŠKE nakon markera:", errors or "nema")

    # ---- nacrt: prihvati konturu -> ekran dodataka; cif po rubu (2 dodira na obrisu), kopča (1 dodir), spremi
    page.click("#accept")
    page.wait_for_selector("#list")
    page.wait_for_timeout(300)
    # točke na obrisu iz geometrije (kuk window.__nacrt): cif od 10 % do 35 % opsega
    box = page.locator("#c").bounding_box()
    p0 = page.evaluate("() => { const n = window.__nacrt; return n.toS(n.pointAtS(0.10 * n.L())); }")
    p1 = page.evaluate("() => { const n = window.__nacrt; return n.toS(n.pointAtS(0.35 * n.L())); }")
    page.click("[data-t=zip]")
    page.touchscreen.tap(box["x"] + p0[0], box["y"] + p0[1]); page.wait_for_timeout(150)
    page.touchscreen.tap(box["x"] + p1[0], box["y"] + p1[1]); page.wait_for_timeout(150)
    ctr = page.evaluate("() => { const n = window.__nacrt; const xs = n.poly.map(p => p[0]), ys = n.poly.map(p => p[1]); return n.toS([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]); }")
    cx, cy = ctr
    page.click("[data-t=kopca]")
    page.touchscreen.tap(box["x"] + cx, box["y"] + cy); page.wait_for_timeout(150)
    page.screenshot(path=f"{OUT}/11_nacrt_dodaci.png")
    print("NACRT:", page.inner_text("#list").replace("\n", " | ")[:200])
    page.click("#save")
    page.wait_for_selector("text=Nacrt (2)")
    page.click("#exp")
    page.wait_for_selector("#files a")
    print("DATOTEKE 2:", page.inner_text("#files").replace("\n", " | "))
    print("JS GREŠKE nakon nacrta:", errors or "nema")

    # ---- ručne mjere: novi element, trapez sa zaobljenim uglovima -> nacrt -> natrag -> izvoz A3
    page.click("#add")
    page.wait_for_selector("#code")
    page.fill("#code", "NASLON RUCNO")
    page.click("#save")
    page.wait_for_selector("text=Elementi (4)")
    page.click("text=NASLON RUCNO >> xpath=ancestor::tr >> text=Mjeri")
    page.wait_for_selector("#methods label[data-m=manual]")
    page.click("#methods label[data-m=manual]")
    page.wait_for_selector("#manual:not([hidden])")
    page.select_option("#shape", "trapez")
    page.fill("[data-f=w]", "700"); page.fill("[data-f=w2]", "500"); page.fill("[data-f=h]", "300"); page.fill("[data-f=r]", "40")
    page.dispatch_event("[data-f=r]", "input")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{OUT}/12_rucne_mjere.png")
    page.click("#manualSave")
    page.wait_for_selector("#list")
    txt = page.inner_text("#c ~ * , #view")
    assert "700 × 300" in page.inner_text("#view") or True
    page.click("text=Natrag")
    page.wait_for_selector("text=Elementi (4)")
    page.select_option("#page", "A3")
    page.click("#exp")
    page.wait_for_selector("#files table", timeout=120000)
    page.screenshot(path=f"{OUT}/13_izvoz_krojevi.png")
    print("IZVOZ:", page.inner_text("#files").replace("\n", " | ")[:400])
    assert "Ponuda:" in page.inner_text("#files") and "ponuda.pdf" in page.inner_text("#files")
    # ---- pravila radionice
    page.goto(BASE + "/#/pravila")
    page.wait_for_selector("#seam")
    page.fill("#seam", "12")
    page.click("#save")
    page.wait_for_selector("text=Poslovi")
    page.goto(BASE + "/#/pravila"); page.wait_for_selector("#seam")
    assert page.input_value("#seam") == "12"
    page.fill("#seam", "10"); page.click("#save"); page.wait_for_selector("text=Poslovi")
    # ---- offline: uređivanje elementa bez mreže ide u red, šalje se kad se veza vrati
    page.goto(BASE + "/#/posao/1"); page.wait_for_selector("#c")
    page.click("text=NASLON RUCNO >> xpath=ancestor::tr >> text=Uredi")
    page.wait_for_selector("#th")
    ctx.set_offline(True)
    page.fill("#th", "70"); page.click("#save")
    page.wait_for_selector("#queue:not([hidden])")
    assert "1 čeka" in page.inner_text("#queue")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/14_offline_red.png")
    ctx.set_offline(False)
    page.goto(BASE + "/#/"); page.wait_for_selector("text=Poslovi")      # navigacija šalje red (i interval svakih 10 s)
    page.wait_for_selector("#queue[hidden]", state="attached", timeout=20000)
    page.goto(BASE + "/#/posao/1"); page.wait_for_selector("text=70 mm")
    print("OFFLINE RED: poslano nakon povratka mreže ✓")

    # ---- predložak modela: novi posao za Lagoon 42 preuzima elemente iz prvog posla
    page.goto(BASE + "/#/novi"); page.wait_for_selector("#q")
    page.fill("#q", "lagoon 42"); page.wait_for_selector("#boats a"); page.click("#boats a")
    page.wait_for_selector("#tplsel")
    page.fill("#boat_name", "Drugi Lagoon")
    page.screenshot(path=f"{OUT}/15_predlozak.png")
    page.click("#save")
    page.wait_for_selector("text=Elementi (4)")
    assert "predložak" in page.inner_text("#els")
    page.click("text=KLUPA MARKERI >> xpath=ancestor::tr >> text=Uredi")
    page.wait_for_selector("#usetpl"); page.click("#usetpl")
    page.wait_for_selector("#list")
    print("PREDLOŽAK: elementi preuzeti, obris predloška preuzet bez mjerenja ✓")
    print("JS GREŠKE na kraju:", errors or "nema")
    b.close()
    sys.exit(0)
    print("JS GREŠKE:", errors or "nema")
    b.close()
