import type { ReactNode } from "react";
import type { ProfileContent } from "@/lib/profiles/types";

/**
 * The client-facing profile, laid out like our current Enosis resource profile PDF.
 * Shared by the admin preview, the reviewer page (phase 6), and the in-app PDF export (phase 7).
 */

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 mb-3 border-b-2 border-brand pb-1 text-[13px] font-bold tracking-[0.12em] text-brand uppercase">{children}</h2>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-5" style={{ listStyleType: "square" }}>
      {items.map((t, i) => (
        <li key={i} className="pl-1 marker:text-brand">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Footer() {
  return <div className="mt-10 border-t border-slate-200 pt-3 text-center text-[11px] tracking-wide text-slate-500">www.enosisbd.com</div>;
}

export function ProfileDocument({ content }: { content: ProfileContent }) {
  const c = content;
  return (
    <article className="mx-auto max-w-[820px] bg-white px-10 py-10 text-[14px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-14">
      <header>
        <h1 className="text-[28px] font-bold tracking-wide text-slate-900 uppercase">{c.name}</h1>
        <p className="mt-0.5 text-[15px] font-medium text-brand">{c.title}</p>
      </header>

      <SectionTitle>Career Summary</SectionTitle>
      <p>{c.careerSummary}</p>

      {c.coreCompetencies.length > 0 && (
        <>
          <SectionTitle>Core Competency</SectionTitle>
          <Bullets items={c.coreCompetencies} />
        </>
      )}

      {c.technicalExpertise.length > 0 && (
        <>
          <SectionTitle>Technical Expertise</SectionTitle>
          <table className="w-full border-collapse text-[13.5px]">
            <tbody>
              {c.technicalExpertise.map((row) => (
                <tr key={row.category} className="border-b border-slate-100 last:border-0">
                  <th className="w-44 py-1.5 pr-4 text-left align-top font-semibold text-slate-700">{row.category}</th>
                  <td className="py-1.5">{row.items.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {c.education.length > 0 && (
        <>
          <SectionTitle>Education</SectionTitle>
          <div className="space-y-2">
            {c.education.map((e, i) => (
              <div key={i}>
                <p className="font-semibold text-slate-900">{e.degree}</p>
                <p className="text-slate-600">
                  {e.institution}
                  {e.year && ` · ${e.year}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {c.awardsAndCertifications.length > 0 && (
        <>
          <SectionTitle>Awards &amp; Certifications</SectionTitle>
          <Bullets items={c.awardsAndCertifications} />
        </>
      )}

      {c.projects.length > 0 && (
        <>
          <SectionTitle>Project Engagements</SectionTitle>
          <div className="space-y-7">
            {c.projects.map((p, i) => (
              <section key={i} className="break-inside-avoid">
                <h3 className="text-[14.5px] font-bold tracking-wide text-slate-900 uppercase">{p.title}</h3>
                {p.industry && (
                  <p className="mt-1 text-[13px]">
                    <span className="font-semibold text-slate-700">Industry:</span> {p.industry}
                  </p>
                )}
                <p className="mt-1.5">{p.description}</p>
                {p.coreTechnologies.length > 0 && (
                  <p className="mt-1.5 text-[13px]">
                    <span className="font-semibold text-slate-700">Core Technologies:</span> {p.coreTechnologies.join(", ")}
                  </p>
                )}
                {p.contributions.length > 0 && (
                  <>
                    <p className="mt-2 mb-1 text-[13px] font-semibold text-slate-700">Major Contributions:</p>
                    <Bullets items={p.contributions} />
                  </>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      <Footer />
    </article>
  );
}
