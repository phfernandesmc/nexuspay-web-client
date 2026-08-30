import LandingHeader from "@/features/landing/LandingHeader";
import LandingHero from "@/features/landing/LandingHero";
import LandingArchitecture from "@/features/landing/LandingArchitecture";
import LandingSecurity from "@/features/landing/LandingSecurity";
import LandingStack from "@/features/landing/LandingStack";
import LandingFooter from "@/features/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingArchitecture />
        <LandingSecurity />
        <LandingStack />
      </main>
      <LandingFooter />
    </div>
  );
}
