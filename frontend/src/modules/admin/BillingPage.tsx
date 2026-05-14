import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, AlertCircle, FileText, Download, X,
  Wallet, Crown, ChevronRight, ChevronDown, BookOpen,
  Sparkles, CreditCard, Receipt, AlertTriangle, ArrowRight,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { AdminBillingTab } from "./AdminBillingTab";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  provider: string;
  amount: number | string;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  subscription_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  subscription_id: string | null;
  payment_id: string | null;
  invoice_number: string;
  amount: number | string;
  tax: number | string;
  total: number | string;
  currency: string;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  line_items: any[];
  billing_info: any;
  pdf_url: string | null;
  created_at: string;
}

interface Summary {
  current_subscription: Subscription | null;
  pending_subscriptions: Subscription[];
  recent_payments: Payment[];
  recent_invoices: Invoice[];
}

// ─── Utils ─────────────────────────────────────────────────────────────────

const formatVnd = (n: number | string) =>
  new Intl.NumberFormat("vi-VN").format(Number(n)) + "₫";

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("vi-VN") : "—";

const STATUS_STYLE: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700",
  pending:   "bg-amber-100 text-amber-700",
  success:   "bg-emerald-100 text-emerald-700",
  paid:      "bg-emerald-100 text-emerald-700",
  draft:     "bg-ink-800 text-ink-200",
  cancelled: "bg-ink-800 text-ink-200",
  expired:   "bg-ink-800 text-ink-200",
  failed:    "bg-rose-100 text-rose-700",
  past_due:  "bg-rose-100 text-rose-700",
  refunded:  "bg-purple-100 text-purple-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[status] ?? "bg-ink-800 text-ink-200"}`}>
      {status}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function BillingPage() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const isAdmin = me?.role === "admin" || isSuper;

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["billing-summary"],
    queryFn: async () => (await api.get<Summary>("/api/billing/me")).data,
  });

  const cancel = useMutation({
    mutationFn: (subId: string) => api.post(`/api/billing/subscriptions/${subId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
      toast("Đã hủy subscription", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Hủy lỗi", "error"),
  });

  // Section collapse state — admin sees system block expanded by default,
  // personal-billing section collapsed (less interesting for super_admin).
  const [openSystem, setOpenSystem] = useState(isSuper);
  const [openPersonal, setOpenPersonal] = useState(!isSuper);
  const [help, setHelp] = useState(false);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
              Billing {isSuper && "· Quản trị hệ thống"}
            </p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Wallet size={22} />
              {isSuper ? "Quản lý billing toàn hệ thống" : "Billing & gói dịch vụ"}
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {isSuper
                ? "Subscriptions, payments, invoices của mọi tenant + gói cá nhân của bạn."
                : "Gói hiện tại, hóa đơn và lịch sử thanh toán."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelp(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900/10 hover:bg-ink-900/20 backdrop-blur-sm px-3 py-2 text-sm font-medium border border-white/30"
              title="Hướng dẫn billing"
            >
              <BookOpen size={14} /> Hướng dẫn
            </button>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900/15 hover:bg-ink-900/25 backdrop-blur-sm px-4 py-2 text-sm font-medium border border-white/30"
            >
              <Crown size={14} /> Đổi gói / Nâng cấp
            </Link>
          </div>
        </div>
      </div>

      {/* SYSTEM-WIDE BILLING — admin / super_admin only */}
      {isAdmin && (
        <section className="rounded-xl bg-ink-900 ring-1 ring-ink-800 overflow-hidden">
          <button
            onClick={() => setOpenSystem(!openSystem)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-ink-900 transition border-b border-ink-800"
          >
            <div className="flex items-center gap-2 text-left">
              <Crown size={16} className="text-amber-600" />
              <div>
                <h2 className="font-semibold text-ink-100">
                  {isSuper ? "Toàn bộ subscriptions / payments / invoices" : "Billing trong domain"}
                </h2>
                <p className="text-xs text-ink-400">
                  3 tab: Subscriptions · Payments · Invoices — CRUD đầy đủ
                </p>
              </div>
            </div>
            {openSystem ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {openSystem && (
            <div className="p-5 bg-ink-900/30">
              <AdminBillingTab />
            </div>
          )}
        </section>
      )}

      {help && <BillingHelpModal onClose={() => setHelp(false)} isSuper={isSuper} />}

      {/* PERSONAL BILLING — everyone */}
      <section className="rounded-xl bg-ink-900 ring-1 ring-ink-800 overflow-hidden">
        <button
          onClick={() => setOpenPersonal(!openPersonal)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-ink-900 transition border-b border-ink-800"
        >
          <div className="flex items-center gap-2 text-left">
            <Wallet size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-ink-100">Gói của bạn</h2>
              <p className="text-xs text-ink-400">
                Subscription cá nhân, hóa đơn + thanh toán của tài khoản{" "}
                <code className="font-mono">{me?.email}</code>
              </p>
            </div>
          </div>
          {openPersonal ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openPersonal && (
          <div className="p-5 space-y-5">
            {isLoading ? (
              <p className="text-ink-400 text-sm">Đang tải...</p>
            ) : (
              <PersonalBillingBody
                data={data}
                onCancel={(id) => {
                  if (confirm("Hủy subscription? Bạn vẫn dùng được tới hết chu kỳ hiện tại.")) {
                    cancel.mutate(id);
                  }
                }}
                onCancelPending={(id) => {
                  if (confirm("Hủy đơn pending này?")) cancel.mutate(id);
                }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Personal billing body (extracted from old page) ───────────────────────

function PersonalBillingBody({
  data, onCancel, onCancelPending,
}: {
  data: Summary | undefined;
  onCancel: (id: string) => void;
  onCancelPending: (id: string) => void;
}) {
  return (
    <>
      <CurrentSubscriptionCard sub={data?.current_subscription} onCancel={onCancel} />

      {data?.pending_subscriptions && data.pending_subscriptions.length > 0 && (
        <section className="rounded-md ring-1 ring-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h3 className="font-semibold text-ink-100 flex items-center gap-2">
            <Clock size={16} className="text-amber-600" /> Đơn chờ xử lý
          </h3>
          <p className="text-xs text-ink-300">
            Đơn đã đặt nhưng chưa thanh toán. Hoàn tất chuyển khoản, admin sẽ kích hoạt trong 1h.
          </p>
          <div className="divide-y divide-amber-200">
            {data.pending_subscriptions.map((s) => (
              <PendingRow key={s.id} sub={s} onCancel={onCancelPending} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <DataCard title="Hóa đơn gần đây" icon={FileText}>
          {data?.recent_invoices?.length === 0 ? (
            <p className="text-sm text-ink-400 italic px-3 py-6 text-center">
              Chưa có hóa đơn nào.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-900 text-left text-ink-300 text-xs">
                <tr>
                  <th className="px-3 py-2">Mã HĐ</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {data?.recent_invoices?.map((i) => (
                  <tr key={i.id} className="hover:bg-ink-900">
                    <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-3 py-2 text-ink-300 text-xs">{formatDate(i.issued_at ?? i.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(i.total)}</td>
                    <td className="px-3 py-2"><StatusPill status={i.status} /></td>
                    <td className="px-3 py-2">
                      {i.pdf_url && (
                        <a href={i.pdf_url} className="text-violet-600 hover:underline text-xs inline-flex items-center gap-1">
                          <Download size={12} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>

        <DataCard title="Lịch sử thanh toán" icon={Wallet}>
          {data?.recent_payments?.length === 0 ? (
            <p className="text-sm text-ink-400 italic px-3 py-6 text-center">
              Chưa có thanh toán nào.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-900 text-left text-ink-300 text-xs">
                <tr>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {data?.recent_payments?.map((p) => (
                  <tr key={p.id} className="hover:bg-ink-900">
                    <td className="px-3 py-2 text-ink-300 text-xs">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(p.amount)}</td>
                    <td className="px-3 py-2 capitalize text-xs">{p.provider}</td>
                    <td className="px-3 py-2"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>
      </div>
    </>
  );
}

function DataCard({
  title, icon: Icon, children,
}: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg ring-1 ring-ink-800 bg-ink-900 overflow-hidden">
      <h3 className="px-4 py-2.5 border-b border-ink-800 bg-ink-900 font-semibold text-ink-100 text-sm flex items-center gap-2">
        <Icon size={14} /> {title}
      </h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub, onCancel,
}: { sub: Subscription | null | undefined; onCancel: (id: string) => void }) {
  if (!sub) {
    return (
      <div className="rounded-lg ring-1 ring-ink-800 bg-gradient-to-br from-slate-50 to-white p-5">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-ink-100">
          <AlertCircle size={16} className="text-ink-500" /> Chưa có subscription
        </h3>
        <p className="text-sm text-ink-300 mb-3">
          Bạn đang dùng <strong>Free plan</strong>. Nâng cấp để mở khóa video, image-to-X, API public,
          quota cao hơn và nhiều hơn nữa.
        </p>
        <Link to="/pricing" className="btn-primary inline-block">Xem các gói</Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg ring-1 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-ink-100">
            <CheckCircle2 size={16} className="text-emerald-600" /> Subscription hiện tại
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-white">{sub.plan_name}</span>
            <StatusPill status={sub.status} />
          </div>
          <p className="text-sm text-ink-300 mt-1">
            <strong className="text-emerald-700">{formatVnd(sub.amount)}</strong>{" "}
            / {sub.billing_cycle === "yearly" ? "năm" : "tháng"}
          </p>
        </div>
        {!sub.cancel_at_period_end && (
          <button
            onClick={() => onCancel(sub.id)}
            className="btn-ghost text-rose-600 text-sm"
            title="Hủy subscription"
          >
            <X size={14} className="inline mr-1" /> Hủy
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-emerald-200 pt-3">
        <Field label="Bắt đầu chu kỳ" value={formatDate(sub.current_period_start)} />
        <Field label="Hết chu kỳ" value={formatDate(sub.current_period_end)} />
        <Field label="Provider" value={sub.provider} mono />
      </div>

      {sub.cancel_at_period_end && (
        <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ Bạn đã yêu cầu hủy. Subscription kết thúc vào {formatDate(sub.current_period_end)} — sau đó về Free plan.
        </div>
      )}
    </div>
  );
}

function PendingRow({ sub, onCancel }: { sub: Subscription; onCancel: (id: string) => void }) {
  return (
    <div className="py-2 flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="font-medium text-sm">{sub.plan_name} · {sub.billing_cycle}</div>
        <div className="text-xs text-ink-400 font-mono">{sub.id.slice(0, 8)}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold">{formatVnd(sub.amount)}</div>
        <div className="text-xs text-ink-400">{formatDate(sub.created_at)}</div>
      </div>
      <button
        onClick={() => onCancel(sub.id)}
        className="btn-ghost text-rose-600 text-xs"
      >
        Hủy đơn
      </button>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

// ─── Help / docs modal ─────────────────────────────────────────────────────

function BillingHelpModal({ onClose, isSuper }: { onClose: () => void; isSuper: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-lg bg-ink-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3 bg-gradient-to-r from-emerald-50 to-cyan-50">
          <h2 className="font-semibold flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-700" />
            Hướng dẫn Billing — luồng gói & thanh toán
          </h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-300"><X size={18} /></button>
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
            <p className="text-xs text-ink-400 mt-2">
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
              <FlowStep label="cancelled / expired" color="bg-ink-800 text-ink-200">
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
}: { n: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold text-ink-100 mb-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">
          {n}
        </span>
        <Icon size={14} className="text-ink-400" />
        {title}
      </h3>
      <div className="pl-8 text-ink-200">{children}</div>
    </section>
  );
}

function PlanCard({
  name, price, items, color,
}: { name: string; price: string; items: string[]; color: "slate" | "cyan" | "violet" | "amber" }) {
  const cls = {
    slate:  { ring: "ring-ink-800",  bg: "bg-ink-900",   text: "text-ink-200"  },
    cyan:   { ring: "ring-cyan-200",   bg: "bg-cyan-50",    text: "text-cyan-700"   },
    violet: { ring: "ring-violet-200", bg: "bg-violet-50",  text: "text-violet-700" },
    amber:  { ring: "ring-amber-200",  bg: "bg-amber-50",   text: "text-amber-700"  },
  }[color];
  return (
    <div className={`rounded-md ${cls.bg} ring-1 ${cls.ring} p-2.5`}>
      <div className={`font-semibold ${cls.text}`}>{name}</div>
      <div className="text-[11px] text-ink-300 mt-0.5">{price}</div>
      <ul className="mt-1.5 text-[11px] text-ink-200 space-y-0.5">
        {items.map((it) => <li key={it}>• {it}</li>)}
      </ul>
    </div>
  );
}

function FlowStep({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium flex-shrink-0 ${color}`}>{label}</span>
      <ArrowRight size={12} className="text-ink-500 mt-1 flex-shrink-0" />
      <span className="text-ink-300">{children}</span>
    </div>
  );
}
