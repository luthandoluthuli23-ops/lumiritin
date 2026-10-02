"""Fetch a SACAA licence search results page.

Deliberately conservative: identifies itself, spaces out requests, and stops
(PortalBlocked) on CAPTCHA / rate limiting rather than trying to get past it.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import requests

BLOCK_MARKERS = ("captcha", "g-recaptcha", "hcaptcha", "cf-challenge", "access denied")


class PortalError(Exception):
    """Portal unreachable or returned an unexpected response."""


class PortalBlocked(PortalError):
    """Portal presented a CAPTCHA, bot check or rate limit. Do not retry automatically."""


def looks_blocked(html: str) -> bool:
    lowered = html.lower()
    return any(marker in lowered for marker in BLOCK_MARKERS)


@dataclass
class SacaaClient:
    base_url: str
    query_param: str = "licenceNumber"
    method: str = "GET"
    timeout: float = 20.0
    min_interval: float = 5.0
    user_agent: str = "Lumiritin-Verifier/0.1"

    def __post_init__(self) -> None:
        self._session = requests.Session()
        self._session.headers["User-Agent"] = self.user_agent
        self._last_request = 0.0

    @classmethod
    def from_env(cls) -> "SacaaClient":
        base_url = os.environ.get("SACAA_PORTAL_URL", "").strip()
        if not base_url:
            raise PortalError("SACAA_PORTAL_URL is not set")
        return cls(
            base_url=base_url,
            query_param=os.environ.get("SACAA_QUERY_PARAM", "licenceNumber"),
            method=os.environ.get("SACAA_METHOD", "GET").upper(),
            min_interval=float(os.environ.get("SACAA_MIN_INTERVAL_SECONDS", "5")),
            user_agent=os.environ.get("SACAA_USER_AGENT", "Lumiritin-Verifier/0.1"),
        )

    def _throttle(self) -> None:
        wait = self.min_interval - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.monotonic()

    def fetch(self, licence_number: str) -> str:
        self._throttle()
        params = {self.query_param: licence_number}
        try:
            if self.method == "POST":
                resp = self._session.post(self.base_url, data=params, timeout=self.timeout)
            else:
                resp = self._session.get(self.base_url, params=params, timeout=self.timeout)
        except requests.RequestException as exc:
            raise PortalError(str(exc)) from exc

        if resp.status_code in (403, 429):
            raise PortalBlocked(f"HTTP {resp.status_code}")
        if resp.status_code >= 400:
            raise PortalError(f"HTTP {resp.status_code}")
        if looks_blocked(resp.text):
            raise PortalBlocked("CAPTCHA or bot check detected")
        return resp.text
