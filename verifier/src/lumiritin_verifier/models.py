from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any


@dataclass
class RatingRecord:
    name: str
    category: str | None = None
    expires: date | None = None


@dataclass
class MedicalRecord:
    medical_class: int | None = None
    expires: date | None = None


@dataclass
class LicenceRecord:
    licence_number: str
    holder_name: str | None = None
    licence_type: str | None = None
    status: str | None = None
    issued: date | None = None
    expires: date | None = None
    ratings: list[RatingRecord] = field(default_factory=list)
    medical: MedicalRecord | None = None
    # Label/value pairs found on the page that we don't map yet - kept so new
    # portal fields show up in the verification log instead of vanishing.
    unmapped: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        def convert(value: Any) -> Any:
            if isinstance(value, date):
                return value.isoformat()
            if isinstance(value, dict):
                return {k: convert(v) for k, v in value.items()}
            if isinstance(value, list):
                return [convert(v) for v in value]
            return value

        return convert(asdict(self))
