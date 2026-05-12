import { useState } from "react";
import { useParams, useSearchParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CreditCard, Building2, Wallet, Smartphone, Globe, Info } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_vnd: number | null;
}

interface CheckoutResp {
  subscription_id: string;
  payment_id: string;
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  payment_url: string | null;
  instructions: string;
}

const PROVIDERS = [
  { code: "manual", label: "Chuyển khoản ngân hàng", icon: Building2, hint: "Admin xác nhận thủ công" },
  { code: "momo", label: "MoMo", icon: Wallet, hint: "Sắp ra mắt", disabled: true },
  { code: "vnpay", label: "VNPay", icon: CreditCard, hint: "Sắp ra mắt", disabled: true },
  { code: "zalopay", label: "ZaloPay", icon: Smartphone, hint: "Sắp ra mắt", disabled: true },
  { code: "stripe", label: "Stripe (Quốc tế)", icon: Globe, hint: "Sắp ra mắt", disabled: true },
];

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n) + "₫";

export function CheckoutPage() {
  const { plan_code } = useParams<{ plan_code: string }>();
  const [params] = useSearchParams();
  const cycle = (params.get("cycle") === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";
  const [provider, setProvider] = useState("manual");
  const [result, setResult] = useState<CheckoutResp | null>(null);
  const { register, handleSubmit } = useForm<{
    name: string;
    company: string;
    tax_code: string;
    address: string;
  }>();

  const { data: plans } = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => (await api.get<PublicPlan[]>("/api/plans/public")).data,
  });
  const plan = plans?.find((p) => p.code === plan_code);

  const checkout = useMutation({
    mutationFn: async (billing_info: any) =>
      (await api.post<CheckoutResp>("/api/billing/checkout", {
        plan_code,
        billing_cycle: cycle,
        provider,
        billing_info,
      })).data,
    onSuccess: (data) => {
      setResult(data);
      if (data.payment_url) {
        // Real provider: redirect to payment gateway
        window.location.href = data.payment_url;
      } else {
        toast("Đã tạo đơn hàng. Hoàn tất thanh toán theo hướng dẫn.", "success");
      }
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Tạo đơn lỗi", "error");
    },
  });

  if (!plan_code) return <Navigate to="/pricing" replace />;
  if (!plans) return <p className="text-slate-500">Đang tải...</p>;
  if (!plan) return <Navigate to="/pricing" replace />;
  if (plan.price_vnd === null || plan.price_vnd === 0) return <Navigate to="/pricing" replace />;

  const amount = cycle === "yearly" ? plan.price_vnd * 10 : plan.price_vnd;

  // Success state — show payment instructions
  if (result) {
    return <CheckoutSuccess result={result} planName={plan.name} cycle={cycle} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Hoàn tất thanh toán</h1>
        <p className="text-sm text-slate-500 mt-1">
          Bạn đang mua gói <strong>{plan.name}</strong> ({cycle === "yearly" ? "hàng năm" : "hàng tháng"}).
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Order summary */}
        <div className="md:col-span-1">
          <div className="card sticky top-4">
            <h2 className="font-semibold mb-2">Tóm tắt đơn hàng</h2>
            <div className="space-y-2 text-sm">
              <Row label="Gói" value={plan.name} />
              <Row label="Chu kỳ" value={cycle === "yearly" ? "Hàng năm (tiết kiệm 17%)" : "Hàng tháng"} />
              <Row label="Giá" value={formatVnd(plan.price_vnd ?? 0)} sub={cycle === "yearly" ? "× 10 tháng" : "× 1 tháng"} />
              <hr className="my-2" />
              <Row label="Tạm tính" value={formatVnd(amount)} />
              <Row label="VAT (đã bao gồm)" value="0₫" />
              <hr className="my-2" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Tổng cộng</span>
                <span className="text-xl font-bold text-brand-600">{formatVnd(amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((v) => checkout.mutate(v))}
          className="md:col-span-2 space-y-4"
        >
          {/* Payment method */}
          <section className="card space-y-2">
            <h2 className="font-semibold">Phương thức thanh toán</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.code}
                    type="button"
                    disabled={p.disabled}
                    onClick={() => !p.disabled && setProvider(p.code)}
                    className={`text-left border rounded-md px-3 py-3 transition flex items-start gap-3 ${
                      provider === p.code
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:border-slate-300"
                    } ${p.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon size={18} className="text-slate-700 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-slate-500">{p.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Billing info (optional) */}
          <section className="card space-y-3">
            <h2 className="font-semibold">Thông tin hóa đơn (tùy chọn)</h2>
            <p className="text-xs text-slate-500">
              Điền nếu cần xuất hóa đơn cho doanh nghiệp.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Tên / Họ tên</label>
                <input className="input" {...register("name")} />
              </div>
              <div>
                <label className="text-sm font-medium">Công ty</label>
                <input className="input" {...register("company")} />
              </div>
              <div>
                <label className="text-sm font-medium">MST</label>
                <input className="input" placeholder="0123456789" {...register("tax_code")} />
              </div>
              <div>
                <label className="text-sm font-medium">Địa chỉ</label>
                <input className="input" {...register("address")} />
              </div>
            </div>
          </section>

          <div className="flex items-center gap-3 justify-end">
            <Link to="/pricing" className="btn-ghost">Quay lại</Link>
            <button
              type="submit"
              disabled={checkout.isPending}
              className="btn-primary px-6"
            >
              {checkout.isPending ? "Đang xử lý..." : `Thanh toán ${formatVnd(amount)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CheckoutSuccess({
  result, planName, cycle,
}: { result: CheckoutResp; planName: string; cycle: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Đơn hàng đã ghi nhận</h2>
            <p className="text-sm text-slate-600">
              Hóa đơn <span className="font-mono font-semibold">{result.invoice_number}</span> ·{" "}
              {planName} ({cycle})
            </p>
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">Hướng dẫn thanh toán:</p>
          <p className="whitespace-pre-line">{result.instructions}</p>
        </div>

        <div className="rounded-md border border-slate-200 p-3 space-y-1 text-sm">
          <div className="font-semibold mb-1">Thông tin chuyển khoản:</div>
          <div>Ngân hàng: <strong>Vietcombank</strong></div>
          <div>Số TK: <strong>1234567890</strong></div>
          <div>Chủ TK: <strong>NGUYEN LE HAI</strong></div>
          <div>
            Nội dung CK: <span className="font-mono font-bold text-rose-600">{result.invoice_number}</span>
          </div>
          <div className="pt-1 text-slate-600">
            Số tiền: <strong>{new Intl.NumberFormat("vi-VN").format(Number(result.amount))}₫</strong>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Link to="/billing" className="btn-primary">Xem trang Billing</Link>
          <Link to="/dashboard" className="btn-ghost">Về Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-slate-600">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      <div className="text-slate-900 font-medium text-right">{value}</div>
    </div>
  );
}
