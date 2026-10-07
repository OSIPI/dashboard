.PHONY: dev dev-prod stop release release-dry-run

dev:
	$(MAKE) -C frontend dev

dev-prod:
	$(MAKE) -C frontend dev-prod

stop:
	$(MAKE) -C frontend stop

release:
	bun frontend/scripts/release.ts

release-dry-run:
	bun frontend/scripts/release.ts --dry-run
