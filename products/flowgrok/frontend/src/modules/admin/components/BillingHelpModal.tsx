import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  X, BookOpen, Sparkles, Crown, AlertTriangle, CreditCard, Receipt, ArrowRight,
} from "lucide-react";

export function BillingHelpModal({ onClose, isSuper }: { onClose: () => void; isSuper: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3 bg-gradient-to-r from-emerald-50 to-cyan-50">
          <h2 className="font-semibold flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-700" />
            Hướng dẫn Billing — luồng gói & thanh toán
          </h2>
          <button onClick={onClose} className="text-slate-9000 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto space-y-5 text-sm">
          {/* Intro */}
          <section className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-emerald-900 text-xs leading-relaxed">
            GrokFlow chạy theo mô hình <strong>plan-based entitlements</strong>: mỗi user
            được gán 1 gói (Free / Basic / Pro / Enterprise) → gói quyết định
            <em>tính năng nào dùng được</em> và <em>quota mỗi ngày/tháng</em>.
            Trang Billing này là nơi xem gói hiện tại, nâng cấp, và quản lý
            hóa đơn.
          </section>

          {/* The 4-page flow */}
          <DocSection n={1} icon={Sparkles} title="Luồng từ Landing → Billing">
            <ol className="list-decimal pl-5 space-y-1.5 text-xs">
              <li>
                <Link to="/landing" className="font-mono text-violet-600 hover:underline">/landing</Link>{" "}
                — trang public giới thiệu, link "Xem giá" → <code>/pricing</code>.
              </li>
              <li>
                <Link to="/pricing" className="font-mono text-violet-600 hover:underline">/pricing</Link>{" "}
                — bảng giá đầy đủ (Free / Basic / Pro / Enterprise) với tính năng + limit.
                Mỗi card có nút <strong>Đăng ký</strong>.
              </li>
              <li>
                <code className="font-mono">/checkout/:plan_code</code>{" "}
                — form thanh toán: chọn chu kỳ (tháng/năm), provider, xem QR / OTP.
                Sau khi submit → subscription chuyển sang <code>pending</code>.
              </li>
              <li>
                <strong>/billing</strong> (trang này) — xem gói hiện tại, đơn pending,
                hóa đơn, lịch sử thanh toán. Super_admin sẽ kích hoạt pending subscription
                khi xác nhận chuyển khoản → status <code>active</code>.
              </li>
            </ol>
          </DocSection>

          {/* Plan tiers */}
          <DocSection n={2} icon={Crown} title="4 gói mặc định">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <PlanCard
                name="Free"
                price="0₫"
                color="slate"
                items={["1 profile", "10 job / ngày", "Chỉ image cơ bản", "Không API public"]}
              />
              <PlanCard
                name="Basic"
                price="199.000₫/tháng"
                color="cyan"
                items={["2 profiles", "50 job / ngày", "Image + Video", "Aspect ratios đầy đủ"]}
              />
              <PlanCard
                name="Pro"
                price="599.000₫/tháng"
                color="violet"
                items={["5 profiles", "200 job / ngày", "Quality cao + 720p", "API public + Webhooks"]}
              />
              <PlanCard
                name="Enterprise"
                price="Liên hệ"
                color="amber"
                items={["Custom limits", "SLA + support", "Spicy / Custom mode", "Multi-domain"]}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Định nghĩa chi tiết trong <code className="font-mono">backend/app/modules/entitlements/catalog.py</code>.
              Super_admin có thể chỉnh entitlements + price ở{" "}
              <Link to="/admin/plans" className="text-violet-600 hover:underline">/admin/plans</Link>.
            </p>
          </DocSection>

          {/* Quotas */}
          <DocSection n={3} icon={AlertTriangle} title="Quota hoạt động ra sao">
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>
                <strong>daily_jobs</strong>: backend đếm jobs bạn tạo trong 24h gần nhất.
                Vượt → <code>EntitlementBlocked</code> với HTTP 403 + message tiếng Việt.
              </li>
              <li>
                <strong>monthly_jobs</strong>: tương tự nhưng cửa sổ 30 ngày.
              </li>
              <li>
                <strong>max_concurrent_jobs</strong>: số job có thể chạy đồng thời. Vượt → queue lại đợi slot.
              </li>
              <li>
                <strong>max_profiles</strong>, <strong>max_api_keys</strong>: hard cap lúc tạo —
                vượt → block ngay từ POST với hint nâng gói.
              </li>
              <li>
                Giá trị <code>0</code> trong entitlements = <strong>không giới hạn</strong> (Enterprise).
              </li>
            </ul>
          </DocSection>

          {/* Payment flow */}
          <DocSection n={4} icon={CreditCard} title="Vòng đời subscription">
            <div className="text-xs space-y-2">
              <FlowStep label="pending" color="bg-amber-100 text-amber-700">
                Vừa tạo qua /checkout, đang đợi user chuyển khoản
              </FlowStep>
              <FlowStep label="active" color="bg-emerald-100 text-emerald-700">
                Super_admin xác nhận thanh toán → quota mới apply ngay
              </FlowStep>
              <FlowStep label="cancel_at_period_end" color="bg-amber-100 text-amber-700">
                User bấm Hủy nhưng vẫn dùng được tới hết chu kỳ
              </FlowStep>
              <FlowStep label="cancelled / expired" color="bg-slate-100 text-slate-700">
                Hết chu kỳ → tự rớt về Free plan
              </FlowStep>
            </div>
          </DocSection>

          {/* Invoices */}
          <DocSection n={5} icon={Receipt} title="Hóa đơn (Invoices)">
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>Mỗi <code>payment.status=success</code> tự sinh 1 invoice (status <code>paid</code>).</li>
              <li>Invoice có <code>invoice_number</code> dạng <code>INV-YYYYMM-XXXX</code> + PDF link (nếu provider trả về).</li>
              <li><code>line_items</code> liệt kê: plan name, chu kỳ, amount, tax (nếu có).</li>
              <li>Hóa đơn được lưu vĩnh viễn để audit + thuế.</li>
            </ul>
          </DocSection>

          {/* Admin actions */}
          {isSuper && (
            <DocSection n={6} icon={Crown} title="Quyền super_admin tại đây">
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>
                  Section <strong>"Toàn bộ subscriptions / payments / invoices"</strong> phía
                  trên = AdminBillingTab — CRUD đầy đủ cross-tenant.
                </li>
                <li>
                  Chuyển subscription <code>pending → active</code> khi xác nhận thanh
                  toán (xem cột Provider để biết phương thức user dùng).
                </li>
                <li>
                  Tạo invoice/payment thủ công cho khách offline (B2B).
                </li>
                <li>
                  Refund / huỷ subscription giữa kỳ → cập nhật entitlements ngay lập tức.
                </li>
              </ul>
            </DocSection>
          )}

          {/* Link forward */}
          <section className="rounded-md bg-violet-50 border border-violet-200 p-3 text-violet-900 text-xs">
            💡 Muốn xem chi tiết features per-plan? Vào{" "}
            <Link to="/pricing" className="font-semibold underline">/pricing</Link>{" "}
            (public — không cần login) hoặc{" "}
            <Link to="/admin/plans" className="font-semibold underline">/admin/plans</Link>{" "}
            (super_admin) để chỉnh entitlements.
          </section>

          <div className="flex justify-end pt-2 border-t">
            <button onClick={onClose} className="btn-primary">Đã hiểu</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocSection({
  n, icon: Icon, title, children,
}: { n: number; icon: any; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">
          {n}
        </span>
        <Icon size={14} className="text-slate-500" />
        {title}
      </h3>
      <div className="pl-8 text-slate-700">{children}</div>
    </section>
  );
}

function PlanCard({
  name, price, items, color,
}: { name: string; price: string; items: string[]; color: "slate" | "cyan" | "violet" | "amber" }) {
  const cls = {
    slate:  { ring: "ring-slate-200",  bg: "bg-white",   text: "text-slate-700"  },
    cyan:   { ring: "ring-cyan-200",   bg: "bg-cyan-50",    text: "text-cyan-700"   },
    violet: { ring: "ring-violet-200", bg: "bg-violet-50",  text: "text-violet-700" },
    amber:  { ring: "ring-amber-200",  bg: "bg-amber-50",   text: "text-amber-700"  },
  }[color];
  return (
    <div className={`rounded-md ${cls.bg} ring-1 ${cls.ring} p-2.5`}>
      <div className={`font-semibold ${cls.text}`}>{name}</div>
      <div className="text-[11px] text-slate-600 mt-0.5">{price}</div>
      <ul className="mt-1.5 text-[11px] text-slate-700 space-y-0.5">
        {items.map((it) => <li key={it}>• {it}</li>)}
      </ul>
    </div>
  );
}

function FlowStep({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium flex-shrink-0 ${color}`}>{label}</span>
      <ArrowRight size={12} className="text-slate-9000 mt-1 flex-shrink-0" />
      <span className="text-slate-600">{children}</span>
    </div>
  );
}
