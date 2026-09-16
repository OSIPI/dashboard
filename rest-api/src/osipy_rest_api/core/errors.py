"""Domain errors, each mapping to an HTTP status code."""

from __future__ import annotations


class ApiError(Exception):
    status_code: int = 500

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(ApiError):
    status_code = 404


class InvalidInputError(ApiError):
    status_code = 422


class JobStateError(ApiError):
    status_code = 409


class PayloadTooLargeError(ApiError):
    status_code = 413


class CapacityError(ApiError):
    status_code = 429
