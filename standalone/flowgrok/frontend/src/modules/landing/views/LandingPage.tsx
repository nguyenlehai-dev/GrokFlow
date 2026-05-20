/**
 * Public landing — fintech-style v2 (light theme, blue accents).
 *
 * Single long page composed from v2/ components matching the Figma
 * reference: TopBar → Hero (with billing mockup) → TrustedBy →
 * FeatureTrio → Analytics → Teams → Pricing → Newsletter → Footer.
 *
 * The legacy Spotify-style components still sit under components/ and
 * are no longer referenced — keep around for A/B comparison; drop them
 * after design sign-off.
 */
import { useDomainStore } from "@/core/domain/store";

import { TopBar } from "../components/v2/TopBar";
import { Hero } from "../components/v2/Hero";
import { TrustedBy } from "../components/v2/TrustedBy";
import { FeatureTrio } from "../components/v2/FeatureTrio";
import { Analytics } from "../components/v2/Analytics";
import { Teams } from "../components/v2/Teams";
import { Pricing } from "../components/v2/Pricing";
import { Newsletter } from "../components/v2/Newsletter";
import { Footer } from "../components/v2/Footer";

export function LandingPage() {
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "Nexoratech";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <TopBar brandName={brandName} />
      <main>
        <Hero />
        <TrustedBy />
        <FeatureTrio />
        <Analytics />
        <Teams />
        <Pricing />
        <Newsletter />
      </main>
      <Footer brandName={brandName} />
    </div>
  );
}
