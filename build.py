#!/usr/bin/env python3
"""Wrap src/page.html into the publishable daily-readout.html.

The page saves itself: to publish a new version it needs its own source,
so the built file carries the page twice — once inside a `text/plain`
template block, once as the live page — plus a JSON seed holding the log.
Only the seed changes when the page saves, which is why the template
block can be a plain copy: it never has to describe itself.

Run after editing src/page.html:  python3 build.py
"""
import base64, io, re

TITLE = "Daily Readout"
EMPTY_SEED = '{"v":1,"days":{},"tags":[]}'

# The template block is base64: text escaping could not round-trip here,
# because the page's own escaping code would be rewritten by its own rule.
# Base64 has no `</script` to defuse, so the page re-emits it untouched.
def tpl_encode(text):
    return base64.b64encode(text.encode("utf-8")).decode("ascii")

def main():
    page = io.open("src/page.html", encoding="utf-8").read()

    # src/page.html is the page alone: the wrapper adds title, template
    # and seed. (Its script mentions all three by name, so only the
    # opening shape distinguishes a source file from a built one.)
    assert not page.lstrip().startswith("<title"), "src/page.html looks already built"
    assert not page.lstrip().startswith("<script type=\"text/plain\""), "src/page.html looks already built"

    out = (
        "<title>" + TITLE + "</title>\n"
        '<script type="text/plain" id="tpl">' + tpl_encode(page) + "</script>\n"
        '<script type="application/json" id="seed">' + EMPTY_SEED + "</script>\n"
        + page
    )
    io.open("daily-readout.html", "w", encoding="utf-8").write(out)

    # the round trip the page relies on every time it saves
    blob = tpl_encode(page)
    assert re.search(r"</script", blob, re.I) is None, "template block would end early"
    assert base64.b64decode(blob).decode("utf-8") == page
    print("daily-readout.html: %.1f KB" % (len(out.encode("utf-8")) / 1024.0))

if __name__ == "__main__":
    main()
