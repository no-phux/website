import { useState } from "react";
import { AGENT_START } from "../../lib/site";

export function AgentStart() {
  const [status, setStatus] = useState("");
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AGENT_START.prompt);
      setStatus("Agent prompt copied.");
    } catch {
      setStatus("Copy unavailable. Select the prompt and copy it manually.");
    }
  }
  return (
    <section className="overview-agent" aria-labelledby="use-an-agent">
      <h2 id="use-an-agent">Use an agent</h2>
      <div className="agent-prompt">
        <pre>{AGENT_START.prompt}</pre>
        <button type="button" onClick={copyPrompt}>Copy agent prompt</button>
        <span role="status" aria-live="polite">{status}</span>
      </div>
      <p className="agent-links">
        <a href="/agents#agent-setup">Agent integrations →</a>
        <a href="/agents#mcp">MCP →</a>
      </p>
      <p className="agent-search">
        {AGENT_START.search.text} <a href={AGENT_START.search.example}><code>{AGENT_START.search.example}</code></a>
      </p>
    </section>
  );
}
