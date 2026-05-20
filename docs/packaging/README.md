# Packaging — Hướng dẫn dành cho vendor + khách hàng

Hệ thống đóng gói `products/` đã được set up để giao 3 standalone product
cho khách độc lập, trong khi vẫn giữ 1 nguồn code duy nhất ở monorepo.

## Mục lục

| Doc | Audience | Nội dung |
|-----|----------|----------|
| [VENDOR.md](VENDOR.md) | Bạn (maintainer) | Workflow hàng ngày: dev trong monorepo → export → push sang repo khách |
| [CUSTOMER.md](CUSTOMER.md) | Khách hàng | Cài đặt lần đầu + cập nhật + troubleshoot trên VPS của họ |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Cả hai | Tại sao có layout này, monorepo vs products vs repos khách |
| [PACKAGING.md](PACKAGING.md) | Vendor (advanced) | Đầy đủ `manifest.yaml` reference + override/patch syntax |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Cả hai | Bug đã gặp, cách fix, log để check |

## Tóm tắt 30 giây

```
                   VENDOR (BẠN)                             KHÁCH HÀNG
                   ──────────────                           ────────────
                                                        
                   monorepo (private)                      
                   └─ backend/ + frontend/                    
                   └─ products/<name>/manifest.yaml          
                                                        
                          │                                 
                          │  python products/_scripts/      
                          │  export_product.py <name>       
                          ▼                                 
                                                        
                   GitHub: nt7310063-boop/<name>            
                                  │                         
                                  │ git clone (read-only PAT)
                                  ▼                         
                                                        
                                                       VPS khách
                                                       ─────────
                                                       /opt/<name>/
                                                       └─ bash _scripts/customer_setup.sh
                                                       └─ docker compose up -d
                                                       └─ truy cập editor.khach.com
```

## 3 sản phẩm hiện có

| Product | GitHub repo | Tính năng | Customer |
|---------|-------------|-----------|----------|
| `flowgrok` | `nt7310063-boop/flowgrok` | Grok image+video gateway, partner API | Khách Vũ |
| `ai-gateway` | `nt7310063-boop/ai-gateway` | LLM router (OpenAI/Anthropic/Gemini/Grok/...) | Khách Gateway |
| `plxeditor-studio` | `nt7310063-boop/plxeditor-studio` | Editor full: Grok + Flow video tools | Enterprise |
