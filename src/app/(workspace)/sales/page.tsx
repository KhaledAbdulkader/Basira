import type { Metadata } from "next";
import {
  RecordsPage,
  type RecordSearchParams,
} from "@/components/records/records-page";
export const metadata: Metadata = { title: "Sales" };
export default function Page({
  searchParams,
}: {
  searchParams: RecordSearchParams;
}) {
  return <RecordsPage resource="sales" searchParams={searchParams} />;
}
