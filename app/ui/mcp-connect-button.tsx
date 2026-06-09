'use client';

import { useState } from 'react';
import { ExternalLink, Plug, X } from 'lucide-react';

type McpConnectButtonProps = {
  mcpToken: string | null;
  mcpUrl: string;
};

export function McpConnectButton({ mcpToken, mcpUrl }: McpConnectButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);

  return (
    <>
      <button
        aria-label="Connect MCP to ChatGPT"
        className="mcp-connect-button"
        onClick={() => setIsOpen(true)}
        title="Connect MCP to ChatGPT"
        type="button"
      >
        <Plug size={16} />
      </button>

      {isOpen ? (
        <div className="modal-backdrop" onClick={() => setIsOpen(false)} role="presentation">
          <section
            aria-modal="true"
            className="mcp-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="mcp-modal-header">
              <div>
                <h2>Connect MCP to ChatGPT</h2>
                <p>Use this app MCP endpoint in a custom ChatGPT MCP app.</p>
              </div>
              <button aria-label="Close" onClick={() => setIsOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>

            <div className="mcp-modal-body">
              <p>
                ChatGPT must be able to reach the domain publicly. For local development,
                expose this URL through a tunnel first.
              </p>
              <label>
                MCP server URL
                <input readOnly value={mcpUrl} />
              </label>
              <label>
                Bearer token
                <span className="mcp-token-row">
                  <input
                    readOnly
                    type={showToken ? 'text' : 'password'}
                    value={mcpToken ?? 'Token is not available'}
                  />
                  <button onClick={() => setShowToken((currentValue) => !currentValue)} type="button">
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              <ol>
                <li>Open ChatGPT workspace settings and enable Developer mode.</li>
                <li>Create a custom MCP app.</li>
                <li>Paste the MCP server URL and configure Bearer token auth.</li>
                <li>Test the app and enable it in ChatGPT.</li>
              </ol>
              <a
                href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt"
                rel="noreferrer"
                target="_blank"
              >
                OpenAI MCP app instructions
                <ExternalLink size={14} />
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
