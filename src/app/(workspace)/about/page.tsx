import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Eye, ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/constants/brand";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "About Basira" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to overview
        </Link>
      </Button>
      <div>
        <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Made for small businesses
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          A little clarity goes a long way.
        </h1>
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          Basira is being built to help owners and managers make sense of
          everyday business information, without needing a background in
          analytics.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent>
            <Eye className="mb-4 text-primary" size={24} aria-hidden="true" />
            <h2 className="font-semibold">Understand before you act</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Clear explanations will connect your records to understandable
              metrics, trends, and customer feedback.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <ShieldCheck
              className="mb-4 text-primary"
              size={24}
              aria-hidden="true"
            />
            <h2 className="font-semibold">Support your judgment</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Forecasts and business suggestions are estimates. Basira supports
              decisions and does not replace professional advice.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent>
          <div className="flex items-start gap-4">
            <BookOpen
              className="mt-1 shrink-0 text-primary"
              size={22}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Graduation Project 2
              </p>
              <h2 className="mt-3 text-lg leading-7 font-semibold">
                {BRAND.academicTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                You are exploring the foundation preview. Navigation and
                appearance are available; accounts, business records, analytics,
                and AI features will arrive in subsequent releases.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
