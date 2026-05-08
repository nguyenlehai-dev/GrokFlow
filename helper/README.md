# GrokFlow Helper

Tool nhỏ chạy trên **máy local của bạn** để mở Chrome → login provider → tự sync cookies về GrokFlow server.

## Tại sao cần helper

GrokFlow server là Linux headless (không có màn hình) → không thể "popup" Chrome lên cho bạn click. Chrome phải mở trên máy bạn. Helper này:

1. Mở Chrome với profile tạm + URL provider (grok.com / flow).
2. Bạn đăng nhập bình thường.
3. Bạn đóng Chrome → helper tự pull cookies → upload mã hóa lên GrokFlow.

Helper **không gửi password**. Chỉ cookies sau khi bạn đăng nhập xong.

## Yêu cầu

- Python 3.9+
- Google Chrome (hoặc Edge / Chromium)
- Trên Windows: PowerShell hoặc CMD

## Cài

```bash
pip install websocket-client
```

(Không cần cài thêm package nào khác — helper chỉ dùng stdlib + websocket-client.)

## Dùng

### Cách 1 — Lấy lệnh từ dashboard

1. Mở dashboard → tab Profiles → chọn profile muốn login → click **"Auto login"**.
2. Modal sẽ hiển thị lệnh đầy đủ kèm token. Copy paste vào terminal local.

### Cách 2 — Chạy thủ công

```bash
python grokflow-helper.py \
    --server https://flowgrok.vpspanel.io.vn \
    --token <HELPER_TOKEN> \
    --profile <PROFILE_UUID> \
    --provider grok
```

Hoặc chạy không args, helper sẽ prompt:

```bash
python grokflow-helper.py
```

## Flow

```
[Helper]                          [User]                    [GrokFlow Server]
   │                                │                              │
   │ Spawn Chrome with grok.com     │                              │
   ├────────────────────────────►   │                              │
   │                                │ Login Grok                   │
   │                                │ Use Grok freely if want      │
   │                                │ Close Chrome                 │
   │ ◄──────────────────────────────┤                              │
   │ Read cookies via CDP           │                              │
   │ Upload encrypted cookies       │                              │
   ├────────────────────────────────────────────────────────────► │
   │                                │                              │ Save
   │                                │                              │ encrypted
   │                                │           Profile.status     │
   │                                │           = logged_in        │
   │ ◄────────────────────────────────────────────────────────────┤
   │ "Hoàn tất!"                    │                              │
```

## Bảo mật

- Token chỉ valid 30 phút, gắn riêng cho 1 profile.
- Cookies được TLS lúc upload + Fernet encrypted trên server.
- Không gửi password đi đâu.
- Helper không có shortcut/install — bạn xóa file đi sau khi dùng nếu lo.
