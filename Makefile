.PHONY: dev dev-prod stop release release-dry-run

dev:
	$(MAKE) -C dashboard dev

dev-prod:
	$(MAKE) -C dashboard dev-prod

stop:
	$(MAKE) -C dashboard stop

release:
	bun dashboard/scripts/release.ts

release-dry-run:
	bun dashboard/scripts/release.ts --dry-run
