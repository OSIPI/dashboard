.PHONY: dev stop release release-dry-run

dev:
	$(MAKE) -C dashboard dev

stop:
	$(MAKE) -C dashboard stop

release:
	bun dashboard/scripts/release.ts

release-dry-run:
	bun dashboard/scripts/release.ts --dry-run
