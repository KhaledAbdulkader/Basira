import type { Metadata } from "next";
import {
  RecordsPage,
  type RecordSearchParams,
} from "@/components/records/records-page";
export const metadata: Metadata = { title: "Products & services" };
export default function Page({
  searchParams,
}: {
  searchParams: RecordSearchParams;
}) {
  return <RecordsPage resource="products" searchParams={searchParams} />;
}
