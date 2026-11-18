# Floor plan tracer

Turns vector floor plan PDFs into what FloorNav needs: a clean map (SVG), room outlines, door openings and a hallway network that routes never leave.

How it works:
1. Walls: every black-filled shape in the PDF (walls, columns). Thin straight lines that touch a wall count as glass or partitions. Free-standing lines (overhead features) are ignored.
2. Rooms: room numbers are read with OCR and matched to `src/data/e5/rooms.json`. Each label seeds a watershed fill, so every room gets its own area and door gaps become boundaries.
3. Doors: where two room areas meet in open space.
4. Hallways: the centreline (skeleton) of corridor areas. Rooms connect through their door. Big X marks on upper floors are treated as open-to-below voids.

Run (needs Python 3, pymupdf, opencv-python, scikit-image, scipy, tesseract):

    export PDF_DIR=/path/to/pdfs   # 053E5_01FLR_*.pdf ... (file names in common.py)
    export APP_DIR=../..           # the FloorNav app root
    for f in 1 2 3 4 5 6; do python ocr.py $f; python ocr2.py $f; python build_floor.py $f; done
    python conn.py    # checks every room is reachable
    python merge.py   # writes the SVGs, rooms.json and navigationGraph.json into the app

`manual.json` adds room labels OCR cannot read, e.g. `{"1": {"1817": [15.3, 62.0]}}` (floor, room, x%, y%).
Coordinates are in the cropped 3067 x 992 frame the app uses (see S, OX, OY in common.py).
