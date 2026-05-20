import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, CheckCircle2, Copy, Check } from "lucide-react";

type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

type EndpointGroup = {
  title: string;
  endpoints: Endpoint[];
};

type Endpoint = {
  title: string;                    // e.g. "Create Image Job"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  auth: "jwt" | "apikey" | "any" | "admin";
  summary: string;
  parameters?: Param[];             // body / query / form params
  request?: string;                 // raw request body example
  query?: string;                   // query string example
  curl?: string;                    // curl example (Request Example)
  response: string;                 // response body example
  notes?: string;
};

const GROUPS: EndpointGroup[] = [
  {
    title: "Authentication",
    endpoints: [
      {
        title: "Login (Email + Password)",
        method: "POST",
        path: "/api/auth/login",
        auth: "any",
        summary: "Login bằng email + password, trả về JWT token có hiệu lực 24 giờ.",
        parameters: [
          { name: "email", type: "string", required: true, description: "Email user đã đăng ký." },
          { name: "password", type: "string", required: true, description: "Password user." },
        ],
        request: `{
  "email": "admin@example.com",
  "password": "your-password"
}`,
        response: `{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "user": {
    "id": "5941b0d7-56c9-4345-9dd0-23070eaded5b",
    "email": "admin@example.com",
    "role": "admin"
  }
}`,
      },
      {
        title: "Get Current User",
        method: "GET",
        path: "/api/auth/me",
        auth: "jwt",
        summary: "Lấy profile của user đang đăng nhập (từ token JWT).",
        response: `{
  "id": "5941b0d7-...",
  "email": "admin@example.com",
  "role": "admin",
  "status": "active"
}`,
      },
    ],
  },
  {
    title: "Jobs",
    endpoints: [
      {
        title: "Create Job (Image / Video)",
        method: "POST",
        path: "/api/jobs",
        auth: "jwt",
        summary: "Tạo job mới — image hoặc video, có thể text-to-X hoặc image-to-X. Job video chỉ chạy trên profile có allows_video=true (xem Update Profile).",
        parameters: [
          { name: "provider", type: "string", required: true, description: "\"grok\" hoặc \"flow\"." },
          { name: "job_type", type: "string", required: true, description: "\"image\" hoặc \"video\"." },
          { name: "prompt", type: "string", required: true, description: "Mô tả bằng tiếng Anh, tối đa 2000 ký tự." },
          { name: "profile_id", type: "uuid | null", description: "Null = auto pick profile ít load nhất. Nếu profile được chỉ định ở chế độ image-only (allows_video=false) mà job_type=video → 422." },
          { name: "project_id", type: "uuid | null", description: "Pin GrokProject cụ thể trên profile. Null = priority: per-user pin → domain assignment → first project." },
          { name: "model", type: "string", description: "Grok: aurora | grok-2-image | grok-3-image." },
          { name: "size", type: "string", description: "Pixel size, vd \"1024x1024\". Optional — `options.aspect` được ưu tiên hơn." },
          { name: "style", type: "string", description: "Style hint cho provider, vd \"cinematic\", \"anime\"." },
          { name: "n", type: "integer", description: "Số variant trả về (1-4). Mặc định 1." },
          { name: "seed", type: "integer | null", description: "Seed cố định nếu cần deterministic." },
          { name: "input_image_file_id", type: "uuid | null", description: "File_id từ /api/jobs/upload-input (image-to-X)." },
          { name: "options.aspect", type: "string", description: "1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3." },
          { name: "options.quality", type: "string", description: "\"speed\" | \"quality\"." },
          { name: "options.duration", type: "integer", description: "Video only: 3 / 6 / 9 / 15 giây." },
        ],
        request: `{
  "provider": "grok",
  "job_type": "image",
  "prompt": "A cyberpunk Tokyo street at night",
  "profile_id": null,
  "model": "aurora",
  "n": 1,
  "options": {
    "aspect": "16:9",
    "quality": "speed"
  }
}`,
        response: `{
  "id": "412119c5-57cb-44e1-8f1d-0b13e82ef250",
  "provider": "grok",
  "job_type": "image",
  "prompt": "A cyberpunk Tokyo street at night",
  "status": "queued",
  "profile_id": "db423861-...",
  "result_url": null,
  "error_message": null,
  "retry_count": 0,
  "max_retry": 3,
  "next_attempt_at": null,
  "created_at": "2026-05-09T03:14:22Z",
  "completed_at": null
}`,
        notes: "Status flow: queued → running → processing_provider → uploading_result → success / failed.",
      },
      {
        title: "Upload Reference Image",
        method: "POST",
        path: "/api/jobs/upload-input",
        auth: "jwt",
        summary: "Upload ảnh tham chiếu cho image-to-image hoặc image-to-video.",
        parameters: [
          { name: "file", type: "File", required: true, description: "Binary image, ≤20MB, MIME image/*." },
        ],
        request: `multipart/form-data
  file: <binary image>`,
        response: `{
  "file_id": "0ca03f25-5ded-4ac0-9198-c8beaa0642e0",
  "file_name": "ref.png",
  "mime_type": "image/png",
  "file_size": 213984
}`,
        notes: "Lấy file_id rồi pass vào input_image_file_id khi POST /api/jobs.",
      },
      {
        title: "List Jobs",
        method: "GET",
        path: "/api/jobs",
        auth: "jwt",
        summary: "Liệt kê tất cả job của user, có filter và phân trang.",
        parameters: [
          { name: "status", type: "string", description: "Filter: queued, running, success, failed, cancelled..." },
          { name: "provider", type: "string", description: "Filter: grok | flow." },
          { name: "job_type", type: "string", description: "Filter: image | video." },
          { name: "q", type: "string", description: "Tìm trong prompt." },
          { name: "limit", type: "integer", description: "Tối đa 200. Mặc định 50." },
          { name: "offset", type: "integer", description: "Skip N record (pagination)." },
        ],
        query: "?status=success&limit=50",
        response: `[
  {
    "id": "...",
    "status": "success",
    "result_url": "/api/files/.../download",
    "created_at": "..."
  }
]`,
      },
      {
        title: "Get Job by ID",
        method: "GET",
        path: "/api/jobs/{job_id}",
        auth: "jwt",
        summary: "Trạng thái và metadata chi tiết của 1 job.",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: `{
  "id": "...",
  "status": "success",
  "result_url": "/api/files/a902.../download",
  "retry_count": 0,
  "max_retry": 3,
  "next_attempt_at": null,
  "started_at": "...",
  "completed_at": "..."
}`,
      },
      {
        title: "Get Job Files (Gallery)",
        method: "GET",
        path: "/api/jobs/{job_id}/files",
        auth: "jwt",
        summary: "Tất cả file output của 1 job — job có thể trả nhiều ảnh (n>1).",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: `[
  {
    "id": "...",
    "file_name": "grok_image_1778257238_1.jpg",
    "file_type": "image",
    "mime_type": "image/jpeg",
    "file_size": 271313,
    "download_url": "/api/files/.../download"
  }
]`,
      },
      {
        title: "Get Job Logs",
        method: "GET",
        path: "/api/jobs/{job_id}/logs",
        auth: "jwt",
        summary: "Log chi tiết từng bước: worker, provider, webhook.",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: `[
  { "level": "info", "message": "Job queued (profile=menu-types)", "created_at": "..." },
  { "level": "info", "message": "Submit clicked", "created_at": "..." },
  { "level": "error", "message": "[timeout] No new media within timeout", "created_at": "..." }
]`,
      },
      {
        title: "Retry Failed Job",
        method: "POST",
        path: "/api/jobs/{job_id}/retry",
        auth: "jwt",
        summary: "Retry thủ công job đã failed hoặc cancelled. Tự bump max_retry +1.",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: `{ ...<JobOut>, "status": "queued" }`,
      },
      {
        title: "Cancel Job",
        method: "POST",
        path: "/api/jobs/{job_id}/cancel",
        auth: "jwt",
        summary: "Hủy job đang queued / running. Không hủy được job đã success/failed.",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: `{ ...<JobOut>, "status": "cancelled" }`,
      },
    ],
  },
  {
    title: "Profiles (Admin)",
    endpoints: [
      {
        title: "List Profiles",
        method: "GET",
        path: "/api/profiles",
        auth: "jwt",
        summary: "User: list profile pool admin đã setup. Admin: full list.",
        response: `[
  {
    "id": "db4238...",
    "name": "menu-types",
    "provider": "grok",
    "status": "logged_in",
    "active_jobs": 0,
    "max_concurrent_jobs": 3,
    "active_video_jobs": 0,
    "max_concurrent_video": 4,
    "allows_video": true,
    "last_used_at": "...",
    "created_at": "..."
  }
]`,
        notes: "allows_video = false → profile chỉ nhận job_type=image. Video resolver tự bỏ qua profile này khi auto-pick.",
      },
      {
        title: "Create Profile",
        method: "POST",
        path: "/api/profiles",
        auth: "admin",
        summary: "Tạo profile Chrome user-data-dir trống (chưa login).",
        parameters: [
          { name: "name", type: "string", required: true, description: "Tên profile (unique)." },
          { name: "provider", type: "string", required: true, description: "\"grok\" | \"flow\" | \"other\"." },
          { name: "max_concurrent_jobs", type: "integer", description: "1-16. Mỗi tab ~150MB RAM." },
          { name: "max_concurrent_video", type: "integer", description: "1-12. Cap riêng cho video tabs (Playwright). Mặc định 4." },
          { name: "allows_video", type: "boolean", description: "True (mặc định) = nhận cả image + video. False = profile chỉ ảnh, resolver bỏ qua khi pick job video." },
          { name: "tier", type: "string", description: "free | plus | super_grok | super_grok_heavy. Map plan của Grok account; resolver dùng để filter khi job yêu cầu tier tối thiểu (vd Spicy mode cần super_grok_heavy)." },
        ],
        request: `{
  "name": "menu-types",
  "provider": "grok",
  "max_concurrent_jobs": 3,
  "max_concurrent_video": 4,
  "allows_video": true,
  "tier": "super_grok"
}`,
        response: "<ProfileOut>",
      },
      {
        title: "Update Profile",
        method: "PATCH",
        path: "/api/profiles/{id}",
        auth: "admin",
        summary: "Đổi name, status, max_concurrent_jobs, max_concurrent_video, hoặc allows_video. Tất cả field optional — chỉ gửi field cần đổi.",
        parameters: [
          { name: "name", type: "string", description: "Đổi tên profile." },
          { name: "status", type: "string", description: "logged_in | need_login | blocked | disabled..." },
          { name: "max_concurrent_jobs", type: "integer", description: "1-16." },
          { name: "max_concurrent_video", type: "integer", description: "1-12." },
          { name: "allows_video", type: "boolean", description: "Toggle image-only mode. Đổi true → false sẽ làm các job video pending hết hàng đợi nếu profile này là profile cuối cùng cho phép video." },
        ],
        request: `{ "allows_video": false }`,
        response: "<ProfileOut>",
        notes: "Flip allows_video=false sẽ KHÔNG cancel job video đang chạy — chỉ chặn job mới và lần retry tiếp theo.",
      },
      {
        title: "Upload Cookies (Netscape Format)",
        method: "POST",
        path: "/api/profiles/{id}/upload-cookies",
        auth: "admin",
        summary: "Upload cookies.txt khi VPS bị Cloudflare chặn login.",
        parameters: [
          { name: "file", type: "File", required: true, description: "File cookies.txt (Netscape format)." },
        ],
        request: `multipart/form-data
  file: <cookies.txt>`,
        response: "<ProfileOut> với status=logged_in",
      },
      {
        title: "Start VNC Session",
        method: "POST",
        path: "/api/profiles/{id}/start-vnc-session",
        auth: "admin",
        summary: "Spawn VNC+Chromium container, trả URL iframe để admin login Grok thủ công.",
        response: `{
  "profile_id": "...",
  "iframe_url": "http://host:5173/vnc/<short>/vnc.html?...",
  "expires_in": 86400
}`,
      },
      {
        title: "Finish VNC Session",
        method: "POST",
        path: "/api/profiles/{id}/finish-vnc-session",
        auth: "admin",
        summary: "Đóng modal Auto-login, nhưng container vẫn chạy nền cho worker dùng.",
        response: "<ProfileOut> với status=logged_in",
      },
      {
        title: "Stop VNC Container",
        method: "POST",
        path: "/api/profiles/{id}/stop-vnc",
        auth: "admin",
        summary: "Dừng hẳn VNC container (giải phóng ~1.5GB RAM). Cookies giữ trong volume.",
        response: "<ProfileOut> với status=need_login",
      },
    ],
  },
  {
    title: "Client API (Partner)",
    endpoints: [
      {
        title: "Generate (Image / Video)",
        method: "POST",
        path: "/api/client/generate",
        auth: "apikey",
        summary: "Endpoint dành cho partner — payload đơn giản (target/prompt/ratio/count/…). Cả image và video gửi cùng URL, phân biệt bằng field `target`. Trả task_id rồi poll status.",
        parameters: [
          { name: "target", type: "\"image\" | \"video\"", required: true, description: "Loại task." },
          { name: "prompt", type: "string", required: true, description: "Mô tả nội dung, 1-4000 ký tự." },
          { name: "negative_prompt", type: "string | null", description: "Mô tả những thứ KHÔNG muốn xuất hiện. Có thể bỏ trống." },
          { name: "count", type: "integer", description: "Số biến thể, 1-10. Mặc định 1." },
          { name: "ratio", type: "string | null", description: "Tỉ lệ khung hình: \"1:1\", \"16:9\", \"9:16\", \"4:3\", \"3:4\"..." },
          { name: "quality", type: "string | null", description: "\"standard\" | \"high\". Mặc định standard." },
          { name: "reference_images", type: "string[] | null", description: "URL ảnh tham chiếu, tối đa 8. Có = I2I/I2V, không có = T2I/T2V." },
          { name: "duration", type: "integer | null", description: "Chỉ video — độ dài giây (vd 5, 10)." },
          { name: "profile_id", type: "uuid | null", description: "Pin profile cụ thể. Null = auto pick." },
        ],
        request: `# Tạo ảnh (T2I)
{
  "target": "image",
  "prompt": "a futuristic city at sunset",
  "negative_prompt": "blurry, watermark",
  "count": 1,
  "ratio": "1:1",
  "quality": "standard"
}

# Tạo ảnh từ ảnh tham chiếu (I2I)
{
  "target": "image",
  "prompt": "make it watercolor style",
  "ratio": "1:1",
  "reference_images": ["https://your.cdn/image.jpg"]
}

# Tạo video text-to-video (T2V)
{
  "target": "video",
  "prompt": "a whale jumping out of water",
  "ratio": "16:9",
  "quality": "high",
  "duration": 5
}

# Tạo video từ ảnh (I2V)
{
  "target": "video",
  "prompt": "make it dance",
  "ratio": "9:16",
  "quality": "high",
  "duration": 10,
  "reference_images": ["https://your.cdn/image.jpg"]
}`,
        curl: `curl -X POST https://flowgrok.plxeditor.com/api/client/generate \\
  -H "Authorization: Bearer uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "target": "image",
    "prompt": "a cat in space",
    "ratio": "1:1",
    "count": 1
  }'`,
        response: `{
  "task_id": "22d8dda7-f31b-4f03-9a16-b3cf04f6a554",
  "status": "queued",
  "target": "image"
}`,
        notes: "Auth: Authorization: Bearer <uxpm_live_*>. Status code 201 khi job được nhận, 401 nếu thiếu/sai key, 422 nếu pool không có Grok profile logged_in (admin cần Auto-login trước).",
      },
      {
        title: "Poll Task Status",
        method: "GET",
        path: "/api/client/tasks/{task_id}/status",
        auth: "apikey",
        summary: "Poll trạng thái task. Khi status=success → đọc image_urls/video_urls. Khi status=failed → đọc error_message.",
        parameters: [
          { name: "task_id", type: "uuid", required: true, description: "task_id trả về từ /generate." },
        ],
        curl: `curl https://flowgrok.plxeditor.com/api/client/tasks/<task_id>/status \\
  -H "Authorization: Bearer uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxxx"`,
        response: `# Đang chạy
{
  "task_id": "22d8dda7-f31b-4f03-9a16-b3cf04f6a554",
  "status": "processing_provider",
  "target": "image",
  "image_urls": [],
  "video_urls": [],
  "result": null,
  "error_message": null,
  "created_at": "2026-05-18T16:52:31.846044Z",
  "completed_at": null
}

# Thành công
{
  "task_id": "...",
  "status": "success",
  "target": "video",
  "image_urls": [],
  "video_urls": ["https://flowgrok.plxeditor.com/api/files/<id>/download"],
  "result": {
    "image_urls": [],
    "video_urls": ["https://flowgrok.plxeditor.com/api/files/<id>/download"]
  },
  "error_message": null,
  "created_at": "...",
  "completed_at": "..."
}

# Thất bại
{
  "task_id": "...",
  "status": "failed",
  "target": "image",
  "image_urls": [], "video_urls": [],
  "result": null,
  "error_message": "Profile cookies expired — admin cần Auto-login lại.",
  "completed_at": "..."
}`,
        notes: "Status values: queued | running | processing_provider | uploading_result | success | failed | cancelled. Poll mỗi 2-5s. Video có thể mất 2-5 phút. URL kết quả có thể là tuyệt đối (https://...) hoặc tương đối (/api/files/<id>/download — gắn base URL trước khi tải).",
      },
    ],
  },
  {
    title: "Files",
    endpoints: [
      {
        title: "Download File",
        method: "GET",
        path: "/api/files/{file_id}/download",
        auth: "jwt",
        summary: "Tải file kết quả (ảnh / video). Response trả binary với Content-Type đúng.",
        parameters: [
          { name: "file_id", type: "uuid", required: true, description: "ID file (trong path)." },
        ],
        response: "<binary file content>",
      },
      {
        title: "Get File Metadata",
        method: "GET",
        path: "/api/files/{file_id}",
        auth: "jwt",
        summary: "Metadata của file (không tải binary).",
        parameters: [
          { name: "file_id", type: "uuid", required: true, description: "ID file (trong path)." },
        ],
        response: `{
  "id": "...",
  "file_name": "...",
  "file_type": "image",
  "file_size": 271313
}`,
      },
    ],
  },
  {
    title: "API Keys (External)",
    endpoints: [
      {
        title: "Create API Key",
        method: "POST",
        path: "/api/api-keys",
        auth: "jwt",
        summary: "Tạo API key cho user. Raw key chỉ hiển thị MỘT LẦN duy nhất.",
        parameters: [
          { name: "name", type: "string", required: true, description: "Tên định danh key." },
          { name: "allowed_providers", type: "string[]", description: "Danh sách provider được phép gọi." },
          { name: "allowed_job_types", type: "string[]", description: "image | video." },
          { name: "rate_limit_per_minute", type: "integer", description: "Mặc định 60." },
          { name: "daily_limit", type: "integer", description: "Tổng job/ngày. 0 = unlimited." },
          { name: "expires_at", type: "datetime | null", description: "Null = không hết hạn." },
        ],
        request: `{
  "name": "production-server",
  "allowed_providers": ["grok"],
  "allowed_job_types": ["image"],
  "rate_limit_per_minute": 60,
  "daily_limit": 1000,
  "expires_at": null
}`,
        response: `{
  "id": "...",
  "raw_key": "uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "key_prefix": "uxpm_live_xxxx",
  "name": "production-server"
}`,
      },
      {
        title: "Upload Reference Image (Public)",
        method: "POST",
        path: "/v1/jobs/upload-input",
        auth: "apikey",
        summary: "Upload ảnh tham chiếu cho image-to-image / image-to-video. Probe Grok content moderation — ảnh vi phạm bị 400 ngay.",
        parameters: [
          { name: "file", type: "File (multipart)", required: true, description: "Binary image, ≤20MB, image/*." },
        ],
        request: `# multipart/form-data
file: <binary>`,
        response: `{
  "file_id": "uuid",
  "file_name": "...",
  "mime_type": "image/png",
  "file_size": 180612
}`,
        notes: "400 nếu ảnh vi phạm content policy của Grok — body chứa message. Sau khi nhận file_id, pass vào input_image_file_id của /v1/jobs/image hoặc /v1/jobs/video.",
      },
      {
        title: "Create Image Job (Public)",
        method: "POST",
        path: "/v1/jobs/image",
        auth: "apikey",
        summary: "Public endpoint dùng API key. Hỗ trợ text-to-image (chỉ prompt) hoặc image-to-image (kèm input_image_file_id).",
        parameters: [
          { name: "provider", type: "string", required: true, description: "\"grok\" hoặc \"flow\"." },
          { name: "prompt", type: "string", required: true, description: "Mô tả ảnh." },
          { name: "profile_id", type: "uuid | null", description: "Null = auto pick. Image-only profiles vẫn nhận job_type=image bình thường." },
          { name: "input_image_file_id", type: "uuid | null", description: "File_id từ /v1/jobs/upload-input để image-to-image. Bỏ trống = text-to-image." },
          { name: "options.aspect", type: "string", description: "16:9, 1:1, 9:16..." },
          { name: "options.quality", type: "string", description: "speed | quality." },
        ],
        request: `# Text-to-image
{
  "provider": "grok",
  "prompt": "A modern dashboard",
  "options": { "aspect": "16:9", "quality": "quality" }
}

# Image-to-image
{
  "provider": "grok",
  "prompt": "make it cyberpunk style",
  "input_image_file_id": "uuid-from-upload",
  "options": { "aspect": "16:9", "quality": "speed" }
}`,
        response: `{ "job_id": "...", "status": "queued" }`,
      },
      {
        title: "Create Video Job (Public)",
        method: "POST",
        path: "/v1/jobs/video",
        auth: "apikey",
        summary: "Public endpoint dùng API key. Hỗ trợ text-to-video hoặc image-to-video (kèm input_image_file_id). Backend chỉ chọn profile có allows_video=true.",
        parameters: [
          { name: "provider", type: "string", required: true, description: "\"grok\" hoặc \"flow\"." },
          { name: "prompt", type: "string", required: true, description: "Mô tả video, tối đa 4000 ký tự." },
          { name: "profile_id", type: "uuid | null", description: "Null = auto pick. Pass UUID của profile image-only → 422 \"Profile này chỉ tạo ảnh\"." },
          { name: "input_image_file_id", type: "uuid | null", description: "File_id từ /v1/jobs/upload-input để image-to-video. Bỏ trống = text-to-video." },
          { name: "options.aspect", type: "string", description: "16:9, 1:1, 9:16... Mặc định 1:1." },
          { name: "options.resolution", type: "string", description: "480p | 720p (cần plan có quyền 720p)." },
          { name: "options.duration", type: "integer", description: "6 | 10 giây (cần plan có quyền 10s)." },
          { name: "options.mode", type: "string", description: "normal | fun | custom | spicy (Spicy = 18+, cần SuperGrok Heavy)." },
        ],
        request: `# Text-to-video
{
  "provider": "grok",
  "prompt": "A whale jumping out of water in slow motion",
  "options": { "aspect": "16:9", "resolution": "720p", "duration": 6, "mode": "normal" }
}

# Image-to-video (animate uploaded image)
{
  "provider": "grok",
  "prompt": "make it move toward the camera",
  "input_image_file_id": "uuid-from-upload",
  "options": { "resolution": "720p", "duration": 6 }
}`,
        response: `{ "job_id": "...", "status": "queued" }`,
        notes: "Nếu pool không còn profile nào allows_video=true → 422 \"Không có profile grok nào logged_in\". Set 1 profile allows_video=true ở /api/profiles trước khi gọi.",
      },
      {
        title: "Bulk Delete Jobs (Public)",
        method: "POST",
        path: "/v1/jobs/bulk-delete",
        auth: "apikey",
        summary: "Xoá nhiều job 1 lần. Job đang chạy bị skip — cancel trước nếu muốn xoá.",
        parameters: [
          { name: "ids", type: "uuid[]", required: true, description: "1-500 job UUIDs." },
        ],
        request: `{ "ids": ["uuid-1", "uuid-2", "uuid-3"] }`,
        response: `{
  "deleted": 2,
  "skipped_in_flight": 1,
  "skipped_not_owned": 0
}`,
      },
      {
        title: "Get Job Status (Public)",
        method: "GET",
        path: "/v1/jobs/{job_id}",
        auth: "apikey",
        summary: "Polling status từ máy ngoài bằng API key.",
        parameters: [
          { name: "job_id", type: "uuid", required: true, description: "ID job (trong path)." },
        ],
        response: "<JobOut>",
      },
    ],
  },
  {
    title: "Webhooks",
    endpoints: [
      {
        title: "Get Webhook Config",
        method: "GET",
        path: "/api/settings/webhook",
        auth: "jwt",
        summary: "Lấy webhook config hiện tại của user. `has_secret=true` nếu đã có secret được mint.",
        response: `{
  "webhook_url": "https://your.app/grokflow-callback",
  "has_secret": true,
  "new_secret": null
}`,
      },
      {
        title: "Set / Rotate Webhook",
        method: "PUT",
        path: "/api/settings/webhook",
        auth: "jwt",
        summary: "Set webhook URL (server tự mint secret) hoặc rotate secret. Secret CHỈ trả 1 lần duy nhất khi mint/rotate — lưu ngay.",
        parameters: [
          { name: "webhook_url", type: "string | null", required: true, description: "HTTPS URL nhận POST event. Pass null để xoá webhook." },
          { name: "rotate_secret", type: "boolean", description: "true = mint secret mới (cũ vô hiệu). Lần set URL đầu tiên tự mint secret kể cả không pass rotate_secret. Mặc định false." },
        ],
        request: `# Lần đầu set URL — server tự mint secret
{
  "webhook_url": "https://your.app/grokflow-callback"
}

# Đổi URL, giữ secret cũ
{
  "webhook_url": "https://your.app/new-callback"
}

# Rotate secret (URL không đổi cũng được)
{
  "webhook_url": "https://your.app/grokflow-callback",
  "rotate_secret": true
}

# Xoá webhook
{ "webhook_url": null }`,
        response: `# Khi mint hoặc rotate — new_secret trả về MỘT LẦN
{
  "webhook_url": "https://your.app/grokflow-callback",
  "has_secret": true,
  "new_secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}

# Khi chỉ đổi URL, không rotate
{
  "webhook_url": "https://your.app/new-callback",
  "has_secret": true,
  "new_secret": null
}`,
        notes:
          "Payload server bắn về URL: { event, job_id, user_id, status, result_url, error_message, signature }. Verify HMAC-SHA256(payload_body, your_secret) === signature. Secret lưu HỆ chỉ 1 lần — đánh mất → phải rotate.",
      },
    ],
  },
];

const BADGES: Record<Endpoint["auth"], { label: string; cls: string }> = {
  jwt:    { label: "JWT",    cls: "bg-blue-100 text-blue-700" },
  apikey: { label: "APIKEY", cls: "bg-purple-100 text-purple-700" },
  admin:  { label: "ADMIN",  cls: "bg-rose-100 text-rose-700" },
  any:    { label: "PUBLIC", cls: "bg-slate-100 text-slate-700" },
};

const METHOD_CLS: Record<Endpoint["method"], string> = {
  GET:    "bg-emerald-500 text-white",
  POST:   "bg-blue-500 text-white",
  PUT:    "bg-amber-600 text-white",
  PATCH:  "bg-amber-500 text-white",
  DELETE: "bg-rose-500 text-white",
};

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 right-2 p-1.5 rounded hover:bg-slate-700 text-slate-400"
      title={copied ? t("grok.apidocs_copied") : t("grok.apidocs_copy")}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 p-3 pr-10 rounded-md text-xs whitespace-pre overflow-x-auto">
        {children}
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

function ParametersTable({ params }: { params: Param[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-white text-left">
          <tr className="text-slate-600">
            <th className="px-3 py-2 font-semibold w-1/4">{t("grok.apidocs_th_name")}</th>
            <th className="px-3 py-2 font-semibold w-1/4">{t("grok.apidocs_th_type")}</th>
            <th className="px-3 py-2 font-semibold">{t("grok.apidocs_th_description")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {params.map((p) => (
            <tr key={p.name}>
              <td className="px-3 py-2 font-mono text-rose-600 align-top">
                {p.name}
                {p.required && <span className="ml-1 text-rose-500" title={t("grok.apidocs_required")}>*</span>}
              </td>
              <td className="px-3 py-2 font-mono text-slate-500 text-xs align-top">{p.type}</td>
              <td className="px-3 py-2 text-slate-700 align-top">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ ep, apiBase }: { ep: Endpoint; apiBase: string }) {
  const { t } = useTranslation();
  const fullUrl = `${apiBase}${ep.path}${ep.query ?? ""}`;
  const curlExample =
    ep.curl ??
    (ep.request
      ? `curl -X ${ep.method} ${fullUrl} \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${ep.request.replace(/'/g, "'\\''")}'`
      : `curl -X ${ep.method} ${fullUrl} \\
  -H "Authorization: Bearer YOUR_TOKEN"`);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header: method badge + title */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <span
          className={`px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wide ${METHOD_CLS[ep.method]}`}
        >
          {ep.method}
        </span>
        <h3 className="text-base font-semibold text-slate-800">{ep.title}</h3>
        <span
          className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold ${BADGES[ep.auth].cls}`}
        >
          {BADGES[ep.auth].label}
        </span>
      </div>

      {/* Path box */}
      <div className="px-4 pb-3">
        <div className="rounded-md bg-slate-900 text-slate-100 px-3 py-2 font-mono text-sm overflow-x-auto">
          {ep.path}
          {ep.query && <span className="text-slate-400">{ep.query}</span>}
        </div>
      </div>

      {/* Description */}
      {ep.summary && (
        <p className="px-4 pb-3 text-sm text-slate-600 leading-relaxed">{ep.summary}</p>
      )}

      {/* Parameters */}
      {ep.parameters && ep.parameters.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <h4 className="text-sm font-semibold text-slate-800">{t("grok.apidocs_parameters")}</h4>
          <ParametersTable params={ep.parameters} />
        </div>
      )}

      {/* Request Example (curl) */}
      <div className="px-4 pb-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Code2 size={14} className="text-slate-600" />
          {t("grok.apidocs_request_example")}
        </h4>
        <CodeBlock>{curlExample}</CodeBlock>
      </div>

      {/* Response Format */}
      <div className="px-4 pb-4 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-emerald-600" />
          {t("grok.apidocs_response_format")}
        </h4>
        <CodeBlock>{ep.response}</CodeBlock>
      </div>

      {/* Notes */}
      {ep.notes && (
        <div className="mx-4 mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {ep.notes}
        </div>
      )}
    </div>
  );
}

export function ApiDocsPage() {
  const { t } = useTranslation();
  // Show curl examples against the same origin the docs are served from
  // so multi-domain users see their own host in the examples.
  const apiBase =
    typeof window !== "undefined"
      ? window.location.origin
      : (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000");

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">{t("grok.apidocs_title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("grok.apidocs_subtitle")}
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("grok.apidocs_section_authentication")}</h2>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="border-l-4 border-blue-400 pl-3">
            <div className="font-semibold text-blue-700 mb-1">{t("grok.apidocs_auth_jwt_title")}</div>
            <p className="text-slate-600">{t("grok.apidocs_auth_jwt_desc")}</p>
            <code className="text-xs">Authorization: Bearer eyJhbGc...</code>
          </div>
          <div className="border-l-4 border-purple-400 pl-3">
            <div className="font-semibold text-purple-700 mb-1">{t("grok.apidocs_auth_apikey_title")}</div>
            <p className="text-slate-600">{t("grok.apidocs_auth_apikey_desc")}</p>
            <code className="text-xs">Authorization: Bearer uxpm_live_xxx</code>
          </div>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">{g.title}</h2>
          <div className="space-y-3">
            {g.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} apiBase={apiBase} />
            ))}
          </div>
        </section>
      ))}

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("grok.apidocs_section_error_codes")}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs uppercase">
            <tr>
              <th className="py-1">HTTP</th><th>{t("grok.apidocs_th_code")}</th><th>{t("grok.apidocs_th_description")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="py-1.5 pr-4 font-mono">401</td><td className="font-mono">invalid_credentials</td><td>{t("grok.apidocs_err_invalid_credentials")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">401</td><td className="font-mono">invalid_api_key</td><td>{t("grok.apidocs_err_invalid_api_key")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">403</td><td className="font-mono">permission_denied</td><td>{t("grok.apidocs_err_permission_denied")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">404</td><td className="font-mono">job_not_found</td><td>{t("grok.apidocs_err_job_not_found")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">409</td><td className="font-mono">profile_busy</td><td>{t("grok.apidocs_err_profile_busy")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">422</td><td className="font-mono">invalid_payload</td><td>{t("grok.apidocs_err_invalid_payload")}</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">422</td><td className="font-mono">invalid_payload</td><td>Profile được pick chỉ tạo ảnh (allows_video=false) mà job_type=video. Đổi profile_id hoặc bật allows_video.</td></tr>
            <tr><td className="py-1.5 pr-4 font-mono">429</td><td className="font-mono">rate_limited</td><td>{t("grok.apidocs_err_rate_limited")}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("grok.apidocs_section_error_format")}</h2>
        <p className="text-sm text-slate-600">
          {t("grok.apidocs_error_format_intro_a")} <code>error_message</code> {t("grok.apidocs_error_format_intro_b")} <code>[code] message</code>{t("grok.apidocs_error_format_intro_c")}
        </p>
        <ul className="text-sm text-slate-600 space-y-0.5">
          <li><code>cookie_expired</code> — {t("grok.apidocs_err_cookie_expired")}</li>
          <li><code>captcha_required</code> — {t("grok.apidocs_err_captcha_required")}</li>
          <li><code>provider_blocked</code> — {t("grok.apidocs_err_provider_blocked")}</li>
          <li><code>rate_limited</code> — {t("grok.apidocs_err_rate_limited_msg")}</li>
          <li><code>browser_crashed</code> / <code>network_error</code> / <code>timeout</code> — {t("grok.apidocs_err_retryable")}</li>
          <li><code>retries_exhausted</code> — {t("grok.apidocs_err_retries_exhausted")}</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">{t("grok.apidocs_section_openapi")}</h2>
        <p className="text-sm text-slate-600">
          {t("grok.apidocs_openapi_prefix")}{" "}
          <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
            {apiBase}/docs
          </a>{" "}
          {t("grok.apidocs_openapi_swagger")}{" "}
          <a href={`${apiBase}/redoc`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
            {apiBase}/redoc
          </a>{" "}
          {t("grok.apidocs_openapi_redoc")}
        </p>
      </section>
    </div>
  );
}
