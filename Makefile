.PHONY: dev release release-dry-run

dev:
	$(MAKE) -C dashboard dev

release:
	bun dashboard/scripts/release.ts

release-dry-run:
	bun dashboard/scripts/release.ts --dry-run
