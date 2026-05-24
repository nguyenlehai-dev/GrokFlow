import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


JOB_STATUSES = [
    "pending",
    "queued",
    "running",
    "processing_provider",
    "uploading_result",
    "success",
    "failed",
    "cancelled",
    "expired",
]


SIZE_OPTIONS = ["1024x1024", "1024x768", "768x1024", "1024x576", "576x1024", "1920x1080", "1080x1920"]
MODEL_OPTIONS_GROK = ["aurora", "grok-2-image", "grok-3-image"]
MODEL_OPTIONS_FLOW = ["veo-3", "veo-2"]
STYLE_OPTIONS = ["natural", "vivid", "anime", "photographic"]


class JobCreate(BaseModel):
    provider: str = Field(pattern="^(grok|flow)$")
    job_type: str = Field(pattern="^(image|video)$")
    prompt: str = Field(min_length=1, max_length=16000)
    profile_id: uuid.UUID | None = None
    # Explicit per-job project override. When set, the auto-pick rules in
    # service._create_job are skipped and this project is used verbatim.
    # The project's profile MUST match `profile_id` if both are set;
    # otherwise the row is invalid and we 400.
    project_id: uuid.UUID | None = None
    # Optional convenience fields — backend merges these into `options` JSONB.
    size: str | None = Field(default=None, description="e.g. 1024x1024")
    model: str | None = Field(default=None)
    style: str | None = Field(default=None)
    n: int = Field(default=1, ge=1, le=4, description="Number of variants")
    seed: int | None = Field(default=None)
    input_image_file_id: uuid.UUID | None = Field(default=None, description="Reference image (image-to-image, single-ref legacy)")
    reference_images: list[uuid.UUID] | None = Field(
        default=None, max_length=4,
        description=(
            "Up to 4 reference image file_ids for multi-reference jobs (face source, "
            "outfit source, background, etc.). Worker passes ALL of them to Grok's "
            "chat upload widget. Coexists with input_image_file_id — both lists are "
            "merged + de-duped, max 4 retained."
        ),
    )
    options: dict[str, Any] | None = None


class JobUpdate(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=16000)
    options: dict[str, Any] | None = None


class JobOut(BaseModel):
    id: uuid.UUID
    provider: str
    job_type: str
    prompt: str
    status: str
    profile_id: uuid.UUID | None
    result_url: str | None
    error_message: str | None
    retry_count: int
    max_retry: int
    next_attempt_at: datetime | None = None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    is_favorite: bool = False
    tags: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class JobLogOut(BaseModel):
    level: str
    message: str
    context: dict | None
    created_at: datetime

    class Config:
        from_attributes = True
