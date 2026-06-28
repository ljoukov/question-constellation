#!/usr/bin/env python3

import argparse
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image


def parse_args():
    parser = argparse.ArgumentParser(
        description="Crop a standalone Figure/Graph/Diagram/Image label from a rendered PDF page."
    )
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--page", required=True, type=int)
    parser.add_argument("--label", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--margin", default=24, type=int)
    return parser.parse_args()


def pdftotext_bbox(pdf_path, page_number):
    return subprocess.check_output(
        [
            "pdftotext",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-bbox-layout",
            str(pdf_path),
            "-",
        ],
        text=True,
        stderr=subprocess.PIPE,
    )


def clean_text(value):
    return " ".join(str(value or "").replace("\xa0", " ").split())


def normalise_label(value):
    text = clean_text(value).lower().replace(".", "")
    if text.startswith("fig "):
        text = "figure " + text[4:]
    return text


def parse_page_words(xml_text):
    root = ET.fromstring(xml_text)
    page = next((node for node in root.iter() if strip_ns(node.tag) == "page"), None)
    if page is None:
        raise ValueError("pdftotext bbox output did not contain a page.")
    page_width = float(page.attrib["width"])
    page_height = float(page.attrib["height"])
    words = []
    for word in page.iter():
        if strip_ns(word.tag) != "word":
            continue
        text = clean_text(word.text)
        if not text:
            continue
        words.append(
            {
                "text": text,
                "x_min": float(word.attrib["xMin"]),
                "y_min": float(word.attrib["yMin"]),
                "x_max": float(word.attrib["xMax"]),
                "y_max": float(word.attrib["yMax"]),
            }
        )
    return page_width, page_height, words


def strip_ns(tag):
    return tag.rsplit("}", 1)[-1]


def group_lines(words):
    lines = []
    for word in sorted(words, key=lambda item: (item["y_min"], item["x_min"])):
        center = (word["y_min"] + word["y_max"]) / 2
        target = None
        for line in lines:
            if abs(line["center"] - center) <= 2.5:
                target = line
                break
        if target is None:
            target = {"center": center, "words": []}
            lines.append(target)
        target["words"].append(word)
        target["center"] = sum((w["y_min"] + w["y_max"]) / 2 for w in target["words"]) / len(
            target["words"]
        )
    output = []
    for line in lines:
        line_words = sorted(line["words"], key=lambda item: item["x_min"])
        output.append(
            {
                "text": clean_text(" ".join(word["text"] for word in line_words)),
                "x_min": min(word["x_min"] for word in line_words),
                "y_min": min(word["y_min"] for word in line_words),
                "x_max": max(word["x_max"] for word in line_words),
                "y_max": max(word["y_max"] for word in line_words),
            }
        )
    return sorted(output, key=lambda item: item["y_min"])


def find_standalone_label_line(lines, label):
    wanted = normalise_label(label)
    exact = [line for line in lines if normalise_label(line["text"]) == wanted]
    if exact:
        return min(exact, key=lambda line: line["y_min"])
    compact = wanted.replace(" ", "")
    candidates = [
        line
        for line in lines
        if normalise_label(line["text"]).replace(" ", "") == compact
        and len(line["text"].split()) <= 3
    ]
    if candidates:
        return min(candidates, key=lambda line: line["y_min"])
    raise ValueError(f"Could not find standalone label line: {label}")


def active_row_intervals(gray, y_start, y_limit):
    width, height = gray.size
    x0 = max(0, int(width * 0.08))
    x1 = min(width, int(width * 0.89))
    threshold = 245
    min_dark = max(10, int((x1 - x0) * 0.004))
    active = []
    pixels = gray.load()
    for y in range(max(0, y_start), min(height, y_limit)):
        dark = 0
        for x in range(x0, x1):
            if pixels[x, y] < threshold:
                dark += 1
        if dark >= min_dark:
            active.append((y, dark))
    if not active:
        return []
    intervals = []
    start, end, max_dark = active[0][0], active[0][0], active[0][1]
    max_gap = 7
    for y, dark in active[1:]:
        if y <= end + max_gap:
            end = y
            max_dark = max(max_dark, dark)
        else:
            intervals.append({"start": start, "end": end, "max_dark": max_dark})
            start, end, max_dark = y, y, dark
    intervals.append({"start": start, "end": end, "max_dark": max_dark})
    return intervals


def choose_vertical_crop(gray, label_bounds, margin):
    width, height = gray.size
    label_y_min, label_y_max = label_bounds
    y_scan_start = max(0, label_y_min - margin)
    intervals = active_row_intervals(gray, y_scan_start, min(height, label_y_min + int(height * 0.75)))
    if not intervals:
        raise ValueError("No visual content detected after label.")

    selected = []
    seen_label = False
    seen_visual = False
    for index, interval in enumerate(intervals):
        if interval["end"] < y_scan_start:
            continue
        if interval["start"] <= label_y_max + margin and interval["end"] >= label_y_min - margin:
            seen_label = True
        if seen_label:
            selected.append(interval)
            if interval["start"] > label_y_max + 10 and (
                interval["end"] - interval["start"] >= 28 or interval["max_dark"] >= width * 0.04
            ):
                seen_visual = True
            next_interval = intervals[index + 1] if index + 1 < len(intervals) else None
            if seen_visual and next_interval and next_interval["start"] - interval["end"] >= 36:
                if should_include_post_visual_label(width, interval, next_interval):
                    continue
                break
    if not selected:
        raise ValueError("Could not select figure crop rows.")
    if not seen_visual:
        # Some small biological diagrams are mostly text labels and thin lines. Keep content down
        # to the first large post-label gap rather than rejecting a potentially useful crop.
        selected = selected[: max(2, min(len(selected), 5))]
    return max(0, selected[0]["start"] - margin), min(height, selected[-1]["end"] + margin)


def should_include_post_visual_label(width, interval, next_interval):
    gap = next_interval["start"] - interval["end"]
    if gap > 150:
        return False
    # Figure labels, arrows, and keys can sit below a visually dense diagram after a blank gap.
    # Later question text is usually much wider/darker, so keep only narrow post-figure intervals.
    return next_interval["max_dark"] <= width * 0.22


def content_x_bounds(gray, y0, y1, margin):
    width, _ = gray.size
    x_scan_min = max(0, int(width * 0.08))
    x_scan_max = min(width, int(width * 0.89))
    pixels = gray.load()
    xs = []
    for y in range(y0, y1):
        for x in range(x_scan_min, x_scan_max):
            if pixels[x, y] < 245:
                xs.append(x)
    if not xs:
        raise ValueError("No figure pixels found in selected crop.")
    return max(x_scan_min, min(xs) - margin), min(x_scan_max, max(xs) + margin)


def crop_figure(args):
    xml_text = pdftotext_bbox(Path(args.pdf), args.page)
    page_width, page_height, words = parse_page_words(xml_text)
    lines = group_lines(words)
    label_line = find_standalone_label_line(lines, args.label)

    image = Image.open(args.image).convert("RGB")
    gray = image.convert("L")
    scale_x = image.width / page_width
    scale_y = image.height / page_height
    label_y_min = int(label_line["y_min"] * scale_y)
    label_y_max = int(label_line["y_max"] * scale_y)
    y0, y1 = choose_vertical_crop(gray, (label_y_min, label_y_max), args.margin)
    x0, x1 = content_x_bounds(gray, y0, y1, args.margin)

    if x1 - x0 < 120 or y1 - y0 < 90:
        raise ValueError(f"Crop too small: {x1 - x0}x{y1 - y0}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    crop = image.crop((x0, y0, x1, y1))
    crop.save(output)
    return {
        "status": "passed",
        "label": args.label,
        "pageNumber": args.page,
        "output": str(output),
        "bboxPixels": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
        "bboxNormalized": {
            "x": round(x0 / image.width, 5),
            "y": round(y0 / image.height, 5),
            "width": round((x1 - x0) / image.width, 5),
            "height": round((y1 - y0) / image.height, 5),
        },
        "source": {
            "pageWidth": page_width,
            "pageHeight": page_height,
            "imageWidth": image.width,
            "imageHeight": image.height,
            "labelLine": label_line,
        },
        "method": "pdftotext-bbox-plus-rendered-page-row-projection",
        "needsHumanReview": False,
        "extractionConfidence": 0.86,
    }


def main():
    args = parse_args()
    try:
        print(json.dumps(crop_figure(args), indent=2))
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error)}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
