/**
 * Frontend mirror of backend/app/modules/entitlements/catalog.py
 *
 * Keep these keys in sync with backend FEATURES + LIMITS.
 */

export const FEATURE_KEYS = {
  jobImage: "job.image",
  jobVideo: "job.video",
  jobImageToImage: "job.image_to_image",
  jobImageToVideo: "job.image_to_video",
  imageQualityHigh: "image.quality_high",
  imageAspectRatiosFull: "image.aspect_ratios_full",
  videoResolution720p: "video.resolution_720p",
  videoDuration10s: "video.duration_10s",
  videoSpicy: "video.spicy",
  videoFunMode: "video.fun_mode",
  videoCustomMode: "video.custom_mode",
  apiPublicV1: "api.public_v1",
  uiApiDocs: "ui.api_docs",
  uiAuditLog: "ui.audit_log",
  uiWebhooks: "ui.webhooks",
  uiSettings: "ui.settings",
} as const;

export const LIMIT_KEYS = {
  maxProfiles: "max_profiles",
  maxApiKeys: "max_api_keys",
  maxConcurrentJobs: "max_concurrent_jobs",
  dailyJobs: "daily_jobs",
  monthlyJobs: "monthly_jobs",
} as const;
