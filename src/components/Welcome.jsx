import Button from "./Button";
import Brand from "./Brand";

export default function Welcome({ go }) {
  return (
    <main className="welcome">
      <div className="welcome-copy">
        <span className="kicker">SKILL FORGE / KNOWLEDGE LAB</span>
        <h1>
          Test your knowledge.
          <br />
          <em>Challenge yourself.</em>
        </h1>
        <p>
          A focused quiz experience for curious minds. Build momentum, trust
          your instincts, and see how far you can go.
        </p>
        <Button onClick={() => go("login")}>
          Get started <span>→</span>
        </Button>
      </div>
      <div className="welcome-mark">
        <Brand full />
        <small>LEARN / TEST / GROW</small>
      </div>
    </main>
  );
}
