import type { ReactNode } from "react";
import type { ProfileContent } from "@/lib/profiles/types";

/**
 * The client-facing profile, laid out like our current Enosis resource profile PDF.
 * Shared by the admin preview, the reviewer page, and the in-app PDF export (phase 7).
 *
 * `wrap` lets the reviewer page put each section (keys from lib/profiles/sections) inside its own
 * controls; `hl` lets it highlight quoted text. Both default to rendering the plain document.
 */
type Props = {
  content: ProfileContent;
  wrap?: (key: string, node: ReactNode) => ReactNode;
  hl?: (text: string) => ReactNode;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 mb-3 border-b-2 border-brand pb-1 text-[13px] font-bold tracking-[0.12em] text-brand uppercase">{children}</h2>;
}

function Bullets({ items, hl }: { items: string[]; hl: (t: string) => ReactNode }) {
  return (
    <ul className="space-y-1.5 pl-5" style={{ listStyleType: "square" }}>
      {items.map((t, i) => (
        <li key={i} className="pl-1 marker:text-brand">
          {hl(t)}
        </li>
      ))}
    </ul>
  );
}

const plain = (t: string) => t;
const noWrap = (_key: string, node: ReactNode) => node;

export function ProfileDocument({ content: c, wrap = noWrap, hl = plain }: Props) {
  return (
    <article className="mx-auto max-w-[820px] bg-white px-6 py-8 text-[14px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200 sm:px-14 sm:py-10">
      {wrap(
        "header",
        <header>
          <h1 className="text-[24px] font-bold tracking-wide text-slate-900 uppercase sm:text-[28px]">{hl(c.name)}</h1>
          <p className="mt-0.5 text-[15px] font-medium text-brand">{hl(c.title)}</p>
        </header>,
      )}

      {wrap(
        "summary",
        <>
          <SectionTitle>Career Summary</SectionTitle>
          <p>{hl(c.careerSummary)}</p>
        </>,
      )}

      {c.coreCompetencies.length > 0 &&
        wrap(
          "competencies",
          <>
            <SectionTitle>Core Competency</SectionTitle>
            <Bullets items={c.coreCompetencies} hl={hl} />
          </>,
        )}

      {c.technicalExpertise.length > 0 &&
        wrap(
          "expertise",
          <>
            <SectionTitle>Technical Expertise</SectionTitle>
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>
                {c.technicalExpertise.map((row) => (
                  <tr key={row.category} className="border-b border-slate-100 last:border-0">
                    <th className="w-36 py-1.5 pr-4 text-left align-top font-semibold text-slate-700 sm:w-44">{row.category}</th>
                    <td className="py-1.5">{hl(row.items.join(", "))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>,
        )}

      {c.education.length > 0 &&
        wrap(
          "education",
          <>
            <SectionTitle>Education</SectionTitle>
            <div className="space-y-2">
              {c.education.map((e, i) => (
                <div key={i}>
                  <p className="font-semibold text-slate-900">{hl(e.degree)}</p>
                  <p className="text-slate-600">
                    {hl(e.institution)}
                    {e.year && ` · ${e.year}`}
                  </p>
                </div>
              ))}
            </div>
          </>,
        )}

      {c.awardsAndCertifications.length > 0 &&
        wrap(
          "awards",
          <>
            <SectionTitle>Awards &amp; Certifications</SectionTitle>
            <Bullets items={c.awardsAndCertifications} hl={hl} />
          </>,
        )}

      {c.projects.length > 0 && (
        <>
          <SectionTitle>Project Engagements</SectionTitle>
          <div className="space-y-7">
            {c.projects.map((p, i) => (
              <div key={i}>
                {wrap(
                  `project:${i}`,
                  <section className="break-inside-avoid">
                    <h3 className="text-[14.5px] font-bold tracking-wide text-slate-900 uppercase">{hl(p.title)}</h3>
                    {p.industry && (
                      <p className="mt-1 text-[13px]">
                        <span className="font-semibold text-slate-700">Industry:</span> {hl(p.industry)}
                      </p>
                    )}
                    <p className="mt-1.5">{hl(p.description)}</p>
                    {p.coreTechnologies.length > 0 && (
                      <p className="mt-1.5 text-[13px]">
                        <span className="font-semibold text-slate-700">Core Technologies:</span> {hl(p.coreTechnologies.join(", "))}
                      </p>
                    )}
                    {p.contributions.length > 0 && (
                      <>
                        <p className="mt-2 mb-1 text-[13px] font-semibold text-slate-700">Major Contributions:</p>
                        <Bullets items={p.contributions} hl={hl} />
                      </>
                    )}
                  </section>,
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-10 border-t border-slate-200 pt-3 text-center text-[11px] tracking-wide text-slate-500">www.enosisbd.com</div>
    </article>
  );
}
