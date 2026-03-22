import { OpenClawLiveClient } from "./openclaw-live-client";
import type { ToolClient } from "./tool-client";

export function createToolClient(): ToolClient {
  return new OpenClawLiveClient();
}
