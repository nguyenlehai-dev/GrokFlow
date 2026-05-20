"""Pydantic DTOs for the Flow video-processing module."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class InputFileOut(BaseModel):
    filename: str
    object_key: str


class FlowJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    operation: str
    status: str
    progress: float
    params: dict[str, Any] | None
    input_files: list[InputFileOut] | None
    output_url: str | None
    output_filename: str | None
    file_size: int | None
    duration: float | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class FlowJobListOut(BaseModel):
    jobs: list[FlowJobOut]
    total: int


class UploadResponse(BaseModel):
    job_id: UUID
    input_files: list[InputFileOut]
    backend: str


class UploadByUrlsRequest(BaseModel):
    tool_name: str
    urls: list[str]
