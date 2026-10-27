import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.");
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const registrationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter your name.")
      .max(80, "Use at most 80 characters."),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
