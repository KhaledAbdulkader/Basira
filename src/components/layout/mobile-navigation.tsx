"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/sidebar";
import type { BusinessProfile } from "@/lib/business/constants";

export function MobileNavigation({
  businesses,
  selectedBusiness,
  isAdmin = false,
}: {
  businesses: BusinessProfile[];
  selectedBusiness: BusinessProfile | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[88vw] overflow-y-auto border-r border-border bg-sidebar shadow-xl">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Description className="sr-only">
            Explore your Basira workspace. Unavailable sections are marked
            coming soon.
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-5 right-2"
              aria-label="Close navigation"
            >
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
          <Sidebar
            isAdmin={isAdmin}
            businesses={businesses}
            selectedBusiness={selectedBusiness}
            onNavigate={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
