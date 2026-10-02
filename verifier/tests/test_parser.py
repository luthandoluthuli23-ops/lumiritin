from datetime import date
from pathlib import Path

import pytest

from lumiritin_verifier.__main__ import run
from lumiritin_verifier.client import looks_blocked
from lumiritin_verifier.parser import LicenceNotFound, parse_date, parse_result_page

FIXTURE = Path(__file__).parent / "fixtures" / "sample_result.html"


@pytest.fixture
def record():
    return parse_result_page(FIXTURE.read_text(encoding="utf-8"))


def test_core_fields(record):
    assert record.licence_number == "0270999999"
    assert record.holder_name == "Test Pilot"
    assert record.licence_type == "ATPL(A)"
    assert record.status == "Valid"
    assert record.issued == date(2018, 3, 15)
    assert record.expires == date(2027, 3, 14)


def test_medical(record):
    assert record.medical.medical_class == 1
    assert record.medical.expires == date(2026, 12, 31)


def test_ratings(record):
    names = [r.name for r in record.ratings]
    assert names == ["B737-300/900", "Instrument Rating", "Night Rating"]
    assert record.ratings[0].expires == date(2026, 11, 30)
    assert record.ratings[0].category == "Type"
    assert record.ratings[2].expires is None


def test_unmapped_fields_are_kept(record):
    assert record.unmapped == {"language proficiency": "Level 6"}


def test_not_found():
    with pytest.raises(LicenceNotFound):
        parse_result_page("<html><body><p>No records found.</p></body></html>", "123")


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-12-31", date(2026, 12, 31)),
        ("31/12/2026", date(2026, 12, 31)),
        ("31 Dec 2026", date(2026, 12, 31)),
        ("N/A", None),
        ("garbage", None),
    ],
)
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


def test_block_detection():
    assert looks_blocked('<div class="g-recaptcha"></div>')
    assert not looks_blocked(FIXTURE.read_text(encoding="utf-8"))


def test_cli_offline():
    result = run(None, str(FIXTURE))
    assert result["outcome"] == "VERIFIED"
    assert result["record"]["expires"] == "2027-03-14"
    assert len(result["html_sha256"]) == 64
