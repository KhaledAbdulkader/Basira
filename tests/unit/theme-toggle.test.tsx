import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const theme = vi.hoisted(() => ({ resolvedTheme: "light", setTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => theme }));

describe("theme control", () => {
  beforeEach(() => {
    theme.resolvedTheme = "light";
  });

  it("is keyboard-operable and switches from light to dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Toggle color theme" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light", async () => {
    theme.resolvedTheme = "dark";
    render(<ThemeToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: "Toggle color theme" }),
    );
    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });
});
