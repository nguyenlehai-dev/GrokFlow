// Mobile-only brand badge shown above auth forms when the left art panel
// is hidden. Login + Register both render this identically.
export function AuthBrandHeader({ brandName }: { brandName: string }) {
  return (
    <div className="lg:hidden text-center space-y-2">
      <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-brand text-white items-center justify-center font-bold text-xl shadow-brand">
        {brandName[0]}
      </div>
      <h1 className="font-bold text-xl text-slate-900">{brandName}</h1>
    </div>
  );
}
