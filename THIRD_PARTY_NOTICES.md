# Third-party notices

## MyFlightbook

Lumiritin can import a pilot's flights from [MyFlightbook](https://myflightbook.com) over its public OAuth2 web-service
API (`web/lib/myflightbook/`), and it reads CSV exports produced by MyFlightbook and other logbooks
(`web/lib/logbook-csv.ts`).

**No MyFlightbook source code is included in this repository.** The connector was written from scratch from
MyFlightbook's public developer documentation (its GitHub wiki) and the shape of the API's responses. It talks to the
service; it does not copy, port or link the MyFlightbook server code.

For reference, as checked on 2026-11-18:

- The MyFlightbook server source is published at https://github.com/ericberman/MyFlightbookWeb. Its README says the
  source is "provided under the GNU license" without naming a version, and the repository has no `LICENSE` file at the
  root. Because no MyFlightbook code is copied here, that licence imposes no obligations on this repository. If any
  MyFlightbook code is ever copied in, stop and confirm the exact licence (and its attribution and source-sharing
  terms) with the author first.
- Use of the MyFlightbook API requires a registered OAuth client (ours is `lumiritin`). MyFlightbook's developer docs
  ask developers not to test against the live site; ask the author for a staging server for testing.

"MyFlightbook" is the name of a third-party service. Lumiritin is not affiliated with or endorsed by it.
