"""Parse a SACAA licence search results page into a LicenceRecord.

The real page structure is not confirmed yet, so parsing is driven by label
aliases rather than fixed selectors: we collect every label/value pair on the
page (table rows, <dl> lists) and map labels through FIELD_ALIASES. When a real
results page is available, adjust the aliases rather than the parsing logic.
"""

from __future__ import annotations

import re
from datetime import date, datetime

from bs4 import BeautifulSoup, Tag

from .models import LicenceRecord, MedicalRecord, RatingRecord

FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "licence_number": ("licence number", "license number", "licence no", "licence no.", "licence #"),
    "holder_name": ("name", "full name", "holder", "licence holder"),
    "licence_type": ("licence type", "license type", "licence category", "category"),
    "status": ("status", "licence status"),
    "issued": ("date issued", "issue date", "issued"),
    "expires": ("expiry date", "expiry", "valid until", "expires", "licence expiry"),
    "medical_class": ("medical class", "medical certificate class"),
    "medical_expires": ("medical expiry", "medical expiry date", "medical valid until"),
}

RATING_NAME_HEADERS = ("rating", "rating name", "type rating", "endorsement")
RATING_CATEGORY_HEADERS = ("category", "class", "type")
RATING_EXPIRY_HEADERS = ("expiry", "expiry date", "valid until", "expires")

NOT_FOUND_PATTERNS = (
    re.compile(r"no (records?|results?|licen[cs]e) (were |was )?found", re.I),
    re.compile(r"invalid licen[cs]e number", re.I),
)

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y", "%Y/%m/%d")


class LicenceNotFound(Exception):
    pass


def _norm(label: str) -> str:
    return re.sub(r"\s+", " ", label).strip().rstrip(":").strip().lower()


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip()
    if value.lower() in {"", "-", "n/a", "na", "none", "non-expiring"}:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _header_cells(table: Tag) -> list[str]:
    head = table.find("tr")
    if head is None:
        return []
    return [_norm(c.get_text()) for c in head.find_all("th")]


def _is_rating_table(table: Tag) -> bool:
    headers = _header_cells(table)
    return len(headers) >= 2 and any(h in RATING_NAME_HEADERS for h in headers)


def _collect_pairs(soup: BeautifulSoup) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for table in soup.find_all("table"):
        if _is_rating_table(table):
            continue
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) == 2:
                label, value = (c.get_text(" ", strip=True) for c in cells)
                if label:
                    pairs.setdefault(_norm(label), value)
    for dl in soup.find_all("dl"):
        for dt in dl.find_all("dt"):
            dd = dt.find_next_sibling("dd")
            if dd is not None:
                pairs.setdefault(_norm(dt.get_text()), dd.get_text(" ", strip=True))
    return pairs


def _parse_ratings(soup: BeautifulSoup) -> list[RatingRecord]:
    ratings: list[RatingRecord] = []
    for table in soup.find_all("table"):
        if not _is_rating_table(table):
            continue
        headers = _header_cells(table)

        def col(options: tuple[str, ...]) -> int | None:
            return next((i for i, h in enumerate(headers) if h in options), None)

        name_i = col(RATING_NAME_HEADERS)
        cat_i = col(RATING_CATEGORY_HEADERS)
        exp_i = col(RATING_EXPIRY_HEADERS)
        for row in table.find_all("tr")[1:]:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if name_i is None or name_i >= len(cells) or not cells[name_i]:
                continue
            ratings.append(
                RatingRecord(
                    name=cells[name_i],
                    category=cells[cat_i] if cat_i is not None and cat_i < len(cells) else None,
                    expires=parse_date(cells[exp_i]) if exp_i is not None and exp_i < len(cells) else None,
                )
            )
    return ratings


def parse_result_page(html: str, requested_licence: str | None = None) -> LicenceRecord:
    """Parse a results page. Raises LicenceNotFound if the portal reports no match."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    if any(p.search(text) for p in NOT_FOUND_PATTERNS):
        raise LicenceNotFound(requested_licence or "")

    pairs = _collect_pairs(soup)
    mapped: dict[str, str] = {}
    used_labels: set[str] = set()
    for field_name, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in pairs:
                mapped[field_name] = pairs[alias]
                used_labels.add(alias)
                break

    licence_number = mapped.get("licence_number") or requested_licence
    if not licence_number:
        raise LicenceNotFound("")

    medical = None
    if "medical_class" in mapped or "medical_expires" in mapped:
        digits = re.search(r"\d", mapped.get("medical_class", ""))
        medical = MedicalRecord(
            medical_class=int(digits.group()) if digits else None,
            expires=parse_date(mapped.get("medical_expires")),
        )

    return LicenceRecord(
        licence_number=licence_number.strip(),
        holder_name=mapped.get("holder_name"),
        licence_type=mapped.get("licence_type"),
        status=mapped.get("status"),
        issued=parse_date(mapped.get("issued")),
        expires=parse_date(mapped.get("expires")),
        ratings=_parse_ratings(soup),
        medical=medical,
        unmapped={k: v for k, v in pairs.items() if k not in used_labels},
    )
