import { useState } from "react";
import { ChevronDown, ChevronUp, Zap, DollarSign, Shield, MessageSquare, HelpCircle, Star } from "lucide-react";

const Section = ({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-sm ${color} hover:opacity-90 transition-opacity`}
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="bg-gray-900 px-4 py-3 text-sm text-gray-200 space-y-2">{children}</div>}
    </div>
  );
};

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2">
    <span className="text-yellow-400 mt-0.5 shrink-0">•</span>
    <span>{children}</span>
  </div>
);

const ObjRow = ({ objection, response }: { objection: string; response: string }) => (
  <div className="border border-gray-700 rounded p-3 space-y-1">
    <div className="text-red-400 italic text-xs">"{objection}"</div>
    <div className="text-green-400 text-xs">{response}</div>
  </div>
);

const Question = ({
  num,
  label,
  question,
  answer,
  punchline,
}: {
  num: string;
  label: string;
  question: string;
  answer: string;
  punchline: string;
}) => (
  <div className="border border-gray-700 rounded p-3 space-y-1">
    <div className="text-yellow-400 font-bold text-xs uppercase tracking-wide">
      {num} — {label}
    </div>
    <div className="text-white font-semibold text-xs italic">"{question}"</div>
    <div className="text-gray-400 text-xs">Their answer: {answer}</div>
    <div className="text-yellow-300 text-xs font-medium">{punchline}</div>
  </div>
);

export default function SalesCheatSheet() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-yellow-600/40 rounded-xl overflow-hidden bg-gray-950">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
          <Star className="w-4 h-4" />
          Sales Cheat Sheet — Rental Inventory Package
        </span>
        <span className="text-gray-400 text-xs flex items-center gap-1">
          {expanded ? "Hide" : "Show"}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">

          {/* Core Pitch */}
          <Section icon={<Zap className="w-4 h-4" />} title="Core Pitch" color="bg-blue-900 text-blue-100">
            <Bullet><strong className="text-yellow-300">True ownership</strong> — you own the letters, the brand, the business. Forever.</Bullet>
            <Bullet><strong className="text-yellow-300">Your brand name</strong> — every event builds YOUR equity, not a licensor's.</Bullet>
            <Bullet><strong className="text-yellow-300">Zero annual fees</strong> — pay once, keep 100% of every dollar you earn.</Bullet>
            <Bullet><strong className="text-yellow-300">No supplier lock-in</strong> — buy from anyone, add any product, no permission needed.</Bullet>
            <Bullet><strong className="text-yellow-300">Commercial-grade steel</strong> — powder-coated, closed-back, self-standing, built for 50+ events/year.</Bullet>
            <Bullet><strong className="text-yellow-300">15-year overseas partnership</strong> — production priority, quality consistency, proven supply chain.</Bullet>
          </Section>

          {/* The Numbers */}
          <Section icon={<DollarSign className="w-4 h-4" />} title="The Numbers" color="bg-green-900 text-green-100">
            <Bullet>Packages from <strong className="text-green-300">$12,600 (25 pc)</strong> to <strong className="text-green-300">$47,950 (175 pc)</strong> — all-in, delivered.</Bullet>
            <Bullet>Rental rate: <strong className="text-green-300">$75–$125/letter</strong> per event. Word packages: <strong className="text-green-300">$600–$1,500</strong>.</Bullet>
            <Bullet>Example: "MR & MRS" + delivery = <strong className="text-green-300">$500–$700</strong> per booking.</Bullet>
            <Bullet>Break-even: typically <strong className="text-green-300">within 12 months</strong> for active operators (112 pc ELITE).</Bullet>
            <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
              <div className="text-yellow-400 font-semibold text-xs uppercase tracking-wide">Speed & Financing Tools</div>
              <Bullet><strong className="text-yellow-300">Air Freight Bridge</strong> — $500 gets 4–5 letters in 4–6 weeks. Start booking now.</Bullet>
              <Bullet><strong className="text-yellow-300">Shop Pay Installments</strong> — split into monthly payments. Business pays for itself.</Bullet>
              <Bullet><strong className="text-yellow-300">3% Full-Pay Discount</strong> — saves $1,000+ on the 112-piece package.</Bullet>
            </div>
          </Section>

          {/* Objection Crushers */}
          <Section icon={<Shield className="w-4 h-4" />} title="Objection Crushers" color="bg-red-900 text-red-100">
            <ObjRow
              objection="Alpha-Lit gives me instant brand credibility."
              response="You're building their brand. When you leave, you keep nothing — no name, no website, no reviews. With VML, every event builds yours. Permanently."
            />
            <ObjRow
              objection="Their letters are the same quality as yours."
              response="Alpha-Lit locks all licensees into one designated manufacturer — no alternatives allowed. Our production is superior: powder-coated steel, commercial-grade, closed backs, flat bottoms."
            />
            <ObjRow
              objection="I can't wait 4 months for letters to arrive."
              response="You don't have to. $500 gets you 4–5 letters via air freight in 4–6 weeks. You'll be booking events and collecting deposits before the full fleet even lands."
            />
            <ObjRow
              objection="I don't have $34,800 in cash right now."
              response="You don't need it all at once. Shop Pay splits it into monthly installments. Two events can cover the payment. The business pays for itself."
            />
            <ObjRow
              objection="License programs offer more support."
              response="Alpha-Lit's own website says they're 'not franchise-level support.' You're a self-starter either way — but with VML, you own everything you build and pay no annual fee for the privilege."
            />
          </Section>

          {/* 3 Questions */}
          <Section icon={<HelpCircle className="w-4 h-4" />} title="3 Questions That Change Everything" color="bg-purple-900 text-purple-100">
            <div className="text-gray-400 text-xs italic mb-3">
              "Before we talk about VML, I want to make sure you've asked the right questions of anyone else you're evaluating. May I share three things most people don't think to ask?"
            </div>
            <Question
              num="1"
              label="The Exit Question"
              question="When you leave their program in 3 years, what do you keep?"
              answer="Nothing. You lose the brand name, the website, and every Google review and SEO ranking you built."
              punchline="You spent years building their business. You walk away with zero equity."
            />
            <Question
              num="2"
              label="The Supplier Question"
              question="Can you buy letters from a different supplier if you find better pricing or quality?"
              answer="No. All locations must use the same single designated manufacturer. No alternatives. Ever."
              punchline="You can never shop around. They control your costs forever."
            />
            <Question
              num="3"
              label="The Fee Question"
              question="What do you owe them every year after your initial investment?"
              answer="An annual licensing fee — every year, indefinitely, even after the initial investment is fully recouped."
              punchline="The fee never stops. You're renting your own business."
            />
          </Section>

          {/* The Close */}
          <Section icon={<MessageSquare className="w-4 h-4" />} title="The Close — Say This" color="bg-yellow-800 text-yellow-100">
            <div className="bg-gray-800 border border-yellow-600/40 rounded p-3 text-yellow-200 italic text-sm font-medium">
              "No annual fees. No approved supplier list. No permission required to grow. The only question is — what do you want to name your company?"
            </div>
            <div className="mt-3 space-y-2">
              <Bullet><strong className="text-yellow-300">"What do you want to name your company?"</strong> is a trial close. Gets them thinking as an owner, not a buyer.</Bullet>
              <Bullet>You are not selling letters. You are selling <strong className="text-yellow-300">the only path to true ownership</strong> in this industry.</Bullet>
              <Bullet>If they hesitate: go back to the <strong className="text-yellow-300">Air Freight Bridge</strong> or <strong className="text-yellow-300">Shop Pay</strong>. Every barrier has a bridge.</Bullet>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
