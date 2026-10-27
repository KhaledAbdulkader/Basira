// Public model identifiers only; credentials stay in server-only entry points.
export const NVIDIA_MODEL = "google/gemma-4-31b-it";
export const NVIDIA_ASSISTANT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const NVIDIA_ASSISTANT_MODEL_LABEL = "Nemotron 3.5 Lightning";

export const NVIDIA_MODEL_CONFIG = {
  default: { environmentKey: "NVIDIA_MODEL", model: NVIDIA_MODEL },
  assistant: {
    environmentKey: "NVIDIA_ASSISTANT_MODEL",
    model: NVIDIA_ASSISTANT_MODEL,
  },
} as const;
