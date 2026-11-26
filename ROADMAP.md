# OSIPY Dashboard Roadmap

## Done

- [x] Dashoard initial backbone and Techstack
- [x] Remove login, registration, and database requirements for now.
- [x] Run development with Bun through Docker Compose.  Run `make dev` for local development
- [x] Create minimal OSIPY landing copy based on the proposal.
- [x] Align dashboard concept with current OSIPY CLI flow.
- [x] Configure GitHub Pages deployment. Publish at https://osipi.github.io/dashboard/

## Next

- [ ] Incorporate [OrganUI](https://organui.com) healthcare UI patterns into the OSIPY dashboard, prioritizing the [medical image viewer](https://organui.com/docs/components/image-viewer), [brain/3D anatomy](https://organui.com/docs/components/brain), and [anatomy tree](https://organui.com/docs/components/anatomy-tree). Adapt relevant patterns to the existing Svelte 5/shadcn-svelte stack rather than installing React components or replacing the working MRI pipeline. Preserve browser-local imaging, accessibility, and existing theme tokens; check code and individual model licences before copying assets. Reference: [Ali Bey's post](https://x.com/alibey_10/status/2112814546289119665). Planned, not yet integrated.
- [ ] Define the local bridge/server command.
- [ ] Connect dashboard actions to the OSIPY Python runner.
- [ ] Implement real drag-and-drop import.
- [ ] Generate and edit YAML config from the dashboard.
- [ ] Show run logs, validation results, and output maps.
