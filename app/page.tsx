import { DeployPanel } from './ui/deploy-panel';
import { Boxes, CircleDollarSign } from 'lucide-react';

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="mark">
              <Boxes size={20} />
            </div>
            <span>LLAgents</span>
          </div>
          <h1>Deploy an app and edit it with agents.</h1>
          <p>
            Create an isolated live instance from a template, then hand changes
            to the coding agent without touching the platform runtime.
          </p>
        </div>
        <dl>
          <div>
            <dt>Runtime</dt>
            <dd>Docker Swarm service with Traefik routing</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>Private Git workspace cloned from a template</dd>
          </div>
          <div>
            <dt>First template</dt>
            <dd>Money app from llm-to-apps/money-template</dd>
          </div>
        </dl>
      </aside>

      <section className="main">
        <div className="topbar">
          <span className="pill">Private beta</span>
        </div>

        <div className="workspace">
          <header className="section-heading">
            <div>
              <h2>Application templates</h2>
              <p>Register a workspace owner and deploy the first live app.</p>
            </div>
          </header>

          <div className="deploy-grid">
            <article className="template">
              <div className="template-header">
                <div className="template-title">
                  <div className="template-icon">
                    <CircleDollarSign size={24} />
                  </div>
                  <div>
                    <h3>Money</h3>
                    <p>Personal finance dashboard with MySQL-backed data.</p>
                  </div>
                </div>
                <span className="tag">Ready</span>
              </div>

              <div className="meta">
                <div>
                  <span>Repository</span>
                  <strong>money-template</strong>
                </div>
                <div>
                  <span>App port</span>
                  <strong>3001</strong>
                </div>
                <div>
                  <span>Agent port</span>
                  <strong>7001</strong>
                </div>
              </div>
            </article>

            <DeployPanel />
          </div>
        </div>
      </section>
    </main>
  );
}
