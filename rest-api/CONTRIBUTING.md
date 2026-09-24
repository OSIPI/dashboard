# Contributing

Thanks for your interest in improving osipy-rest-api.

## Development workflow

This project uses [uv](https://docs.astral.sh/uv/) for dependency management and
task running. Do not use pip, venv, or poetry directly.

```bash
uv sync --extra dev        # install runtime + dev dependencies
uv run pytest              # run the test suite
uv run ruff check .        # lint
```

## Making changes

1. Branch off `main`.
2. Make your change with tests.
3. Ensure `uv run pytest` and `uv run ruff check .` pass.
4. Open a pull request against `main`. All PRs are reviewed before merge.

## Licensing of contributions

Unless you state otherwise, contributions are accepted under the project's
license, the Apache License 2.0. See `LICENSE` and `NOTICE`.
