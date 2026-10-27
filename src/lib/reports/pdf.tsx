import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReportDetail } from "./contracts";
import { reportSections } from "./presentation";

const fontFile = (pkg: string, file: string) =>
  path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);
Font.register({
  family: "Basira",
  fonts: [
    {
      src: fontFile("noto-sans", "noto-sans-latin-400-normal.woff"),
      fontWeight: 400,
    },
    {
      src: fontFile("noto-sans", "noto-sans-latin-700-normal.woff"),
      fontWeight: 700,
    },
  ],
});
Font.register({
  family: "BasiraArabic",
  fonts: [
    {
      src: fontFile(
        "noto-sans-arabic",
        "noto-sans-arabic-arabic-400-normal.woff",
      ),
      fontWeight: 400,
    },
    {
      src: fontFile(
        "noto-sans-arabic",
        "noto-sans-arabic-arabic-700-normal.woff",
      ),
      fontWeight: 700,
    },
  ],
});
Font.registerHyphenationCallback((word) =>
  /^[A-Za-z0-9_-]{29,}$/.test(word) ? word.match(/.{1,18}/g)! : [word],
);
const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 48,
    paddingHorizontal: 42,
    fontFamily: "Basira",
    fontSize: 9,
    color: "#16313b",
  },
  brand: { fontSize: 11, fontWeight: 700, color: "#05838e", letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  business: {
    fontSize: 15,
    marginBottom: 10,
    fontFamily: ["Basira", "BasiraArabic"],
  },
  meta: { fontSize: 8, color: "#546b75", marginBottom: 4 },
  heading: {
    fontSize: 12,
    fontWeight: 700,
    color: "#087d88",
    marginTop: 16,
    marginBottom: 6,
  },
  note: { fontSize: 8, color: "#546b75", marginBottom: 7 },
  paragraph: { marginBottom: 7, fontFamily: ["Basira", "BasiraArabic"] },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dbe5e9",
    paddingVertical: 6,
  },
  header: { backgroundColor: "#edf5f6", fontWeight: 700 },
  cell: {
    paddingHorizontal: 6,
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 8,
    fontFamily: ["Basira", "BasiraArabic"],
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 42,
    right: 42,
    fontSize: 8,
    color: "#546b75",
    textAlign: "right",
  },
});
// Fonts and data are local. Never fetch URLs or embed user-controlled HTML/images.
export async function renderReportPdf(report: ReportDetail): Promise<Buffer> {
  const sections = reportSections(report);
  return renderToBuffer(
    <Document
      title={`Basira ${report.reportType.toLowerCase()} report`}
      author="Basira"
      creator="Basira"
      creationDate={new Date(report.createdAt)}
      modificationDate={new Date(report.aiCompletedAt ?? report.createdAt)}
      language="en"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>BASIRA / BUSINESS REPORT</Text>
        <Text style={styles.title}>
          {report.reportType.charAt(0) +
            report.reportType.slice(1).toLowerCase()}{" "}
          report
        </Text>
        <Text style={styles.business}>{report.businessName}</Text>
        <Text style={styles.meta}>
          Period: {report.from} - {report.to} | {report.currency} |{" "}
          {report.timezone}
        </Text>
        <Text style={styles.meta}>
          Generated: {report.createdAt.replace("T", " ").slice(0, 19)} UTC |
          Saved snapshot
        </Text>
        <Text style={styles.meta}>
          Intelligent Decision Support System with Predictive Analytics for
          Small Businesses
        </Text>
        {sections.map((section) => (
          <View key={section.title} wrap={false}>
            <Text style={styles.heading} minPresenceAhead={48}>
              {section.title}
            </Text>
            {section.note && <Text style={styles.note}>{section.note}</Text>}
            {section.paragraphs?.map((p, i) => (
              <Text key={i} style={styles.paragraph} orphans={2} widows={2}>
                {p}
              </Text>
            ))}
            {section.columns && (
              <View wrap={false} style={[styles.row, styles.header]}>
                {section.columns.map((col) => (
                  <Text key={col} style={styles.cell}>
                    {col}
                  </Text>
                ))}
              </View>
            )}
            {section.rows?.length === 0 && (
              <Text style={styles.paragraph}>No records in this period.</Text>
            )}
            {section.rows?.map((row, i) => (
              <View key={i} wrap={false} style={styles.row}>
                {row.map((cell, j) => (
                  <Text key={j} style={styles.cell}>
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Basira - Business insight, made clear.    |    ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>,
  );
}
