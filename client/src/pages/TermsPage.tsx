import { Link } from "react-router-dom";
import { CONTACT_EMAIL, REPO_URL } from "../utils/site";

function TermsPage() {
  const contact = CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <>the team through the project's <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub page</a></>
  );

  return (
    <main className="page legal">
      <h1 className="h2 mb-1">Terms of use</h1>
      <p className="muted">Last updated November 17, 2026</p>

      <p>By creating an account or using Tier List you agree to these terms.</p>

      <h2 className="h5">Your account</h2>
      <p>
        Keep your login to yourself and give accurate information. You are responsible for what happens under your account.
        You must be old enough to agree to these terms where you live.
      </p>

      <h2 className="h5">What you post</h2>
      <p>
        You keep ownership of the templates, rankings and comments you post. By posting them you let the site store and display
        them to the audience you chose (public, unlisted or private). Only post things you have the right to share, and only link
        to images you may use.
      </p>

      <h2 className="h5">Rules</h2>
      <ul>
        <li>No harassment, hate, threats, or sexual content involving minors.</li>
        <li>No spam, scams, malware, or attempts to break or overload the site.</li>
        <li>No pretending to be someone else.</li>
      </ul>

      <h2 className="h5">Moderation</h2>
      <p>
        Moderators and admins can remove templates, rankings and comments that break these rules, and can ban accounts. If your
        content is removed you are notified and given the reason when one was given.
      </p>

      <h2 className="h5">No guarantees</h2>
      <p>
        Tier List is a student project. It is provided as is, without any promise that it will always be available or free of
        errors, and we may change or stop it at any time.
      </p>

      <h2 className="h5">Questions</h2>
      <p className="mb-0">
        Contact {contact}. See also the <Link to="/privacy">privacy policy</Link>.
      </p>
    </main>
  );
}

export default TermsPage;
