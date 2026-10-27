import { reportSections } from "@/lib/reports/presentation";
import type { ReportDetail } from "@/lib/reports/contracts";
export function ReportDocument({ report }: { report: ReportDetail }) {
  return (
    <article aria-label="Saved report" className="min-w-0 space-y-5">
      {reportSections(report).map((section) => (
        <section
          key={section.title}
          aria-label={section.title}
          className="min-w-0 rounded-2xl border bg-card p-5 sm:p-7"
        >
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.note && (
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {section.note}
            </p>
          )}
          {section.paragraphs?.map((p, i) => (
            <p
              key={i}
              className="mt-3 whitespace-pre-wrap break-words text-sm leading-7"
            >
              {p}
            </p>
          ))}
          {section.columns && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{section.title}</caption>
                <thead>
                  <tr>
                    {section.columns.map((col) => (
                      <th key={col} className="border-b px-3 py-3 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows?.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="max-w-72 break-words border-b px-3 py-3 align-top leading-6 tabular-nums"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!section.rows?.length && (
                <p className="py-4 text-sm text-muted-foreground">
                  No records in this period.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
