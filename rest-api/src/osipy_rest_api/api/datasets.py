"""Dataset upload, retrieval, and deletion."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Annotated
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, Depends, Request, status
from python_multipart import MultipartParser
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import parse_options_header

from osipy_rest_api.config import Settings
from osipy_rest_api.core.domain import Dataset
from osipy_rest_api.core.errors import InvalidInputError, NotFoundError, PayloadTooLargeError
from osipy_rest_api.core.nifti_io import parse_bval_bytes, parse_nifti_bytes
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_settings_dep, get_storage
from osipy_rest_api.models.schemas import DatasetMeta
from osipy_rest_api.security import require_session_token

router = APIRouter(tags=["datasets"], dependencies=[Depends(require_session_token)])
_MAX_BVAL_BYTES = 1024 * 1024
_MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024
_MAX_PART_HEADER_BYTES = 8 * 1024


@dataclass
class _MultipartPart:
    name: str | None = None
    filename: str | None = None
    is_file: bool = False
    content_disposition: bytes = b""
    data: bytearray = field(default_factory=bytearray)


class _MemoryMultipartParser:
    """Parse this endpoint's small multipart contract without a spool file.

    Starlette's general parser necessarily creates ``SpooledTemporaryFile``
    objects for ``UploadFile`` parameters. This parser retains only the two
    bounded API parts in memory and rejects every other field/file.
    """

    def __init__(self, boundary: bytes, *, nifti_limit: int, bval_limit: int) -> None:
        self._parts: dict[str, _MultipartPart] = {}
        self._part = _MultipartPart()
        self._header_name = bytearray()
        self._header_value = bytearray()
        self._nifti_limit = nifti_limit
        self._bval_limit = bval_limit
        self._parser = MultipartParser(
            boundary,
            {
                "on_part_begin": self.on_part_begin,
                "on_part_data": self.on_part_data,
                "on_part_end": self.on_part_end,
                "on_header_field": self.on_header_field,
                "on_header_value": self.on_header_value,
                "on_header_end": self.on_header_end,
                "on_headers_finished": self.on_headers_finished,
                "on_end": self.on_end,
            },
        )

    def _header_too_large(self) -> None:
        if len(self._header_name) + len(self._header_value) > _MAX_PART_HEADER_BYTES:
            raise PayloadTooLargeError("multipart part headers exceed the allowed size")

    def on_part_begin(self) -> None:
        self._part = _MultipartPart()
        self._header_name.clear()
        self._header_value.clear()

    def on_header_field(self, data: bytes, start: int, end: int) -> None:
        self._header_name.extend(data[start:end])
        self._header_too_large()

    def on_header_value(self, data: bytes, start: int, end: int) -> None:
        self._header_value.extend(data[start:end])
        self._header_too_large()

    def on_header_end(self) -> None:
        if self._header_name.lower() == b"content-disposition":
            self._part.content_disposition = bytes(self._header_value)
        self._header_name.clear()
        self._header_value.clear()

    def on_headers_finished(self) -> None:
        disposition, options = parse_options_header(self._part.content_disposition)
        if disposition != b"form-data" or b"name" not in options:
            raise InvalidInputError("each multipart part must have a form-data name")
        try:
            name = options[b"name"].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise InvalidInputError("multipart field name must be UTF-8") from exc
        if name not in {"nifti", "bval", "b_values"} or name in self._parts:
            raise InvalidInputError(
                "multipart upload must contain unique nifti, bval, or b_values parts"
            )
        is_file = b"filename" in options
        if name == "nifti" and not is_file:
            raise InvalidInputError("nifti must be a file part")
        if name == "bval" and not is_file:
            raise InvalidInputError("bval must be a file part")
        if name == "b_values" and is_file:
            raise InvalidInputError("b_values must be a text form field")
        self._part.name = name
        self._part.is_file = is_file
        if is_file:
            try:
                self._part.filename = options[b"filename"].decode("utf-8")
            except UnicodeDecodeError as exc:
                raise InvalidInputError("multipart filename must be UTF-8") from exc

    def on_part_data(self, data: bytes, start: int, end: int) -> None:
        if self._part.name is None:
            raise InvalidInputError("multipart part data arrived before valid headers")
        limit = self._nifti_limit if self._part.name == "nifti" else self._bval_limit
        payload = data[start:end]
        if len(self._part.data) + len(payload) > limit:
            raise PayloadTooLargeError(
                f"{self._part.name} exceeds the {limit}-byte limit"
            )
        self._part.data.extend(payload)

    def on_part_end(self) -> None:
        if self._part.name is None:
            raise InvalidInputError("multipart part is missing a name")
        self._parts[self._part.name] = self._part

    def on_end(self) -> None:
        pass

    def write(self, chunk: bytes) -> None:
        self._parser.write(chunk)

    def finalize(self) -> dict[str, _MultipartPart]:
        self._parser.finalize()
        return self._parts


def _request_limit(settings: Settings) -> int:
    bval_limit = min(settings.max_upload_bytes, _MAX_BVAL_BYTES)
    # The contract permits a bval file or a b_values field. Reserve bounded
    # space for both so a malformed request cannot exceed the global cap.
    return settings.max_upload_bytes + (2 * bval_limit) + _MAX_MULTIPART_OVERHEAD_BYTES


async def _read_multipart_upload(
    request: Request, settings: Settings
) -> dict[str, _MultipartPart]:
    content_type = request.headers.get("content-type", "")
    try:
        media_type, params = parse_options_header(content_type)
    except (TypeError, ValueError) as exc:
        raise InvalidInputError("Content-Type is malformed") from exc
    boundary = params.get(b"boundary")
    if media_type != b"multipart/form-data" or not boundary:
        raise InvalidInputError("Content-Type must be multipart/form-data with a boundary")
    request_limit = _request_limit(settings)
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > request_limit:
                raise PayloadTooLargeError(f"request exceeds the {request_limit}-byte limit")
        except ValueError as exc:
            raise InvalidInputError("Content-Length must be an integer") from exc

    parser = _MemoryMultipartParser(
        boundary,
        nifti_limit=settings.max_upload_bytes,
        bval_limit=min(settings.max_upload_bytes, _MAX_BVAL_BYTES),
    )
    received = 0
    try:
        async for chunk in request.stream():
            received += len(chunk)
            if received > request_limit:
                raise PayloadTooLargeError(f"request exceeds the {request_limit}-byte limit")
            parser.write(chunk)
        return parser.finalize()
    except MultipartParseError as exc:
        raise InvalidInputError(f"invalid multipart upload: {exc}") from exc


def _b_values_from_form(raw: str) -> np.ndarray:
    try:
        parsed = json.loads(raw)
        values = [float(v) for v in parsed]
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise InvalidInputError(
            f"b_values must be a JSON array of numbers: {exc}"
        ) from exc
    return np.asarray(values, dtype=float)


@router.post(
    "/datasets",
    status_code=status.HTTP_201_CREATED,
    response_model=DatasetMeta,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["nifti"],
                        "properties": {
                            "nifti": {"type": "string", "format": "binary"},
                            "bval": {"type": "string", "format": "binary"},
                            "b_values": {
                                "type": "string",
                                "description": "JSON array of b-values when bval is absent",
                            },
                        },
                    }
                }
            },
        }
    },
)
async def create_dataset(
    request: Request,
    storage: Annotated[Storage, Depends(get_storage)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> DatasetMeta:
    parts = await _read_multipart_upload(request, settings)
    nifti = parts.get("nifti")
    if nifti is None:
        raise InvalidInputError("provide a NIfTI file part named nifti")
    raw = bytes(nifti.data)
    available_bytes = settings.max_total_bytes - await storage.total_bytes()
    data, affine = parse_nifti_bytes(
        raw, nifti.filename or "upload.nii.gz",
        min(settings.max_upload_bytes, available_bytes),
    )

    bval = parts.get("bval")
    b_values = parts.get("b_values")
    if bval is not None:
        bvals = parse_bval_bytes(bytes(bval.data))
    elif b_values is not None:
        try:
            bvals = _b_values_from_form(bytes(b_values.data).decode("utf-8"))
        except UnicodeDecodeError as exc:
            raise InvalidInputError("b_values must be UTF-8 JSON") from exc
    else:
        raise InvalidInputError("provide a .bval file or a b_values JSON array")

    if data.ndim != 4:
        raise InvalidInputError(f"expected a 4D volume, got {data.ndim}D")
    if bvals.shape[0] != data.shape[3]:
        raise InvalidInputError(
            f"b-value count ({bvals.shape[0]}) does not match the number of "
            f"volumes ({data.shape[3]})"
        )
    if bvals.shape[0] < 4:
        raise InvalidInputError("IVIM fitting needs at least 4 b-values")
    if not np.isfinite(bvals).all():
        raise InvalidInputError("b-values must all be finite")
    if np.any(bvals < 0):
        raise InvalidInputError("b-values must be non-negative")
    if float(np.min(bvals)) >= 1.0:
        raise InvalidInputError("at least one b-value must be approximately 0")

    ds = Dataset(
        id=uuid4().hex,
        data=data,
        affine=affine,
        b_values=bvals,
        created_at=time.time(),
    )
    await storage.put_dataset(ds)
    return DatasetMeta.from_domain(ds)


@router.get("/datasets/{dataset_id}", response_model=DatasetMeta)
async def get_dataset(
    dataset_id: str, storage: Annotated[Storage, Depends(get_storage)]
) -> DatasetMeta:
    ds = await storage.get_dataset(dataset_id)
    if ds is None:
        raise NotFoundError(f"dataset {dataset_id} not found")
    return DatasetMeta.from_domain(ds)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str, storage: Annotated[Storage, Depends(get_storage)]
) -> None:
    if not await storage.delete_dataset(dataset_id):
        raise NotFoundError(f"dataset {dataset_id} not found")
