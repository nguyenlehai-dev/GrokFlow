import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface State {
  error: Error | null;
}

/** Per-panel error boundary — cô lập sự cố trong 1 tool panel để các
 *  panel khác (sidebar tools list, topbar quota pill, ...) vẫn render
 *  bình thường. Trước đó nếu 1 panel throw → cả CVP page trắng + chỉ
 *  thấy error trong DevTools console.
 *
 *  UI hiển thị error message + nút "Thử lại" reset boundary. Log đầy
 *  đủ stack ra console cho dev debug. Không gửi telemetry — boundary
 *  là local UX patch, không phải reporting layer. */
export class PanelErrorBoundary extends Component<{ name: string; children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console log nguyên gốc để debug — không silence
    console.error(`[panel:${this.props.name}] crashed:`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="cvp-card p-6 max-w-2xl mx-auto mt-8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 grid place-items-center shrink-0">
            <AlertTriangle size={20} className="text-rose-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-rose-200">
              Panel "{this.props.name}" gặp lỗi
            </h3>
            <p className="text-xs text-slate-400 mt-1 break-words">
              {this.state.error.message || "Unknown error"}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              Các panel khác vẫn dùng được. Bấm "Thử lại" để render lại panel này.
              Nếu lỗi tiếp tục, gửi screenshot DevTools Console (F12) cho admin.
            </p>
            <button
              onClick={this.reset}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 ring-1 ring-cyan-400/30 text-cyan-200 text-xs"
            >
              <RotateCcw size={12} /> Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }
}
