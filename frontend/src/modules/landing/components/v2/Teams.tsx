import { useTranslation } from "react-i18next";
import { ChevronDown, Copy, MoreHorizontal, Send, X } from "lucide-react";

export function Teams() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Avatars decoration only at md+ — on phones the cards stack
         *  full-width and the avatars would just overlap them. */}
        <div className="relative mx-auto h-auto max-w-4xl md:h-[460px]">
          <Avatar src="https://i.pravatar.cc/120?img=47" className="absolute left-[4%] top-[6%] hidden h-12 w-12 md:block lg:h-14 lg:w-14" />
          <Avatar src="https://i.pravatar.cc/120?img=12" className="absolute right-[10%] top-[2%] hidden h-10 w-10 md:block lg:h-12 lg:w-12" />
          <Avatar src="https://i.pravatar.cc/120?img=23" className="absolute left-[10%] top-[42%] hidden h-16 w-16 md:block lg:h-20 lg:w-20" />
          <Avatar src="https://i.pravatar.cc/120?img=33" className="absolute right-[2%] top-[34%] hidden h-16 w-16 md:block lg:h-20 lg:w-20" />
          <Avatar src="https://i.pravatar.cc/120?img=49" className="absolute left-[2%] bottom-[18%] hidden h-12 w-12 md:block lg:h-14 lg:w-14" />
          <Avatar src="https://i.pravatar.cc/120?img=58" className="absolute right-[18%] bottom-[6%] hidden h-10 w-10 md:block lg:h-12 lg:w-12" />

          {/* Cards: normal block flow on mobile, absolute-centered on md+. */}
          <div className="grid grid-cols-1 gap-4 md:absolute md:left-1/2 md:top-1/2 md:w-[min(95%,720px)] md:-translate-x-1/2 md:-translate-y-1/2 md:grid-cols-2">
            <InviteCard />
            <CommentsCard />
          </div>
        </div>

        <div className="mt-10 text-center sm:mt-12">
          <h2 className="text-2xl font-bold text-slate-800 sm:text-3xl md:text-4xl">
            {t("landing_v2.teams_title")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:text-base">
            {t("landing_v2.teams_subtitle")}
          </p>
          <button className="mt-6 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
            {t("landing_v2.teams_get_started")}
          </button>
        </div>
      </div>
    </section>
  );
}

function Avatar({ src, className = "" }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      className={`rounded-full object-cover shadow-md ring-4 ring-white ${className}`}
    />
  );
}

function InviteCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-blue-600">Design Team</p>
        <button className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
      <h4 className="mt-1 text-sm font-semibold text-slate-800">Invite Team members</h4>
      <p className="mt-0.5 text-[11px] text-slate-400">See members list & all access</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
          placeholder="johndoe@example.com"
        />
        <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Send Invite</button>
      </div>
      <p className="mt-4 text-[11px] font-medium text-slate-500">Members Added (3)</p>
      <ul className="mt-2 space-y-2">
        {[
          { name: "Kathy Miller", role: "Owner", img: 5 },
          { name: "Thomas Jackson", role: "Member", img: 12 },
          { name: "Alexandria Demarco", role: "Member", img: 23 },
        ].map((m) => (
          <li key={m.name} className="flex items-center gap-2">
            <img src={`https://i.pravatar.cc/40?img=${m.img}`} alt="" className="h-6 w-6 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-800">{m.name}</div>
              <div className="truncate text-[10px] text-slate-400">{m.name.toLowerCase().replace(/\s+/g, ".") + "@example.com"}</div>
            </div>
            <button className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
              {m.role} <ChevronDown size={10} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
        <span className="flex-1 truncate text-[11px] text-slate-500">https://www.sharemylink.com</span>
        <button className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
          <Copy size={10} /> Copy
        </button>
        <MoreHorizontal size={12} className="text-slate-400" />
      </div>
    </div>
  );
}

function CommentsCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-2xl">
      <div className="flex items-center gap-2">
        <button className="text-slate-400"><ChevronDown className="rotate-90" size={14} /></button>
        <h4 className="text-sm font-semibold text-slate-800">Comments</h4>
      </div>
      <ul className="mt-3 space-y-3">
        {[18, 23].map((img, i) => (
          <li key={i} className="flex gap-2">
            <img src={`https://i.pravatar.cc/40?img=${img}`} alt="" className="h-7 w-7 rounded-full object-cover" />
            <div>
              <div className="text-[11px] font-medium text-slate-800">
                {i === 0 ? "nino" : "amira"} <span className="text-[10px] text-slate-400">{i === 0 ? "2 mins" : "5 mins"}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Lorem ipsum dolor sit amet, consectur adipiscing elit ut aliquam, purus sit amet luctus.
              </p>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                <span>15 Like</span><span>6 Replies</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button className="mt-2 text-[11px] font-medium text-blue-600">View all 124 comments ▾</button>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
        <input className="flex-1 bg-transparent text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none" placeholder="Start typing…" />
        <button className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-white">
          <Send size={10} />
        </button>
      </div>
    </div>
  );
}
